import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, getToken, getUser, clearAuth } from '../auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import Layout from '../components/Layout';

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It is not enough to be busy. The question is: what are we busy about?", author: "Henry David Thoreau" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "Beware the barrenness of a busy life.", author: "Socrates" },
  { text: "The key is not to prioritise what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Almost everything will work again if you unplug it for a few minutes — including you.", author: "Anne Lamott" },
  { text: "The best way to predict your future is to create it.", author: "Abraham Lincoln" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "The most precious resource we all have is time.", author: "Steve Jobs" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "Work smarter, not harder.", author: "Allan F. Mogensen" },
  { text: "The art of knowing is knowing what to ignore.", author: "Rumi" },
];

const DOC_EMOJI = {
  bank_statement: '🏦', credit_card: '💳', insurance: '🛡️',
  legal: '⚖️', medical: '🏥', contract: '📋', receipt: '🧾',
  mortgage: '🏠', utility: '💡', id_document: '🪪', tax: '📊',
  school: '🎓', travel: '✈️', hotel: '🏨', event: '📅',
  bank: '🏦', statement: '🏦', analysis: '📊', other: '📄', unknown: '📄',
};

const FOLDER_EMOJI = {
  american_express: '💳', amex: '💳', hsbc: '🏦', hang_seng: '🏦',
  aia: '🛡️', prudential: '🛡️', manulife: '🛡️',
  unknown: '⚠️',
};

function getFolderEmoji(entity) {
  const key = (entity || '').toLowerCase();
  for (const [k, v] of Object.entries(FOLDER_EMOJI)) {
    if (key.includes(k)) return v;
  }
  if (key === 'unknown') return '⚠️';
  return '📁';
}

function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  return { text: 'Good evening', emoji: '🌙' };
}

const PAGE_LIMIT = 20;

export default function Library() {
  const { lang } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const greeting = getGreeting();
  const fileInputRef = useRef(null);

  // Views: 'folders' | 'folder-detail' | 'search'
  const [view, setView] = useState('folders');
  const [folders, setFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(true);

  // Folder detail
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderDocs, setFolderDocs] = useState([]);
  const [folderPage, setFolderPage] = useState(1);
  const [folderTotal, setFolderTotal] = useState(0);
  const [folderPages, setFolderPages] = useState(1);
  const [folderLoading, setFolderLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchPages, setSearchPages] = useState(1);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, failed: 0, dupes: 0, pct: 0 });
  const [dragOver, setDragOver] = useState(false);

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef(null);

  // Misc
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [quoteOfDay, setQuoteOfDay] = useState(null);

  useEffect(() => {
    loadFolders();
    const INTERVAL_MS = 24 * 60 * 60 * 1000;
    const lastShown = parseInt(localStorage.getItem('smb_quote_ts') || '0', 10);
    if (Date.now() - lastShown >= INTERVAL_MS) {
      setQuoteOfDay(randomQuote());
      localStorage.setItem('smb_quote_ts', String(Date.now()));
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadFolders() {
    setFoldersLoading(true);
    try {
      const res = await apiFetch('/api/folders');
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch { setFolders([]); }
    setFoldersLoading(false);
  }

  async function openFolder(folder, page = 1) {
    setActiveFolder(folder);
    setView('folder-detail');
    setFolderPage(page);
    setFolderLoading(true);
    try {
      const res = await apiFetch(`/api/folders/${encodeURIComponent(folder.entity)}/documents?page=${page}&limit=${PAGE_LIMIT}`);
      const data = await res.json();
      setFolderDocs(data.docs || []);
      setFolderTotal(data.total || 0);
      setFolderPages(data.pages || 1);
    } catch { setFolderDocs([]); }
    setFolderLoading(false);
  }

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setView('folders');
      setSearchResults([]);
      return;
    }
    setView('search');
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(searchQuery, 1), 350);
  }, [searchQuery]);

  async function runSearch(q, page) {
    setSearchLoading(true);
    try {
      const res = await apiFetch(`/api/documents/search?q=${encodeURIComponent(q)}&page=${page}&limit=${PAGE_LIMIT}`);
      const data = await res.json();
      setSearchResults(data.docs || []);
      setSearchTotal(data.total || 0);
      setSearchPage(page);
      setSearchPages(data.pages || 1);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  }

  async function handleDelete(e, docId) {
    e.stopPropagation();
    if (!confirm('Delete this document and all its data?')) return;
    try {
      await apiFetch(`/api/documents/${docId}`, { method: 'DELETE' });
      setFolderDocs(prev => prev.filter(d => d.id !== docId));
      setSearchResults(prev => prev.filter(d => d.id !== docId));
      if (expandedDoc === docId) setExpandedDoc(null);
      // Refresh folder count
      loadFolders();
    } catch { alert('Could not delete. Please try again.'); }
  }

  async function handleUpload(files) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setUploading(true);
    setUploadProgress({ done: 0, total: fileList.length, failed: 0, dupes: 0, pct: 0 });

    const token = getToken();
    const apiBase = import.meta.env.VITE_API_URL || '';
    let done = 0, failed = 0, dupes = 0;

    const uploadWithProgress = (file, fileIndex) =>
      new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBase}/api/documents/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const overallPct = Math.round(((fileIndex + (e.loaded / e.total) * 0.7) / fileList.length) * 100);
            setUploadProgress(prev => ({ ...prev, pct: overallPct }));
          }
        };
        xhr.onload = () => {
          const processingPct = Math.round(((fileIndex + 0.85) / fileList.length) * 100);
          setUploadProgress(prev => ({ ...prev, pct: processingPct }));
          if (xhr.status === 409) { resolve({ __dupe: true }); return; }
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.detail?.message || err.detail || `Failed (${xhr.status})`));
            } catch { reject(new Error(`Failed (${xhr.status})`)); }
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

    for (let i = 0; i < fileList.length; i++) {
      try {
        const result = await uploadWithProgress(fileList[i], i);
        if (result?.__dupe) dupes++;
        else done++;
      } catch (e) {
        failed++;
        console.error('Upload failed:', e);
      }
      setUploadProgress({ done, total: fileList.length, failed, dupes, pct: Math.round(((i + 1) / fileList.length) * 100) });
    }

    setUploading(false);
    if (dupes > 0 && failed === 0 && done === 0) {
      alert('Already saved — this document was uploaded before.');
    } else if (dupes > 0 || failed > 0) {
      const parts = [];
      if (done > 0) parts.push(`${done} uploaded`);
      if (dupes > 0) parts.push(`${dupes} already saved`);
      if (failed > 0) parts.push(`${failed} failed`);
      alert(parts.join(', ') + '.');
    }
    loadFolders();
  }

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (items && items[0]?.webkitGetAsEntry) {
      const allFiles = [];
      const readEntry = (entry) => new Promise((resolve) => {
        if (entry.isFile) { entry.file(f => { allFiles.push(f); resolve(); }); }
        else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(async (entries) => {
            for (const e of entries) await readEntry(e);
            resolve();
          });
        } else { resolve(); }
      });
      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) await readEntry(entry);
      }
      if (allFiles.length > 0) { handleUpload(allFiles); return; }
    }
    handleUpload(e.dataTransfer.files);
  }, []);

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);

  async function handleChat(e) {
    e?.preventDefault();
    if (!chatInput.trim() || chatSending) return;
    const msg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    setChatInput('');
    setChatSending(true);
    try {
      const res = await apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ message: msg, mode: 'qa' }) });
      const data = await res.json();
      if (data.message) setChatMessages(prev => [...prev, { role: 'bot', text: data.message }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'bot', text: 'Sorry, something went wrong.' }]);
    }
    setChatSending(false);
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    return (
      <div className="mobile-hub">
        <div className="mobile-hub-inner">
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🧠</div>
          <h1 className="mobile-hub-greeting">{greeting.emoji} {greeting.text}, {user?.name || 'there'}</h1>
          <p className="mobile-hub-sub">Your brain lives on Telegram.</p>
          <a href="https://t.me/savemybraintest_bot" className="mobile-hub-cta">Open Telegram ✈️</a>
          <div className="mobile-hub-tips">
            <div>📎 Upload docs in Telegram</div>
            <div>💬 Ask questions in Telegram</div>
            <div>🔔 Alerts sent to Telegram</div>
          </div>
          <div className="mobile-hub-links">
            <a href="/settings">⚙️ Settings</a>
            <button onClick={() => { clearAuth(); navigate('/'); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', fontSize: '14px' }}>Log out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="dash-content">

        {/* ── Greeting ── */}
        <div className="dash-greeting">
          <h1><span>{greeting.emoji}</span> <span>{greeting.text}, {user?.name || 'there'}</span></h1>
        </div>

        {/* ── Quote ── */}
        {quoteOfDay && (
          <div style={{ background: 'linear-gradient(135deg, rgba(125,208,255,0.07), rgba(125,208,255,0.03))', border: '1px solid rgba(125,208,255,0.15)', borderRadius: '12px', padding: '14px 18px', marginBottom: '12px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            💡 <em>"{quoteOfDay.text}"</em>
            <span style={{ display: 'block', marginTop: '4px', color: 'var(--color-accent)', fontWeight: 500 }}>— {quoteOfDay.author}</span>
          </div>
        )}

        {/* ── Chat ── */}
        {chatMessages.length > 0 && (
          <div className="dash-chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`dash-chat-msg ${msg.role}`}>
                <div className="dash-chat-bubble" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }} />
              </div>
            ))}
            {chatSending && <div className="dash-chat-msg bot"><div className="dash-chat-bubble">Thinking...</div></div>}
            <div ref={chatEndRef} />
          </div>
        )}

        <form className="dash-chat-input-wrap" onSubmit={handleChat}>
          <input className="dash-chat-input" value={chatInput} onChange={e => setChatInput(e.target.value)}
            placeholder={lang === 'zh-tw' ? '有什麼可以幫你？' : 'Ask about your documents…'} disabled={chatSending} />
          <button type="submit" className="dash-chat-send" disabled={!chatInput.trim() || chatSending}>↑</button>
        </form>

        {/* ── Upload Zone ── */}
        <div className="dash-upload" onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{ borderColor: dragOver ? 'var(--color-accent)' : undefined, background: dragOver ? 'var(--color-accent-glow)' : undefined, cursor: uploading ? 'default' : 'pointer' }}>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.webp"
            onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} />
          {uploading ? (
            <div className="dash-upload-progress">
              <span>🔄</span>
              <span>{uploadProgress.pct < 100 ? `Uploading… ${uploadProgress.pct}%` : `Processing ${uploadProgress.done} / ${uploadProgress.total}…`}</span>
              <div className="dash-upload-bar">
                <div className="dash-upload-bar-fill" style={{ width: `${uploadProgress.pct}%`, transition: 'width 0.2s ease' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--color-text-faint)' }}>
                {uploadProgress.done > 0 && `${uploadProgress.done} done`}
                {uploadProgress.dupes > 0 && ` · ${uploadProgress.dupes} already saved`}
                {uploadProgress.failed > 0 && ` · ${uploadProgress.failed} failed`}
              </span>
            </div>
          ) : (
            <>
              <span className="dash-upload-icon">📎</span>
              <span>{lang === 'zh-tw' ? '拖放文件或點擊上傳（支援批量）' : 'Drop files or click to upload — bulk supported'}</span>
            </>
          )}
        </div>

        {/* ── Search ── */}
        <div className="dash-search-wrap" style={{ marginBottom: '20px' }}>
          <span className="dash-search-icon">🔍</span>
          <input className="dash-search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={lang === 'zh-tw' ? '搜尋所有文件…' : 'Search all documents…'} />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', padding: '0 8px' }}>✕</button>
          )}
        </div>

        {/* ── SEARCH RESULTS ── */}
        {view === 'search' && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--color-text-faint)', marginBottom: '12px' }}>
              {searchLoading ? 'Searching…' : `${searchTotal} result${searchTotal !== 1 ? 's' : ''} for "${searchQuery}"`}
            </div>
            {!searchLoading && searchResults.length === 0 && (
              <div className="dash-empty">No documents match your search.</div>
            )}
            {searchResults.length > 0 && (
              <DocList docs={searchResults} expandedDoc={expandedDoc} setExpandedDoc={setExpandedDoc} onDelete={handleDelete} />
            )}
            {searchPages > 1 && (
              <Pagination page={searchPage} pages={searchPages} onPage={p => { setSearchPage(p); runSearch(searchQuery, p); }} />
            )}
          </>
        )}

        {/* ── FOLDER DETAIL ── */}
        {view === 'folder-detail' && activeFolder && (
          <>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => { setView('folders'); setActiveFolder(null); setFolderDocs([]); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '14px', padding: 0 }}>
                ← All Folders
              </button>
              <span style={{ color: 'var(--color-text-faint)' }}>/</span>
              <span style={{ fontWeight: 600 }}>{getFolderEmoji(activeFolder.entity)} {activeFolder.display_name}</span>
              <span style={{ color: 'var(--color-text-faint)', fontSize: '13px' }}>({folderTotal} docs)</span>
            </div>
            {folderLoading ? (
              <div className="dash-empty">Loading…</div>
            ) : folderDocs.length === 0 ? (
              <div className="dash-empty">No documents in this folder.</div>
            ) : (
              <DocList docs={folderDocs} expandedDoc={expandedDoc} setExpandedDoc={setExpandedDoc} onDelete={handleDelete} />
            )}
            {folderPages > 1 && (
              <Pagination page={folderPage} pages={folderPages} onPage={p => openFolder(activeFolder, p)} />
            )}
          </>
        )}

        {/* ── FOLDER GRID ── */}
        {view === 'folders' && (
          <>
            {foldersLoading ? (
              <div className="dash-empty">Loading your folders…</div>
            ) : folders.length === 0 ? (
              <div className="dash-empty">
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
                No documents yet — upload your first one above.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {folders.map(folder => (
                  <FolderCard key={folder.entity} folder={folder} onClick={() => openFolder(folder)} />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </Layout>
  );
}

function FolderCard({ folder, onClick }) {
  const isUnknown = folder.entity === 'unknown';
  return (
    <div onClick={onClick} style={{
      background: 'var(--color-surface)', border: `1px solid ${isUnknown ? 'rgba(255,200,0,0.2)' : 'var(--color-border)'}`,
      borderRadius: '14px', padding: '18px', cursor: 'pointer',
      transition: 'border-color 0.15s, transform 0.1s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isUnknown ? 'rgba(255,200,0,0.2)' : 'var(--color-border)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ fontSize: '28px', marginBottom: '10px' }}>{getFolderEmoji(folder.entity)}</div>
      <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {folder.display_name}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-faint)', marginBottom: '8px' }}>
        {folder.doc_count} doc{folder.doc_count !== 1 ? 's' : ''} · {folder.last_updated}
      </div>
      {folder.total_amount > 0 && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-accent)' }}>
          {folder.currency} {folder.total_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
      )}
    </div>
  );
}

function DocList({ docs, expandedDoc, setExpandedDoc, onDelete }) {
  return (
    <div className="dash-doc-list">
      {docs.map(doc => {
        const emoji = DOC_EMOJI[doc.doc_type] || '📄';
        const isExpanded = expandedDoc === doc.id;
        const displayName = doc.issuer || doc.filename || 'Document';
        return (
          <div key={doc.id} className="dash-doc-card" onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}>
            <div className="dash-doc-header">
              <span className="dash-doc-emoji">{emoji}</span>
              <div className="dash-doc-info">
                <div className="dash-doc-name">{displayName}</div>
                <div className="dash-doc-meta">
                  <span className="dash-doc-badge">{(doc.doc_type || 'other').replace('_', ' ')}</span>
                  {doc.doc_date && <span>{doc.doc_date}</span>}
                  {doc.total > 0 && <span>{doc.currency} {doc.total?.toLocaleString()}</span>}
                </div>
              </div>
              <button onClick={(e) => onDelete(e, doc.id)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', fontSize: '16px', padding: '4px 8px', borderRadius: '6px', flexShrink: 0 }}
                title="Delete">🗑️</button>
            </div>
            {isExpanded && doc.summary && (
              <div className="dash-doc-detail">
                <p>{doc.summary}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Pagination({ page, pages, onPage }) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '20px', alignItems: 'center' }}>
      <button onClick={() => onPage(page - 1)} disabled={page <= 1}
        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'none', color: page <= 1 ? 'var(--color-text-faint)' : 'var(--color-text)', cursor: page <= 1 ? 'default' : 'pointer' }}>
        ←
      </button>
      <span style={{ fontSize: '13px', color: 'var(--color-text-faint)' }}>Page {page} of {pages}</span>
      <button onClick={() => onPage(page + 1)} disabled={page >= pages}
        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'none', color: page >= pages ? 'var(--color-text-faint)' : 'var(--color-text)', cursor: page >= pages ? 'default' : 'pointer' }}>
        →
      </button>
    </div>
  );
}
