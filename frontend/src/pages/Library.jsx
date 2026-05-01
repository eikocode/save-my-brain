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
  bank: '🏦', credit_card: '💳', investment: '📈', mortgage: '🏠',
  insurance: '🛡️', receipt: '🧾', invoice: '📋', unknown: '📄',
  statement: '🏦', other: '📄',
};

const DOC_LABEL = {
  bank: 'Bank', credit_card: 'Credit Card', investment: 'Investment',
  mortgage: 'Mortgage', insurance: 'Insurance', receipt: 'Receipt',
  invoice: 'Invoice', statement: 'Statement', unknown: 'Document',
};

const SPENDING_TYPES = new Set(['credit_card', 'receipt', 'invoice', 'insurance']);
const ACCOUNT_TYPES = new Set(['bank', 'investment', 'mortgage', 'statement']);

const BRAND_ICONS = [
  [['hsbc', 'hang seng', 'hang_seng'], '🏦'],
  [['citibank', 'citi bank'], '🏦'],
  [['dbs', 'uob', 'ocbc', 'bea', 'boc', 'icbc', 'bnp', 'standard chartered', 'bank of'], '🏦'],
  [['american express', 'amex', 'american_express'], '💳'],
  [['visa', 'mastercard', 'diners'], '💳'],
  [['prudential', 'aia', 'manulife', 'axa', 'zurich', 'fwd', 'sun life', 'metlife', 'generali'], '🛡️'],
  [['firstrade', 'schwab', 'fidelity', 'td ameritrade', 'interactive broker', 'etrade', 'robinhood', 'webull', 'moomoo'], '📈'],
  [['paypal', 'alipay', 'wechat pay', 'payme'], '💸'],
  [['apple', 'google', 'microsoft', 'amazon', 'shopify'], '💻'],
  [['unknown'], '⚠️'],
];

function getFolderIcon(folder) {
  // Check entity slug AND display name so "Firstrade" matches even if slug is "apex_clearing_corporation"
  const entity = (folder.entity || '').toLowerCase();
  const displayName = (folder.display_name || '').toLowerCase();
  const types = folder.doc_types || [];
  for (const [keys, icon] of BRAND_ICONS) {
    if (keys.some(k => entity.includes(k) || displayName.includes(k))) return icon;
  }
  // Doc-type fallback
  if (types.includes('insurance')) return '🛡️';
  if (types.includes('investment')) return '📈';
  if (types.includes('bank') || types.includes('statement')) return '🏦';
  if (types.includes('credit_card')) return '💳';
  if (types.length === 1 && types[0] === 'receipt') return '🧾';
  return '📁';
}

const FINANCIAL_TYPES = new Set(['bank', 'credit_card', 'insurance', 'investment', 'mortgage', 'statement']);
const RECEIPT_TYPES = new Set(['receipt', 'invoice', 'unknown', 'other']);

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

function RenewalAlert({ alert, onDismiss }) {
  const { issuer, reference_number, expiry_date, days_remaining, doc_type } = alert;
  const expired = days_remaining < 0;
  const urgent = days_remaining <= 14;
  const color = expired ? 'rgba(180,60,60,0.4)' : urgent ? 'rgba(255,80,80,0.3)' : 'rgba(255,160,50,0.3)';
  const bgColor = expired ? 'rgba(180,60,60,0.07)' : urgent ? 'rgba(255,80,80,0.06)' : 'rgba(255,160,50,0.06)';
  const emoji = doc_type === 'insurance' ? '🛡️' : '📋';
  const label = expired
    ? `expired ${Math.abs(days_remaining)} day${Math.abs(days_remaining) === 1 ? '' : 's'} ago`
    : days_remaining === 0 ? 'expires today'
    : days_remaining === 1 ? 'expires tomorrow'
    : `expires in ${days_remaining} days`;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${bgColor}, transparent)`,
      border: `1px solid ${color}`,
      borderRadius: '14px',
      padding: '14px 18px',
      marginBottom: '10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
        <span style={{ fontSize: '18px' }}>{emoji}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            {issuer}{reference_number ? ` · ${reference_number}` : ''}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Renewal {label} · {expiry_date}
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: '16px', cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}
        title="Dismiss"
      >✕</button>
    </div>
  );
}

function MergeSuggestion({ suggestion, onYes, onNo }) {
  const { new_issuer, existing_issuer } = suggestion;
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,200,80,0.08), rgba(255,200,80,0.04))',
      border: '1px solid rgba(255,200,80,0.3)',
      borderRadius: '14px',
      padding: '16px 20px',
      marginBottom: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '20px' }}>🤔</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
            Are these the same institution?
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            I found <strong style={{ color: 'var(--color-text)' }}>"{new_issuer}"</strong> which looks similar to an existing folder <strong style={{ color: 'var(--color-text)' }}>"{existing_issuer}"</strong>. Should I merge them into one folder?
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', paddingLeft: '30px' }}>
        <button
          onClick={onYes}
          style={{ padding: '6px 18px', borderRadius: '8px', border: 'none', background: 'var(--color-accent)', color: '#000', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
        >
          Yes, merge
        </button>
        <button
          onClick={onNo}
          style={{ padding: '6px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer' }}
        >
          No, keep separate
        </button>
      </div>
    </div>
  );
}

export default function Library() {
  const { lang } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const greeting = getGreeting();
  const fileInputRef = useRef(null);

  // Views: 'folders' | 'folder-detail' | 'search'
  const [view, setView] = useState('folders');
  const [sortBy, setSortBy] = useState('recent');
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
  const [pageDropActive, setPageDropActive] = useState(false);
  const dragCounter = useRef(0);
  const handleUploadRef = useRef(null);
  const [mergeSuggestions, setMergeSuggestions] = useState([]);
  const [renewalAlerts, setRenewalAlerts] = useState([]);

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef(null);

  // Misc
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [quoteOfDay, setQuoteOfDay] = useState(null);

  useEffect(() => {
    apiFetch('/api/alerts/renewals').then(r => r?.json()).then(data => {
      if (Array.isArray(data)) setRenewalAlerts(data);
    }).catch(() => {});
  }, []);

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

  // Page-wide drag & drop — show overlay when files dragged over window
  useEffect(() => {
    const onDragEnter = (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      dragCounter.current++;
      setPageDropActive(true);
    };
    const onDragLeave = () => {
      dragCounter.current--;
      if (dragCounter.current === 0) setPageDropActive(false);
    };
    const onDragOver = (e) => { e.preventDefault(); };
    const onDrop = (e) => {
      e.preventDefault();
      dragCounter.current = 0;
      setPageDropActive(false);
      if (uploading) return;
      const files = e.dataTransfer.files;
      if (files.length > 0) handleUploadRef.current?.(files);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [uploading]);

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
    const failedErrors = [];

    const uploadOne = (file) =>
      new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBase}/api/documents/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.onload = () => {
          if (xhr.status === 409) { resolve({ __dupe: true, file }); return; }
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve({ ...JSON.parse(xhr.responseText), file }); } catch { resolve({ file }); }
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(Object.assign(new Error(err.detail?.message || err.detail || `Failed (${xhr.status})`), { file }));
            } catch { reject(Object.assign(new Error(`Failed (${xhr.status})`), { file })); }
          }
        };
        xhr.onerror = () => reject(Object.assign(new Error('Network error'), { file }));
        xhr.send(formData);
      });

    // Upload files one at a time — OAuth mode runs claude CLI per file,
    // and concurrent Claude processes conflict with each other.
    for (const file of fileList) {
      let outcome;
      try { outcome = { status: 'fulfilled', value: await uploadOne(file) }; }
      catch (err) { outcome = { status: 'rejected', reason: err }; }

      if (outcome.status === 'fulfilled') {
        const result = outcome.value;
        if (result?.__dupe) dupes++;
        else {
          done++;
          if (result?.suggested_merge) {
            setMergeSuggestions(prev => {
              const key = result.suggested_merge.pair_key;
              if (prev.find(s => s.pair_key === key)) return prev;
              return [...prev, result.suggested_merge];
            });
          }
        }
      } else {
        failed++;
        const err = outcome.reason;
        failedErrors.push(`${err?.file?.name || 'file'}: ${err.message}`);
        console.error('Upload failed:', err);
      }
      setUploadProgress({ done, total: fileList.length, failed, dupes,
        pct: Math.round(((done + failed + dupes) / fileList.length) * 100) });
    }

    setUploading(false);
    if (dupes > 0 && failed === 0 && done === 0) {
      alert('Already saved — this document was uploaded before.');
    } else if (dupes > 0 || failed > 0) {
      const parts = [];
      if (done > 0) parts.push(`${done} uploaded`);
      if (dupes > 0) parts.push(`${dupes} already saved`);
      if (failed > 0) {
        parts.push(`${failed} failed`);
        if (failedErrors.length > 0) parts.push(`\n\nDetails:\n${failedErrors.join('\n')}`);
      }
      alert(parts.join(', ') + '.');
    }
    loadFolders();
    // If currently inside a folder detail view, refresh it too so new docs appear
    if (view === 'folder-detail' && activeFolder) {
      openFolder(activeFolder, folderPage);
    }
  }
  // Always keep ref pointing to latest handleUpload so the page-wide
  // drop listener (which can't track state changes) always has fresh closures
  handleUploadRef.current = handleUpload;

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
      {/* Page-wide drop overlay */}
      {pageDropActive && !uploading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(11, 19, 38, 0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '16px',
          border: '3px dashed var(--color-accent)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '56px' }}>📎</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-accent)' }}>
            Drop to upload
          </div>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Multiple files supported
          </div>
        </div>
      )}
      <div className="dash-content">

        {/* ── Greeting ── */}
        <div className="dash-greeting">
          <h1><span>{greeting.emoji}</span> <span>{greeting.text}, {user?.name || 'there'}</span></h1>
        </div>

        {/* ── Renewal Alerts ── */}
        {renewalAlerts.map(a => (
          <RenewalAlert
            key={a.id}
            alert={a}
            onDismiss={() => setRenewalAlerts(prev => prev.filter(x => x.id !== a.id))}
          />
        ))}

        {/* ── Merge Suggestions ── */}
        {mergeSuggestions.map(s => (
          <MergeSuggestion
            key={s.pair_key}
            suggestion={s}
            onYes={async () => {
              await apiFetch('/api/entities/merge', { method: 'POST', body: JSON.stringify({ from_entity: s.new_entity, to_entity: s.existing_entity }) });
              setMergeSuggestions(prev => prev.filter(x => x.pair_key !== s.pair_key));
              loadFolders();
            }}
            onNo={async () => {
              await apiFetch('/api/entities/dismiss-merge', { method: 'POST', body: JSON.stringify({ pair_key: s.pair_key }) });
              setMergeSuggestions(prev => prev.filter(x => x.pair_key !== s.pair_key));
            }}
          />
        ))}

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
              <span>{uploadProgress.pct < 70 ? `Uploading… ${uploadProgress.pct}%` : `Extracting data… ${uploadProgress.done} / ${uploadProgress.total} done`}</span>
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
              <span style={{ fontWeight: 600 }}>{getFolderIcon(activeFolder)} {activeFolder.display_name}</span>
              <span style={{ color: 'var(--color-text-faint)', fontSize: '13px' }}>({folderTotal} docs)</span>
            </div>
            {folderLoading ? (
              <div className="dash-empty">Loading…</div>
            ) : folderDocs.length === 0 ? (
              <div className="dash-empty">No documents in this folder.</div>
            ) : (
              <GroupedDocList docs={folderDocs} expandedDoc={expandedDoc} setExpandedDoc={setExpandedDoc} onDelete={handleDelete} />
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
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {[['recent', 'Recent'], ['name', 'A–Z'], ['amount', 'Amount']].map(([val, label]) => (
                    <button key={val} onClick={() => setSortBy(val)} style={{
                      padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      border: '1px solid var(--color-border)', cursor: 'pointer',
                      background: sortBy === val ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: sortBy === val ? 'white' : 'var(--color-text-muted)',
                    }}>{label}</button>
                  ))}
                </div>
                {(() => {
                  const sorted = [...folders].sort((a, b) => {
                    if (sortBy === 'name') return a.display_name.localeCompare(b.display_name);
                    if (sortBy === 'amount') return b.total_amount - a.total_amount;
                    return b.last_updated.localeCompare(a.last_updated);
                  });
                  const institutions = sorted.filter(f =>
                    (f.breakdown || []).some(b => FINANCIAL_TYPES.has(b.doc_type))
                  );
                  const merchants = sorted.filter(f =>
                    (f.breakdown || []).every(b => RECEIPT_TYPES.has(b.doc_type))
                  );
                  const SectionGrid = ({ items }) => (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                      {items.map(folder => (
                        <FolderCard key={folder.entity} folder={folder} onClick={() => openFolder(folder)} />
                      ))}
                    </div>
                  );
                  return (
                    <>
                      {institutions.length > 0 && <SectionGrid items={institutions} />}
                      {merchants.length > 0 && (
                        <>
                          <div style={{ marginTop: '28px', marginBottom: '10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-faint)' }}>
                            Merchants & Receipts
                          </div>
                          <SectionGrid items={merchants} />
                        </>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}

      </div>
    </Layout>
  );
}

function FolderCard({ folder, onClick }) {
  const isUnknown = folder.entity === 'unknown';
  const breakdown = folder.breakdown || [];
  const spendingTotal = folder.spending_total || 0;
  const cur = folder.currency || 'HKD';
  const icon = getFolderIcon(folder);

  // Type pills — deduplicated, human-readable
  const typePills = breakdown.map(b => ({ label: DOC_LABEL[b.doc_type] || b.doc_type, count: b.count }));

  return (
    <div onClick={onClick} style={{
      background: 'var(--color-surface)',
      border: `1px solid ${isUnknown ? 'rgba(255,200,0,0.2)' : 'var(--color-border)'}`,
      borderRadius: '16px', padding: '20px', cursor: 'pointer',
      transition: 'border-color 0.15s, transform 0.12s, box-shadow 0.15s',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(125,208,255,0.35)';
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = isUnknown ? 'rgba(255,200,0,0.2)' : 'var(--color-border)';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Icon + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '26px', lineHeight: 1 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {folder.display_name}
        </div>
      </div>

      {/* Type pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {typePills.map(({ label, count }) => (
          <span key={label} style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
            borderRadius: '999px', background: 'rgba(125,208,255,0.08)',
            color: 'var(--color-text-muted)', border: '1px solid rgba(125,208,255,0.12)',
          }}>
            {count > 1 ? `${count} ` : ''}{label}
          </span>
        ))}
      </div>

      {/* Spending total */}
      {spendingTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
            {cur} {spendingTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-faint)' }}>spent</span>
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: 'auto' }}>
        {folder.doc_count} doc{folder.doc_count !== 1 ? 's' : ''} · {folder.last_updated}
      </div>
    </div>
  );
}

function GroupedDocList({ docs, expandedDoc, setExpandedDoc, onDelete }) {
  const TYPE_ORDER = ['credit_card', 'bank', 'investment', 'mortgage', 'insurance', 'receipt', 'invoice', 'statement', 'unknown', 'other'];
  const groups = {};
  for (const doc of docs) {
    const t = doc.doc_type || 'unknown';
    if (!groups[t]) groups[t] = [];
    groups[t].push(doc);
  }
  const sortedTypes = TYPE_ORDER.filter(t => groups[t]);
  // If only one type, no need for section headers
  if (sortedTypes.length <= 1) {
    return <DocList docs={docs} expandedDoc={expandedDoc} setExpandedDoc={setExpandedDoc} onDelete={onDelete} />;
  }
  return (
    <>
      {sortedTypes.map(type => {
        const typeDocs = groups[type];
        const subtotal = typeDocs.reduce((s, d) => s + (d.total || 0), 0);
        const cur = typeDocs[0]?.currency || 'HKD';
        const isSpending = SPENDING_TYPES.has(type);
        return (
          <div key={type} style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '16px' }}>{DOC_EMOJI[type] || '📄'}</span>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>{DOC_LABEL[type] || type}</span>
              <span style={{ fontSize: '12px', color: 'var(--color-text-faint)' }}>{typeDocs.length} doc{typeDocs.length !== 1 ? 's' : ''}</span>
              {isSpending && subtotal > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 600, color: 'var(--color-accent)' }}>
                  {cur} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              )}
              {!isSpending && (
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-faint)' }}>statements only</span>
              )}
            </div>
            <DocList docs={typeDocs} expandedDoc={expandedDoc} setExpandedDoc={setExpandedDoc} onDelete={onDelete} />
          </div>
        );
      })}
    </>
  );
}

function DocCard({ doc, isExpanded, onToggle, onDelete }) {
  const emoji = DOC_EMOJI[doc.doc_type] || '📄';
  const displayName = doc.issuer || doc.filename || 'Document';
  const [transactions, setTransactions] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!isExpanded || transactions !== null) return;
    setLoadingDetail(true);
    Promise.all([
      apiFetch(`/api/documents/${doc.id}/transactions`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/documents/${doc.id}/holdings`).then(r => r.json()).catch(() => []),
    ]).then(([txns, hold]) => {
      setTransactions(txns);
      setHoldings(hold);
      setLoadingDetail(false);
    });
  }, [isExpanded, doc.id, transactions]);

  const DIR_ICON = { expense: '↑', income: '↓' };
  const DIR_COLOR = { expense: 'var(--color-text-muted)', income: '#10b981' };

  return (
    <div className="dash-doc-card" onClick={onToggle}>
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

      {/* Summary — always visible */}
      {doc.summary && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.6, marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
          {doc.summary}
        </div>
      )}

      {/* Expanded: transactions + holdings */}
      {isExpanded && (
        <div style={{ marginTop: '12px' }} onClick={e => e.stopPropagation()}>
          {loadingDetail && <div style={{ fontSize: '12px', color: 'var(--color-text-faint)', padding: '8px 0' }}>Loading details…</div>}

          {/* Holdings */}
          {holdings?.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-faint)', marginBottom: '6px' }}>Accounts & Holdings</div>
              {holdings.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{h.name || h.account || h.type || '—'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                    {h.currency || doc.currency} {Number(h.balance ?? h.value ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Transactions */}
          {transactions?.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-faint)', marginBottom: '6px' }}>
                Transactions ({transactions.length})
              </div>
              {transactions.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--color-text-faint)', flexShrink: 0, minWidth: '80px' }}>{t.date}</span>
                  <span style={{ flex: 1, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-faint)', flexShrink: 0 }}>{t.category}</span>
                  <span style={{ fontWeight: 600, flexShrink: 0, color: DIR_COLOR[t.direction] || 'var(--color-text)' }}>
                    {DIR_ICON[t.direction] || ''} {t.currency} {Number(t.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
          {transactions?.length === 0 && holdings?.length === 0 && !loadingDetail && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-faint)', padding: '4px 0' }}>No transactions extracted from this document.</div>
          )}
        </div>
      )}

      {/* Expand/collapse hint */}
      <div style={{ fontSize: '11px', color: 'var(--color-text-faint)', marginTop: '8px', textAlign: 'right' }}>
        {isExpanded ? '▲ less' : '▼ transactions & holdings'}
      </div>
    </div>
  );
}

function DocList({ docs, expandedDoc, setExpandedDoc, onDelete }) {
  return (
    <div className="dash-doc-list">
      {docs.map(doc => (
        <DocCard
          key={doc.id}
          doc={doc}
          isExpanded={expandedDoc === doc.id}
          onToggle={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
          onDelete={onDelete}
        />
      ))}
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
