/**
 * Privacy.jsx — Privacy policy (public, 3 languages)
 *
 * Uses useTranslation() from i18n/index.js — strings from privacy.* keys.
 * Language toggled via LanguageSwitcher, persisted in localStorage.
 */

import { useState } from "react";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useTranslation } from "../i18n";

const SECTION_KEYS = ["collect", "process", "ai", "groups", "retention", "rights", "contact"];

export default function Privacy() {
  const [lang, setLang] = useState(() => localStorage.getItem("smb_lang") || "en");

  // Re-read translations when language changes
  const handleLangChange = (newLang) => {
    localStorage.setItem("smb_lang", newLang);
    setLang(newLang);
  };

  // Build a t() function for the selected language directly
  // (useTranslation reads from localStorage which we just updated)
  const { t } = useTranslation();

  return (
    <div style={{ background: "var(--color-bg)", color: "var(--color-text)", minHeight: "100vh" }}>
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 40px", borderBottom: "1px solid var(--color-border)",
      }}>
        <a href="/" style={{ fontSize: "18px", fontWeight: 700, color: "var(--color-accent)", textDecoration: "none" }}>
          🧠 Save My Brain AI
        </a>
        <LanguageSwitcher lang={lang} onChange={handleLangChange} />
      </nav>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "8px" }}>
          {t('privacy.title')}
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "40px" }}>
          {t('privacy.last_updated')}
        </p>
        <p style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "32px" }}>
          {t('privacy.intro')}
        </p>

        {SECTION_KEYS.map((key) => (
          <div key={key} style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>
              {t(`privacy.sections.${key}.title`)}
            </h2>
            <p style={{ fontSize: "15px", lineHeight: 1.7, color: "var(--color-text-secondary)", whiteSpace: "pre-line" }}>
              {t(`privacy.sections.${key}.body`)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
