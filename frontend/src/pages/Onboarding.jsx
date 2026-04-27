import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, getUser, apiFetch, saveAuth } from '../auth';
import { useTranslation } from '../i18n';

const TIMEZONES = [
  'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Taipei', 'Asia/Seoul', 'Asia/Bangkok', 'Asia/Kuala_Lumpur',
  'Asia/Jakarta', 'Asia/Dubai', 'Europe/London', 'Europe/Paris',
  'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Australia/Sydney', 'Pacific/Auckland',
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh-tw', label: '繁體中文' },
];

const TOTAL_STEPS = 3;

export default function Onboarding() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useTranslation();
  const user = getUser();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || '',
    role: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Hong_Kong',
    language: lang || 'en',
  });

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    const token = getToken();
    if (!token) { navigate('/'); return; }
    apiFetch('/api/users/me')
      .then(r => r?.json())
      .then(data => {
        if (data?.onboarding_complete) navigate('/library');
      })
      .catch(() => {});
  }, []);

  async function finishOnboarding() {
    setSaving(true);
    try {
      await apiFetch('/api/users/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          name: profile.name || user?.name || 'User',
          role: profile.role,
          timezone: profile.timezone,
          language: profile.language,
          consent_given: true,
          household_members: [],
        }),
      });
    } catch (e) {
      console.error('Onboarding API error (non-blocking):', e);
    }
    const updated = { ...user, onboarding_complete: true, name: profile.name || user?.name };
    const token = getToken();
    const refreshToken = localStorage.getItem('smb_refresh_token');
    saveAuth(token, refreshToken, updated);
    setSaving(false);
    setStep(4);
    setTimeout(() => navigate('/library'), 2000);
  }

  const roleOptions = t('onboarding.profile_role_options') || [
    'Solo Founder', 'Freelancer', 'Small Business Owner', 'Property Manager', 'Other'
  ];

  return (
    <div className="onboard-page">
      {/* Progress bar */}
      <div className="onboard-progress">
        <div className="onboard-progress-fill" style={{ width: `${(Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100}%` }} />
      </div>

      <div className="onboard-container">

        {/* ── Step 1: Welcome + Consent ── */}
        {step === 1 && (
          <div className="onboard-step">
            <div className="onboard-emoji">🧠</div>
            <h1>
              {profile.name
                ? (lang === 'zh-tw' ? `歡迎，${profile.name}` : `Welcome, ${profile.name}`)
                : (lang === 'zh-tw' ? '歡迎使用 Save My Brain' : 'Welcome to Save My Brain')
              }
            </h1>
            <p className="onboard-desc">
              {lang === 'zh-tw'
                ? '你的AI商業文件助理。上傳文件，我們幫你整理、追蹤、回答問題。'
                : 'Your AI business document assistant. Upload documents — we organise, track deadlines, and answer questions.'
              }
            </p>

            <div className="onboard-features">
              <div className="onboard-feature">
                <span>📂</span>
                <span>{lang === 'zh-tw' ? '上傳任何文件' : 'Upload invoices, receipts, contracts'}</span>
              </div>
              <div className="onboard-feature">
                <span>🧠</span>
                <span>{lang === 'zh-tw' ? 'AI自動整理和分析' : 'AI reads, organises, and extracts data'}</span>
              </div>
              <div className="onboard-feature">
                <span>💬</span>
                <span>{lang === 'zh-tw' ? '隨時用日常語言提問' : 'Ask questions in plain language'}</span>
              </div>
            </div>

            <div className="onboard-consent">
              <p>
                {lang === 'zh-tw'
                  ? '點擊「開始」即表示你同意我們的隱私政策。文件處理後即刪除，絕不出售你的數據。'
                  : 'By clicking "Get Started" you agree to our privacy policy. Documents are processed then deleted. We never sell your data.'
                }
              </p>
              <a href="/privacy" target="_blank" className="onboard-privacy-link">
                {lang === 'zh-tw' ? '閱讀隱私政策 →' : 'Read Privacy Policy →'}
              </a>
            </div>

            {isMobile ? (
              <>
                <a
                  href="https://t.me/savemybraintest_bot"
                  className="onboard-btn-primary"
                  style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                  onClick={() => {
                    apiFetch('/api/users/onboarding', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: profile.name || user?.name || 'User',
                        role: '',
                        timezone: profile.timezone,
                        language: profile.language,
                        consent_given: true,
                        household_members: [],
                      }),
                    }).catch(() => {});
                    const updated = { ...user, onboarding_complete: true };
                    const token = getToken();
                    const refreshToken = localStorage.getItem('smb_refresh_token');
                    saveAuth(token, refreshToken, updated);
                  }}
                >
                  {lang === 'zh-tw' ? '在Telegram開始 ✈️' : 'Continue on Telegram ✈️'}
                </a>
                <button className="onboard-btn-secondary" onClick={() => setStep(2)} style={{ marginTop: '12px', width: '100%' }}>
                  {lang === 'zh-tw' ? '繼續在網頁設定' : 'Or set up here instead'}
                </button>
              </>
            ) : (
              <button className="onboard-btn-primary" onClick={() => setStep(2)}>
                {lang === 'zh-tw' ? '開始 🚀' : 'Get Started 🚀'}
              </button>
            )}
          </div>
        )}

        {/* ── Step 2: Your Profile ── */}
        {step === 2 && (
          <div className="onboard-step">
            <div className="onboard-emoji">👤</div>
            <h1>{lang === 'zh-tw' ? '你的個人資料' : 'Your Profile'}</h1>
            <p className="onboard-desc">
              {lang === 'zh-tw'
                ? '讓AI更了解你，提供更準確的服務。'
                : 'Help your AI understand who you are so it can serve you better.'
              }
            </p>

            {/* Name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
                {lang === 'zh-tw' ? '你的名字' : 'Your name'}
              </label>
              <input
                className="onboard-add-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                type="text"
                value={profile.name}
                onChange={e => setProfile({ ...profile, name: e.target.value })}
                placeholder={lang === 'zh-tw' ? 'AI怎麼稱呼你？' : 'How should your AI call you?'}
              />
            </div>

            {/* Role */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
                {lang === 'zh-tw' ? '你的主要角色' : 'Your main role'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {(Array.isArray(roleOptions) ? roleOptions : []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setProfile({ ...profile, role: opt })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${profile.role === opt ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
                      background: profile.role === opt ? 'rgba(125,208,255,0.12)' : 'rgba(255,255,255,0.03)',
                      color: profile.role === opt ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                      fontWeight: profile.role === opt ? 600 : 400,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Timezone */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
                {lang === 'zh-tw' ? '你的時區' : 'Your timezone'}
              </label>
              <select
                className="onboard-add-select"
                style={{ width: '100%' }}
                value={profile.timezone}
                onChange={e => setProfile({ ...profile, timezone: e.target.value })}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
                {lang === 'zh-tw' ? '偏好語言' : 'Preferred language'}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {LANGUAGES.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => {
                      setProfile({ ...profile, language: l.value });
                      setLang?.(l.value);
                    }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      border: `1px solid ${profile.language === l.value ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
                      background: profile.language === l.value ? 'rgba(125,208,255,0.12)' : 'rgba(255,255,255,0.03)',
                      color: profile.language === l.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: profile.language === l.value ? 600 : 400,
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="onboard-actions">
              <button className="onboard-btn-secondary" onClick={() => setStep(1)}>
                {lang === 'zh-tw' ? '← 返回' : '← Back'}
              </button>
              <button
                className="onboard-btn-primary"
                onClick={() => setStep(3)}
                disabled={!profile.name.trim()}
              >
                {lang === 'zh-tw' ? '下一步 →' : 'Next →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Connect Telegram ── */}
        {step === 3 && (
          <div className="onboard-step">
            <div className="onboard-emoji">✈️</div>
            <h1>{lang === 'zh-tw' ? '連接Telegram' : 'Connect Telegram'}</h1>
            <p className="onboard-desc">
              {lang === 'zh-tw'
                ? '透過Telegram上傳文件、接收每日簡報和提醒。在手機上更快速方便。'
                : 'Upload documents, receive daily briefs and deadline reminders via Telegram. Faster on mobile.'
              }
            </p>

            <div className="onboard-features" style={{ marginBottom: '24px' }}>
              <div className="onboard-feature">
                <span>📤</span>
                <span>{lang === 'zh-tw' ? '直接發送文件到Bot' : 'Send documents directly to the bot'}</span>
              </div>
              <div className="onboard-feature">
                <span>📋</span>
                <span>{lang === 'zh-tw' ? '每日AI商業摘要' : 'Daily AI business brief'}</span>
              </div>
              <div className="onboard-feature">
                <span>🔔</span>
                <span>{lang === 'zh-tw' ? '到期提醒通知' : 'Deadline and renewal alerts'}</span>
              </div>
            </div>

            <a
              href="https://t.me/savemybraintest_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="onboard-btn-primary"
              style={{ textAlign: 'center', textDecoration: 'none', display: 'block', marginBottom: '12px' }}
            >
              {lang === 'zh-tw' ? '開啟Telegram Bot ✈️' : 'Open Telegram Bot ✈️'}
            </a>

            <div className="onboard-actions" style={{ marginTop: '8px' }}>
              <button className="onboard-btn-secondary" onClick={() => setStep(2)}>
                {lang === 'zh-tw' ? '← 返回' : '← Back'}
              </button>
              <button
                className="onboard-btn-primary"
                onClick={finishOnboarding}
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, rgba(125,208,255,0.3), rgba(125,208,255,0.15))' }}
              >
                {saving
                  ? (lang === 'zh-tw' ? '設定中...' : 'Setting up...')
                  : (lang === 'zh-tw' ? '完成設定 ✓' : 'Finish Setup ✓')
                }
              </button>
            </div>

            <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--color-text-faint)' }}>
              {lang === 'zh-tw' ? '也可以只使用網頁版' : 'You can also use the web app only — Telegram is optional.'}
            </p>
          </div>
        )}

        {/* ── Step 4: All set ── */}
        {step === 4 && (
          <div className="onboard-step">
            <div className="onboard-emoji">🎉</div>
            <h1>{lang === 'zh-tw' ? '準備好了！' : "You're all set!"}</h1>
            <p className="onboard-desc">
              {lang === 'zh-tw'
                ? '現在就上傳你的第一份文件吧。'
                : 'Upload your first document to get started.'
              }
            </p>
            <div className="onboard-redirect">
              {lang === 'zh-tw' ? '正在跳轉...' : 'Redirecting to your library...'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
