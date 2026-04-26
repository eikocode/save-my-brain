/**
 * Onboarding.jsx — Brain-dead simple 3-step onboarding
 *
 * Step 1: Welcome + consent (one click)
 * Step 2: Household members (structured form)
 * Step 3: Done → redirect to Library
 *
 * No chat. No AI. No thinking required. 30 seconds total.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, getUser, apiFetch, saveAuth } from '../auth';
import { useTranslation } from '../i18n';

const RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse / Partner', labelZh: '配偶 / 伴侶' },
  { value: 'parent', label: 'Parent', labelZh: '父母' },
  { value: 'child', label: 'Child', labelZh: '子女' },
  { value: 'sibling', label: 'Sibling', labelZh: '兄弟姊妹' },
  { value: 'grandparent', label: 'Grandparent', labelZh: '祖父母' },
  { value: 'other', label: 'Other', labelZh: '其他' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const user = getUser();

  const [step, setStep] = useState(1);
  const [members, setMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRel, setNewRel] = useState('spouse');
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

  function addMember() {
    if (!newName.trim()) return;
    setMembers([...members, { name: newName.trim(), relationship: newRel }]);
    setNewName('');
    setNewRel('spouse');
  }

  function removeMember(i) {
    setMembers(members.filter((_, idx) => idx !== i));
  }

  async function finishOnboarding() {
    setSaving(true);
    try {
      const res = await apiFetch('/api/users/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          name: user?.name || 'User',
          role: '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Hong_Kong',
          language: lang,
          consent_given: true,
          household_members: members,
        }),
      });
      if (res?.ok) {
        // Update local user state
        const updated = { ...user, onboarding_complete: true };
        const token = getToken();
        const refreshToken = localStorage.getItem('smb_refresh_token');
        saveAuth(token, refreshToken, updated);

        setStep(3);
        setTimeout(() => navigate('/library'), 2000);
      }
    } catch (e) {
      console.error('Onboarding failed:', e);
    }
    setSaving(false);
  }

  const relLabel = (val) => {
    const r = RELATIONSHIPS.find(r => r.value === val);
    return lang === 'zh-tw' ? r?.labelZh : r?.label;
  };

  return (
    <div className="onboard-page">
      {/* Progress bar */}
      <div className="onboard-progress">
        <div className="onboard-progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      <div className="onboard-container">
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="onboard-step">
            <div className="onboard-emoji">🧠</div>
            <h1>
              {lang === 'zh-tw'
                ? `${user?.name || ''}，歡迎來到 Save My Brain`
                : `Welcome, ${user?.name || 'there'}`
              }
            </h1>
            <p className="onboard-desc">
              {lang === 'zh-tw'
                ? '你的AI家庭文件助理。上傳文件，我們幫你整理、追蹤、回答問題。'
                : 'Your AI household document assistant. Upload documents, we organize, track deadlines, and answer questions.'
              }
            </p>

            <div className="onboard-features">
              <div className="onboard-feature">
                <span>📄</span>
                <span>{lang === 'zh-tw' ? '上傳任何文件' : 'Upload any document'}</span>
              </div>
              <div className="onboard-feature">
                <span>🧠</span>
                <span>{lang === 'zh-tw' ? 'AI自動整理和分析' : 'AI organizes and analyzes'}</span>
              </div>
              <div className="onboard-feature">
                <span>💬</span>
                <span>{lang === 'zh-tw' ? '隨時用日常語言提問' : 'Ask anything in plain language'}</span>
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
                    // Mark web account as onboarded since Telegram will handle the rest
                    apiFetch('/api/users/onboarding', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: user?.name || 'User',
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Hong_Kong',
                        language: lang,
                        consent_given: true,
                        household_members: [],
                      }),
                    }).catch(() => {});
                    // Update local state so next visit goes to library/hub
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

        {/* Step 2: Household */}
        {step === 2 && (
          <div className="onboard-step">
            <div className="onboard-emoji">👨‍👩‍👧‍👦</div>
            <h1>{lang === 'zh-tw' ? '你的家庭成員' : 'Your Household'}</h1>
            <p className="onboard-desc">
              {lang === 'zh-tw'
                ? '你幫誰管理文件？添加家庭成員，AI會自動將文件分配給對的人。'
                : 'Who do you manage documents for? Add family members and AI will auto-tag documents to the right person.'
              }
            </p>

            {/* Self — already added */}
            <div className="onboard-member self">
              <span className="onboard-member-avatar">👤</span>
              <div>
                <div className="onboard-member-name">{user?.name || 'You'}</div>
                <div className="onboard-member-rel">{lang === 'zh-tw' ? '自己' : 'Yourself'}</div>
              </div>
              <span className="onboard-member-check">✓</span>
            </div>

            {/* Added members */}
            {members.map((m, i) => (
              <div key={i} className="onboard-member">
                <span className="onboard-member-avatar">
                  {m.relationship === 'spouse' ? '💑' : m.relationship === 'child' ? '👶' : m.relationship === 'parent' ? '👴' : '👥'}
                </span>
                <div>
                  <div className="onboard-member-name">{m.name}</div>
                  <div className="onboard-member-rel">{relLabel(m.relationship)}</div>
                </div>
                <button className="onboard-member-remove" onClick={() => removeMember(i)}>✕</button>
              </div>
            ))}

            {/* Add member form */}
            <div className="onboard-add-form">
              <input
                className="onboard-add-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={lang === 'zh-tw' ? '姓名（如文件上所示）' : 'Name (as shown on documents)'}
                onKeyDown={e => { if (e.key === 'Enter') addMember(); }}
              />
              <select
                className="onboard-add-select"
                value={newRel}
                onChange={e => setNewRel(e.target.value)}
              >
                {RELATIONSHIPS.map(r => (
                  <option key={r.value} value={r.value}>
                    {lang === 'zh-tw' ? r.labelZh : r.label}
                  </option>
                ))}
              </select>
              <button className="onboard-add-btn" onClick={addMember} disabled={!newName.trim()}>
                +
              </button>
            </div>

            <div className="onboard-actions">
              <button className="onboard-btn-secondary" onClick={() => finishOnboarding()} disabled={saving}>
                {lang === 'zh-tw' ? '跳過，只有我自己' : 'Skip — just me'}
              </button>
              <button className="onboard-btn-primary" onClick={() => finishOnboarding()} disabled={saving}>
                {saving
                  ? (lang === 'zh-tw' ? '設定中...' : 'Setting up...')
                  : (lang === 'zh-tw' ? '完成 ✓' : 'Done ✓')
                }
              </button>
            </div>
          </div>
        )}

        {/* Step 3: All set */}
        {step === 3 && (
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
              {lang === 'zh-tw' ? '正在跳轉到你的圖書館...' : 'Redirecting to your library...'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
