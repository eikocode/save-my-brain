/**
 * ChatBox.jsx — Unified AI chat
 *
 * One chat that handles everything: onboarding, Q&A, household management.
 * No modes. No commands. Just talk naturally.
 *
 * Props:
 *   fullPage: boolean — show as full page (onboarding) or floating bubble (library)
 *   onOnboardingComplete: callback when onboarding finishes
 *   initialMessage: string — auto-send this message on mount (e.g., "/start" for onboarding)
 */

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../auth';

/**
 * Props:
 *   fullPage: boolean — full page (onboarding) or floating bubble (library)
 *   mode: "onboarding" | "qa" — onboarding uses structured buttons, qa uses Claude
 *   onOnboardingComplete: callback
 *   initialMessage: string — auto-send on mount
 */
export default function ChatBox({ fullPage = false, mode = 'qa', onOnboardingComplete, initialMessage }) {
  // Include user ID in storage key so different logins don't share chat history
  const userId = (() => { try { return JSON.parse(localStorage.getItem('smb_user'))?.id || '0'; } catch { return '0'; } })();
  const STORAGE_KEY = `smb_chat_${mode}_${userId}`;

  // Load persisted messages from localStorage (only for current user)
  const [messages, setMessages] = useState(() => {
    if (mode === 'onboarding') return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      // Only restore if messages belong to current user (extra safety)
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(fullPage);
  const [choices, setChoices] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const initialized = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, choices]);

  // Persist messages to localStorage (Q&A mode only)
  useEffect(() => {
    if (mode !== 'onboarding' && messages.length > 0) {
      try {
        // Keep last 50 messages to avoid localStorage bloat
        const toSave = messages.slice(-50);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch {}
    }
  }, [messages]);

  // Send initial message on mount (for onboarding)
  useEffect(() => {
    if (initialMessage && !initialized.current) {
      initialized.current = true;
      setTimeout(() => sendMessage(initialMessage, true), 300);
    }
  }, [initialMessage]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  function addMessage(role, text) {
    setMessages(prev => [...prev, { role, text, time: new Date() }]);
  }

  async function sendMessage(text, isSystem = false) {
    if (!text?.trim() || sending) return;

    const msg = text.trim();
    if (!isSystem) {
      addMessage('user', msg);
    }
    setInput('');
    setChoices(null);
    setSending(true);

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg, mode }),
      });
      const data = await res.json();

      if (data.message) {
        addMessage('bot', data.message);
      }
      if (data.choices) {
        setChoices(data.choices);
      }

      if (data.onboarding_complete && onOnboardingComplete) {
        setTimeout(() => onOnboardingComplete(data), 2000);
      }
    } catch (e) {
      addMessage('bot', 'Sorry, something went wrong. Please try again.');
    }
    setSending(false);
  }

  function handleChoice(choice) {
    sendMessage(choice.value || choice.label);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // Floating bubble when minimized
  if (!fullPage && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'var(--color-accent)', border: 'none',
          cursor: 'pointer', fontSize: '24px',
          boxShadow: '0 4px 20px rgba(14,165,233,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.target.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.target.style.transform = 'scale(1)'}
      >
        🧠
      </button>
    );
  }

  const containerStyle = fullPage ? {
    width: '100%', maxWidth: '520px',
    height: 'auto', maxHeight: '75vh',
    background: 'var(--color-surface)',
    borderRadius: '16px', border: '1px solid var(--color-border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  } : {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000,
    width: '400px', height: '600px',
    background: 'var(--color-surface)',
    borderRadius: '16px', border: '1px solid var(--color-border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--color-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🧠</span>
          <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '15px' }}>
            Save My Brain
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!fullPage && messages.length > 0 && mode === 'qa' && (
            <button
              onClick={() => { setMessages([]); localStorage.removeItem(STORAGE_KEY); }}
              style={{
                background: 'none', border: 'none', color: 'var(--color-text-muted)',
                cursor: 'pointer', fontSize: '12px', padding: '4px',
              }}
              title="Clear chat history"
            >
              Clear
            </button>
          )}
          {!fullPage && (
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none', border: 'none', color: 'var(--color-text-muted)',
                cursor: 'pointer', fontSize: '18px', padding: '4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        minHeight: fullPage ? '300px' : 'auto',
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'var(--color-accent)' : 'var(--color-bg)',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
              fontSize: '14px', lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
              dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }}
            />
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              background: 'var(--color-bg)', color: 'var(--color-text-muted)',
              fontSize: '14px',
            }}>
              Thinking...
            </div>
          </div>
        )}

        {/* Inline choice buttons */}
        {choices && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
            {choices.map((c, i) => (
              <button
                key={i}
                onClick={() => handleChoice(c)}
                disabled={sending}
                style={{
                  padding: '8px 16px', borderRadius: '20px',
                  border: '1px solid var(--color-accent)',
                  background: 'transparent', color: 'var(--color-accent)',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.target.style.background = 'var(--color-accent)'; e.target.style.color = '#fff'; }}
                onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--color-accent)'; }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--color-border)',
        display: 'flex', gap: '8px',
        background: 'var(--color-bg)',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type anything..."
          disabled={sending}
          style={{
            flex: 1, padding: '10px 14px',
            background: 'var(--color-surface)', color: 'var(--color-text)',
            border: '1px solid var(--color-border)', borderRadius: '24px',
            fontSize: '14px', outline: 'none',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || sending}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: input.trim() ? 'var(--color-accent)' : 'var(--color-surface-2)',
            border: 'none', color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
            fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
