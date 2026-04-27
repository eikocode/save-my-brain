/**
 * Landing.jsx — Save My Brain AI landing page v2
 *
 * Stitch-inspired layout with origami crane animations.
 * Two-column hero (headline+QR left, steps right) + Features + Personas + Pricing + CTA
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from '../i18n';

const BOT_URL = 'https://t.me/savemybraintest_bot';


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
  const stepsList = Array.isArray(steps) ? steps : [];
  const featuresList = Array.isArray(features) ? features : [];
  const personasList = Array.isArray(personas) ? personas : [];

  const trial = { name: t('landing.pricing_trial.name'), price: t('landing.pricing_trial.price'), duration: t('landing.pricing_trial.duration'), docs: t('landing.pricing_trial.docs'), features: t('landing.pricing_trial.features') };
  const annual = { name: t('landing.pricing_annual.name'), price: t('landing.pricing_annual.price'), duration: t('landing.pricing_annual.duration'), docs: t('landing.pricing_annual.docs'), features: t('landing.pricing_annual.features') };
  const lifetime = { name: t('landing.pricing_lifetime.name'), price: t('landing.pricing_lifetime.price'), duration: t('landing.pricing_lifetime.duration'), docs: t('landing.pricing_lifetime.docs'), badge: t('landing.pricing_lifetime.badge'), features: t('landing.pricing_lifetime.features') };

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
        {/* Background blobs */}
        <div className="hero-blob b1" />
        <div className="hero-blob b2" />

        {/* Left: headline + QR */}
        <div className="hero-left">
          <div>
            <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '9999px', background: 'rgba(125,208,255,0.08)', border: '1px solid rgba(125,208,255,0.2)', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 500, marginBottom: '20px' }}>
              {t('landing.pill')}
            </div>
            <h1>
              {lang === 'zh-tw' ? (
                <><span className="highlight">拯救腦細胞</span><br />告別商業文件煩惱</>
              ) : (
                <>Save your <span className="highlight">Brain</span> from<br />Life Admin</>
              )}
            </h1>
          </div>
          <p className="hero-tagline">{t('landing.tagline')}</p>
          <p className="hero-tagline" style={{ fontSize: 'clamp(14px, 1.8vw, 16px)' }}>{t('landing.sub')}</p>

          {/* Phone illustration + QR card */}
          <div className="phone-qr-row">
            <div className="phone-illustration">
              <img src="/phone-user.png" alt="User on phone" />
              <p className="phone-caption">
                {lang === 'zh-tw' ? '用手機Telegram\n管理一切' : 'Manage everything\nfrom your phone\nvia Telegram'}
              </p>
            </div>
            <div className="qr-card">
              <div className="qr-card-inner">
                <div className="qr-card-header">TELEGRAM</div>
                <img src="/qr-telegram.png" alt="Telegram QR code" className="qr-card-img" />
                <div className="qr-card-divider" />
                <div className="qr-card-tagline">save your brain</div>
              </div>
              <div className="qr-card-label">
                {t('landing.qr_label')}
              </div>
            </div>
          </div>
        </div>

        {/* Right: CTA + step cards */}
        <div className="hero-right">
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-cta" style={{ alignSelf: 'flex-start' }}>
            {t('landing.cta')}
          </a>
          {stepsList.map((step, i) => (
            <div key={i} className="step-card-v2">
              <div className="step-num">{i + 1}</div>
              <div>
                <h3>{lang === 'en' ? `Step ${i + 1}: ` : ''}{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}

          {/* Social proof card */}
          <div style={{
            marginTop: '16px',
            position: 'relative',
            borderRadius: '1.5rem',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
            padding: '24px 28px',
            border: '1px solid rgba(62, 72, 79, 0.12)',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent)', marginBottom: '6px' }}>
              {lang === 'zh-tw' ? '加密 & 安全' : 'Encrypted & Secure'}
            </div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>
              {lang === 'zh-tw' ? '加入 2,500+ 位創業者，更聰明地管理文件。' : 'Join 2,500+ solo operators organising smarter.'}
            </div>
          </div>
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
          {lang === 'zh-tw' ? '由 Anthropic 的 Claude AI 驅動' : 'Powered by Claude AI from Anthropic'}
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
      <section className="landing-section">
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

      {/* ── Pricing ──────────────────────────────── */}
      <section className="landing-section">
        <h2 className="section-title animate-on-scroll">{t('landing.pricing_title')}</h2>
        <div className="pricing-grid stagger" style={{ marginTop: '8px' }}>
          <div className="pricing-card animate-on-scroll">
            <h3>{trial.name}</h3>
            <div><span className="pricing-price">{trial.price}</span></div>
            <div className="pricing-desc">{trial.duration} · {trial.docs}</div>
            <ul className="pricing-features">
              {Array.isArray(trial.features) && trial.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-outline-landing" style={{ width: '100%', justifyContent: 'center' }}>{t('landing.pricing_cta')}</a>
          </div>
          <div className="pricing-card animate-on-scroll">
            <h3>{annual.name}</h3>
            <div><span className="pricing-price">{annual.price}</span><span className="pricing-duration">{annual.duration}</span></div>
            <div className="pricing-desc">{annual.docs}</div>
            <ul className="pricing-features">
              {Array.isArray(annual.features) && annual.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-outline-landing" style={{ width: '100%', justifyContent: 'center' }}>{t('landing.pricing_cta')}</a>
          </div>
          <div className="pricing-card highlight animate-on-scroll">
            <div className="pricing-badge">{lifetime.badge}</div>
            <h3>{lifetime.name}</h3>
            <div><span className="pricing-price">{lifetime.price}</span></div>
            <div className="pricing-desc">{lifetime.duration} · {lifetime.docs}</div>
            <ul className="pricing-features">
              {Array.isArray(lifetime.features) && lifetime.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-cta" style={{ width: '100%', justifyContent: 'center' }}>{t('landing.pricing_cta')}</a>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────── */}
      <section className="bottom-cta">
        <h2 className="animate-on-scroll">{t('landing.bottom_headline')}</h2>
        <p className="animate-on-scroll">{t('landing.bottom_sub')}</p>
        <div className="animate-on-scroll" style={{ marginBottom: '24px' }}>
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="btn-cta">{t('landing.cta')}</a>
        </div>
        <div className="animate-on-scroll">
          <img src="/qr-telegram.png" alt="Telegram QR" style={{ width: '120px', borderRadius: '12px', opacity: 0.9 }} />
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
