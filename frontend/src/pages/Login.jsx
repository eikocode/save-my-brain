import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveAuth } from '../auth.js'
import { useTranslation } from '../i18n'

export default function Login() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const apiBase = import.meta.env.VITE_API_URL || ''
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name }

      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Something went wrong')
        return
      }
      saveAuth(data.access_token, data.refresh_token, data.user)
      const inviteCode = localStorage.getItem('smb_invite_code')
      if (inviteCode) {
        navigate(`/invite/${inviteCode}`)
      } else if (!data.user?.onboarding_complete) {
        navigate('/onboarding')
      } else {
        navigate('/library')
      }
    } catch {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Nav */}
      <nav className="login-nav">
        <a href="/" className="login-nav-logo">
          <span>🧠</span>
          <span>Save My Brain</span>
        </a>
      </nav>

      {/* Main */}
      <main className="login-main">
        <div className="login-card-wrapper">
          {/* Card */}
          <div className="login-card">
            {/* Glow */}
            <div className="login-glow" />

            <div className="login-card-inner">
              {/* Header */}
              <div className="login-header">
                <h1>{mode === 'login' ? t('welcome_back') : t('create_account')}</h1>
                <p>{mode === 'login'
                  ? 'Securely access your household dashboard.'
                  : 'Start organizing your household documents.'
                }</p>
              </div>

              {/* Error */}
              {error && (
                <div className="login-error">{error}</div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="login-form">
                {mode === 'register' && (
                  <div className="login-field">
                    <label htmlFor="name">{t('name')}</label>
                    <div className="login-input-wrap">
                      <span className="login-input-icon">👤</span>
                      <input
                        id="name"
                        type="text"
                        placeholder="Your name"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="login-field">
                  <label htmlFor="email">{t('email')}</label>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">✉️</span>
                    <input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="login-field">
                  <div className="login-label-row">
                    <label htmlFor="password">{t('password')}</label>
                    {mode === 'login' && (
                      <a href="#" className="login-forgot">Forgot Password?</a>
                    )}
                  </div>
                  <div className="login-input-wrap">
                    <span className="login-input-icon">🔒</span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      className="login-toggle-pw"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <button type="submit" className="login-submit" disabled={loading}>
                  {loading ? 'Loading...' : (mode === 'login' ? t('login') : t('register'))}
                </button>
              </form>

              {/* Switch mode */}
              <div className="login-switch">
                <p>
                  {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                  <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
                    {mode === 'login' ? 'Sign up' : 'Log in'}
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Mobile: Telegram CTA */}
          {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
            <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '16px' }}>
              <a href="https://t.me/savemybraintest_bot" className="login-submit" style={{ textDecoration: 'none', display: 'block', background: 'linear-gradient(135deg, #7dd0ff, #38b2ea)' }}>
                Open on Telegram instead ✈️
              </a>
              <p style={{ fontSize: '12px', color: 'var(--color-text-faint)', marginTop: '8px' }}>
                Faster on mobile — no password needed
              </p>
            </div>
          )}

          {/* Trust badges */}
          <div className="login-trust">
            <div className="login-trust-item">
              <span>🛡️</span>
              <span>End-to-End Encryption</span>
            </div>
            <div className="login-trust-dot" />
            <div className="login-trust-item">
              <span>🔐</span>
              <span>256-bit Security</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="login-footer">
        <div>&copy; {new Date().getFullYear()} Santo Star Limited</div>
        <div className="login-footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="https://t.me/savemybraintest_bot" target="_blank" rel="noopener noreferrer">Telegram Bot</a>
        </div>
      </footer>
    </div>
  )
}
