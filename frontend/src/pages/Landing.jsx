/**
 * Landing.jsx — Save My Brain AI landing page v3
 *
 * Sharp & Empowering brand direction.
 * Headline: "You're not bad with money. You just can't see it."
 * Two-column hero + Features + Privacy + Pricing (Trial + Personal) + CTA
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from '../i18n';

const BOT_URL = 'https://t.me/SaveMyBrainSC_bot';
const WEB_SIGNUP_URL = '/login';


/* ── Scroll Reveal Hook ──────────────────────────── */
function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return ref;
}

function setLang(code) {
  localStorage.setItem('smb_lang', code);
  window.location.reload();
}

export default function Landing() {
  const { t, lang } = useTranslation();
  const revealRef = useScrollReveal();

  const steps = t('landing.steps');
  const features = t('landing.features');
  const personas = t('landing.personas');
  const privacyItems = t('landing.privacy_items');
  const stepsList = Array.isArray(steps) ? steps : [];
  const featuresList = Array.isArray(features) ? features : [];
  const personasList = Array.isArray(personas) ? personas : [];
  const privacyList = Array.isArray(privacyItems) ? privacyItems : [];

  const trial = t('landing.pricing_trial');
  const personal = t('landing.pricing_personal');

  return (
    <div className="landing" ref={revealRef}>

      {/* ── Nav (frosted glass) ───────────────────── */}
      <nav className="landing-nav">
        <a href="/" className="landing-nav-logo">
          <span>🧠</span>
          <span>Save My Brain</span>
        </a>
        <div className="landing-nav-actions">
          <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
          <button className={`lang-btn ${lang === 'zh-tw' ? 'active' : ''}`} onClick={() => setLang('zh-tw')}>繁中</button>
          <a href="/login" className="btn-outline-landing">{t('login')}</a>
        </div>
      </nav>

      {/* ── Hero (two-column with origami cranes) ── */}
      <section className="hero-grid">
        {/* Background blobs (clipped to hero, not the whole grid) */}
        <div className="hero-blob-wrap">
          <div className="hero-blob b1" />
          <div className="hero-blob b2" />
        </div>

        {/* Left: headline + CTA */}
        <div className="hero-left">
          <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '9999px', background: 'rgba(125,208,255,0.08)', border: '1px solid rgba(125,208,255,0.2)', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 500 }}>
            {t('landing.pill')}
          </div>
          <h1>
            {lang === 'zh-tw' ? (
              <>你對理財沒問題。<br /><span className="highlight">你只是看不見</span><br />錢去了哪裡。</>
            ) : (
              <>You're not bad<br />with money.<br />You just <span className="highlight">can't see it.</span></>
            )}
          </h1>
          <p className="hero-tagline">{t('landing.tagline')}</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a href={WEB_SIGNUP_URL} className="btn-cta">
              {t('landing.cta')}
            </a>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-outline-landing">
              {t('landing.cta_telegram')}
            </a>
          </div>
          {/* Trust badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>🔒</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-faint)' }}>
              {lang === 'zh-tw' ? '文件處理後即時刪除 · 從不儲存原始文件' : 'Files deleted after processing · We never store your originals'}
            </span>
          </div>
        </div>

        {/* Right: product visual — phone + QR */}
        <div className="hero-right">
          <div className="phone-qr-row">
            <div className="phone-illustration">
              <img src="/phone-user.png" alt="User on phone" />
              <p className="phone-caption">
                {lang === 'zh-tw' ? '用Telegram\n隨時管理' : 'Manage everything\nfrom Telegram'}
              </p>
            </div>
            <div className="qr-card">
              <div className="qr-card-inner">
                <div className="qr-card-header">TELEGRAM</div>
                <img src="/qr-telegram.png" alt="Telegram QR code" className="qr-card-img" />
                <div className="qr-card-divider" />
                <div className="qr-card-tagline">@SaveMyBrainSC_bot</div>
              </div>
              <div className="qr-card-label">
                {t('landing.qr_label')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works (step cards, just below the fold) ── */}
      <section className="landing-section" style={{ paddingTop: 'clamp(32px, 5vw, 56px)' }}>
        <h2 className="section-title animate-on-scroll">
          {lang === 'zh-tw' ? '三步搞定一切' : 'How it works'}
        </h2>
        <div className="steps-grid stagger" style={{ marginTop: '24px' }}>
          {stepsList.map((step, i) => (
            <div key={i} className="step-card-v2 animate-on-scroll">
              <div className="step-num">{i + 1}</div>
              <div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Metrics Bar ──────────────────────────── */}
      <div className="metrics-bar">
        <div className="metric">
          <div className="metric-number">{t('landing.metrics.docs')}</div>
          <div className="metric-label">{t('landing.metrics.docs_label')}</div>
        </div>
        <div className="metric">
          <div className="metric-number">{t('landing.metrics.types')}</div>
          <div className="metric-label">{t('landing.metrics.types_label')}</div>
        </div>
        <div className="metric">
          <div className="metric-number">{t('landing.metrics.speed')}</div>
          <div className="metric-label">{t('landing.metrics.speed_label')}</div>
        </div>
      </div>

      {/* ── Features Grid ────────────────────────── */}
      <section className="landing-section">
        <h2 className="section-title animate-on-scroll">{t('landing.features_title')}</h2>
        <p className="section-subtitle animate-on-scroll" style={{ marginBottom: '12px' }}>
          {lang === 'zh-tw' ? '由 Anthropic 的 Claude AI 驅動 · 支援所有主要香港銀行及保險公司' : 'Powered by Claude AI from Anthropic · Understands all major HK banks & insurers'}
        </p>
        <div className="features-grid stagger" style={{ marginTop: '8px' }}>
          {featuresList.map((f, i) => (
            <div key={i} className="feature-card animate-on-scroll">
              <div className="feature-emoji">{f.emoji}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Who It's For ─────────────────────────── */}
      <section className="landing-section" style={{ paddingTop: '0' }}>
        <h2 className="section-title animate-on-scroll">{t('landing.who_title')}</h2>
        <div className="personas-grid stagger" style={{ marginTop: '8px' }}>
          {personasList.map((p, i) => (
            <div key={i} className="persona-card animate-on-scroll">
              <div className="persona-emoji">{p.emoji}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy Section ──────────────────────── */}
      <section className="landing-section">
        <h2 className="section-title animate-on-scroll">{t('landing.privacy_title')}</h2>
        <p className="section-subtitle animate-on-scroll">{t('landing.privacy_subtitle')}</p>
        <div
          className="stagger"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {privacyList.map((item, i) => (
            <div
              key={i}
              className="animate-on-scroll"
              style={{
                padding: '28px',
                borderRadius: '1.5rem',
                border: '1px solid rgba(125, 208, 255, 0.1)',
                background: 'var(--color-surface)',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '14px' }}>{item.icon}</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>{item.title}</h3>
              <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Privacy detail callout */}
        <div
          className="animate-on-scroll"
          style={{
            marginTop: '24px',
            padding: '28px 32px',
            borderRadius: '1.5rem',
            background: 'rgba(125, 208, 255, 0.04)',
            border: '1px solid rgba(125, 208, 255, 0.12)',
            display: 'flex',
            gap: '20px',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '32px', flexShrink: 0 }}>🔍</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>
              {lang === 'zh-tw' ? '我們提取什麼——只有這些' : 'What we extract — and only this'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
              {lang === 'zh-tw' ? (
                <>從每份文件，我們只提取：<strong style={{ color: 'var(--color-text)' }}>交易日期、金額、商戶名稱、文件類型、保單號碼及保障期間</strong>。我們不讀取你的地址、身份證號碼或任何無關的個人資料。提取完成後，原始文件立即從我們的伺服器刪除，無任何備份。</>
              ) : (
                <>From each document, we extract only: <strong style={{ color: 'var(--color-text)' }}>transaction dates, amounts, merchant names, document type, policy numbers, and coverage periods</strong>. We do not read your address, HKID, or any personal details unrelated to the financial summary. Once extraction is complete, the original file is immediately deleted — no backup, no archive.</>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────── */}
      <section className="landing-section" style={{ paddingTop: '0' }}>
        <h2 className="section-title animate-on-scroll">{t('landing.pricing_title')}</h2>
        <p className="section-subtitle animate-on-scroll">
          {t('landing.pricing_note')}
        </p>
        <div
          className="stagger"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            maxWidth: '700px',
            margin: '0 auto',
          }}
        >
          {/* Free Trial */}
          <div className="pricing-card animate-on-scroll">
            <h3>{trial.name}</h3>
            <div><span className="pricing-price">{trial.price}</span></div>
            <div className="pricing-desc">{trial.duration} · {trial.docs}</div>
            <ul className="pricing-features">
              {Array.isArray(trial.features) && trial.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <a href={WEB_SIGNUP_URL} className="btn-outline-landing" style={{ width: '100%', justifyContent: 'center' }}>
              {t('landing.pricing_cta_trial')}
            </a>
          </div>

          {/* Personal */}
          <div className="pricing-card highlight animate-on-scroll">
            <div className="pricing-badge">{personal.badge}</div>
            <h3>{personal.name}</h3>
            <div>
              <span className="pricing-price">{personal.price}</span>
              <span className="pricing-duration">{personal.duration}</span>
            </div>
            <div className="pricing-desc">{personal.docs}</div>
            <ul className="pricing-features">
              {Array.isArray(personal.features) && personal.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <a href={WEB_SIGNUP_URL} className="btn-cta" style={{ width: '100%', justifyContent: 'center' }}>
              {t('landing.pricing_cta_paid')}
            </a>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────── */}
      <section className="bottom-cta">
        <h2 className="animate-on-scroll" style={{ whiteSpace: 'pre-line' }}>
          {lang === 'zh-tw' ? '你不需要財務顧問。\n你需要的是清晰度。' : "You don't need a financial advisor.\nYou need visibility."}
        </h2>
        <p className="animate-on-scroll">{t('landing.bottom_sub')}</p>
        <div className="animate-on-scroll" style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <a href={WEB_SIGNUP_URL} className="btn-cta">{t('landing.cta')}</a>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-outline-landing">{t('landing.cta_telegram')}</a>
        </div>
        <div className="animate-on-scroll">
          <img src="/qr-telegram.png" alt="Telegram QR" style={{ width: '110px', borderRadius: '12px', opacity: 0.85 }} />
        </div>
      </section>

      {/* ── Footer ───────────────────────────────── */}
      <footer className="landing-footer">
        <div className="powered-by-badge">
          <span>Powered by</span>
          <span className="powered-by-name">Claude AI</span>
          <span className="powered-by-company">by Anthropic</span>
        </div>
        <div style={{ marginBottom: '8px', marginTop: '16px' }}>🧠 {t('landing.footer_company')}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '12px' }}>
          <a href="/privacy">{t('landing.footer_privacy')}</a>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer">{t('landing.footer_bot')}</a>
        </div>
        <div>&copy; {new Date().getFullYear()} Santo Star Limited</div>
      </footer>
    </div>
  );
}
