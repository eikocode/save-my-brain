/**
 * Library.jsx — Chat-first dashboard (v3)
 *
 * Layout: Greeting → Chat input → Upload zone → Documents
 * Inspired by Claude/Gemini chat UI — greet user by name, chat inline.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, getToken, getUser, clearAuth } from '../auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import Layout from '../components/Layout';

const DOC_EMOJI = {
  bank_statement: '🏦', credit_card: '💳', insurance: '🛡️',
  legal: '⚖️', medical: '🏥', contract: '📋', receipt: '🧾',
  mortgage: '🏠', utility: '💡', id_document: '🪪', tax: '📊',
  school: '🎓', travel: '✈️', hotel: '🏨', event: '📅',
  bank: '🏦', analysis: '📊', other: '📄',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  return { text: 'Good evening', emoji: '🌙' };
}

export default function Library() {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const greeting = getGreeting();

  const [docs, setDocs] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const fileInputRef = useRef(null);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadDocs(), loadFamilyMembers()]);
    setLoading(false);
  }

  async function loadDocs() {
    try {
      const res = await apiFetch('/api/documents');
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch { setDocs([]); }
  }

  async function loadFamilyMembers() {
    try {
      const res = await apiFetch('/api/users/family-members');
      const data = await res.json();
      setFamilyMembers(Array.isArray(data) ? data : []);
    } catch { setFamilyMembers([]); }
  }

  async function handleUpload(files) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setUploading(true);
    setUploadProgress({ done: 0, total: fileList.length, failed: 0 });

    const token = getToken();
    const apiBase = import.meta.env.VITE_API_URL || '';
    let done = 0;
    let failed = 0;

    // Process in parallel batches of 3
    const BATCH_SIZE = 3;
    for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
      const batch = fileList.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          const resp = await fetch(`${apiBase}/api/documents/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail?.message || err.detail || `Failed (${resp.status})`);
          }
          return resp.json();
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') done++;
        else { failed++; console.error('Upload failed:', r.reason); }
      }
      setUploadProgress({ done, total: fileList.length, failed });
    }

    setUploading(false);
    if (failed > 0) {
      alert(`${done} uploaded, ${failed} failed.`);
    }
    setTimeout(loadAll, 1000);
  }

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    // Support folder drops via webkitGetAsEntry
    const items = e.dataTransfer.items;
    if (items && items[0]?.webkitGetAsEntry) {
      const allFiles = [];
      const readEntry = (entry) => new Promise((resolve) => {
        if (entry.isFile) {
          entry.file(f => { allFiles.push(f); resolve(); });
        } else if (entry.isDirectory) {
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
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg, mode: 'qa' }),
      });
      const data = await res.json();
      if (data.message) {
        setChatMessages(prev => [...prev, { role: 'bot', text: data.message }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'bot', text: 'Sorry, something went wrong.' }]);
    }
    setChatSending(false);
  }

  // Filter docs
  const filtered = docs.filter(d => {
    if (selectedMember !== 'all' && d.family_member_id !== parseInt(selectedMember)) return false;
    if (selectedType !== 'all' && d.doc_type !== selectedType) return false;
    return d.doc_type !== 'analysis';
  });
  const docTypes = [...new Set(docs.map(d => d.doc_type).filter(Boolean))].filter(t => t !== 'analysis');
  const getMemberName = (id) => familyMembers.find(f => f.id === id)?.name || null;

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const searchFiltered = filtered.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return d.filename?.toLowerCase().includes(q) || d.summary?.toLowerCase().includes(q) || d.doc_type?.toLowerCase().includes(q);
  });

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Mobile: simple hub pointing to Telegram
  if (isMobile) {
    return (
      <div className="mobile-hub">
        <div className="mobile-hub-inner">
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🧠</div>
          <h1 className="mobile-hub-greeting">
            {greeting.emoji} {greeting.text}, {user?.name || 'there'}
          </h1>
          <p className="mobile-hub-sub">Your brain lives on Telegram.</p>

          <a href="https://t.me/savemybraintest_bot" className="mobile-hub-cta">
            Open Telegram ✈️
          </a>

          <div className="mobile-hub-stats">
            <div className="mobile-hub-stat">
              <div className="mobile-hub-stat-num">{docs.length}</div>
              <div className="mobile-hub-stat-label">{lang === 'zh-tw' ? '文件' : 'Documents'}</div>
            </div>
            <div className="mobile-hub-stat">
              <div className="mobile-hub-stat-num">{familyMembers.length}</div>
              <div className="mobile-hub-stat-label">{lang === 'zh-tw' ? '家庭成員' : 'Family'}</div>
            </div>
          </div>

          <div className="mobile-hub-tips">
            <div>📎 {lang === 'zh-tw' ? '在Telegram上傳文件' : 'Upload docs in Telegram'}</div>
            <div>💬 {lang === 'zh-tw' ? '在Telegram提問' : 'Ask questions in Telegram'}</div>
            <div>🔔 {lang === 'zh-tw' ? '提醒自動發送到Telegram' : 'Alerts sent to Telegram'}</div>
          </div>

          <div className="mobile-hub-links">
            <a href="/settings">{lang === 'zh-tw' ? '⚙️ 設定' : '⚙️ Settings'}</a>
            <button onClick={() => { clearAuth(); navigate('/'); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', fontSize: '14px' }}>
              {lang === 'zh-tw' ? '登出' : 'Log out'}
            </button>
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

        {/* ── Chat Area ── */}
        {chatMessages.length > 0 && (
          <div className="dash-chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`dash-chat-msg ${msg.role}`}>
                <div className="dash-chat-bubble" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }} />
              </div>
            ))}
            {chatSending && (
              <div className="dash-chat-msg bot">
                <div className="dash-chat-bubble">Thinking...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* ── Chat Input ── */}
        <form className="dash-chat-input-wrap" onSubmit={handleChat}>
          <input
            className="dash-chat-input"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder={lang === 'zh-tw' ? '有什麼可以幫你？' : 'How can I help you today?'}
            disabled={chatSending}
          />
          <button type="submit" className="dash-chat-send" disabled={!chatInput.trim() || chatSending}>
            ↑
          </button>
        </form>

        {/* ── Upload Zone ── */}
        <div
          className="dash-upload"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            borderColor: dragOver ? 'var(--color-accent)' : undefined,
            background: dragOver ? 'var(--color-accent-glow)' : undefined,
            cursor: uploading ? 'default' : 'pointer',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.webp"
            onChange={e => handleUpload(e.target.files)}
            style={{ display: 'none' }}
          />
          {uploading ? (
            <div className="dash-upload-progress">
              <span>🔄</span>
              <span>Processing {uploadProgress.done} / {uploadProgress.total}...</span>
              <div className="dash-upload-bar">
                <div className="dash-upload-bar-fill" style={{ width: `${uploadProgress.total ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }} />
              </div>
            </div>
          ) : (
            <>
              <span className="dash-upload-icon">📎</span>
              <span>{lang === 'zh-tw' ? '拖放文件或點擊上傳（支援批量）' : 'Drop files or folders here — bulk upload supported'}</span>
            </>
          )}
        </div>

        {/* ── Search ── */}
        <div className="dash-search-wrap">
          <span className="dash-search-icon">🔍</span>
          <input
            className="dash-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={lang === 'zh-tw' ? '搜尋文件名稱、內容...' : 'Search by title, type, or content...'}
          />
        </div>

        {/* ── Filters ── */}
        {(familyMembers.length > 0 || docTypes.length > 0) && (
          <div className="dash-filters">
            {familyMembers.length > 0 && (
              <div className="dash-filter-row">
                <button className={`dash-filter-btn ${selectedMember === 'all' ? 'active' : ''}`} onClick={() => setSelectedMember('all')}>All</button>
                {familyMembers.map(fm => (
                  <button key={fm.id} className={`dash-filter-btn ${selectedMember === String(fm.id) ? 'active' : ''}`} onClick={() => setSelectedMember(String(fm.id))}>
                    {fm.name}
                  </button>
                ))}
              </div>
            )}
            {docTypes.length > 0 && (
              <div className="dash-filter-row">
                <button className={`dash-filter-btn ${selectedType === 'all' ? 'active' : ''}`} onClick={() => setSelectedType('all')}>All types</button>
                {docTypes.map(dt => (
                  <button key={dt} className={`dash-filter-btn ${selectedType === dt ? 'active' : ''}`} onClick={() => setSelectedType(dt)}>
                    {DOC_EMOJI[dt] || '📄'} {dt.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Document list ── */}
        {loading ? (
          <div className="dash-empty">Loading your documents...</div>
        ) : searchFiltered.length === 0 ? (
          <div className="dash-empty">
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
            {docs.length === 0 ? 'No documents yet — upload your first one above.' : 'No documents match this filter.'}
          </div>
        ) : (
          <div className="dash-doc-list">
            {searchFiltered.map(doc => {
              const memberName = getMemberName(doc.family_member_id);
              const emoji = DOC_EMOJI[doc.doc_type] || '📄';
              const isExpanded = expandedDoc === doc.id;
              let structured = {};
              try { structured = doc.structured_data ? JSON.parse(doc.structured_data) : {}; } catch {}

              return (
                <div key={doc.id} className="dash-doc-card" onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}>
                  <div className="dash-doc-header">
                    <span className="dash-doc-emoji">{emoji}</span>
                    <div className="dash-doc-info">
                      <div className="dash-doc-name">{doc.filename}</div>
                      <div className="dash-doc-meta">
                        <span className="dash-doc-badge">{doc.doc_type?.replace('_', ' ')}</span>
                        {memberName && <span className="dash-doc-member">{memberName}</span>}
                        <span>{doc.uploaded_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                  </div>
                  {isExpanded && doc.summary && (
                    <div className="dash-doc-detail">
                      <p>{doc.summary}</p>
                      {doc.key_points && (() => {
                        try {
                          const pts = JSON.parse(doc.key_points);
                          return pts.length > 0 && (
                            <div className="dash-doc-points">
                              {pts.map((p, i) => <div key={i}>• {p}</div>)}
                            </div>
                          );
                        } catch { return null; }
                      })()}
                      {doc.red_flags && (() => {
                        try {
                          const flags = JSON.parse(doc.red_flags);
                          return flags.length > 0 && (
                            <div className="dash-doc-flags">
                              {flags.map((f, i) => (
                                <div key={i}>{f.severity === 'high' ? '🔴' : '🟡'} {f.clause}{f.detail && <span> — {f.detail}</span>}</div>
                              ))}
                            </div>
                          );
                        } catch { return null; }
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
