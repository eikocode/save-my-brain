const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "zh-tw", label: "繁中" },
];

export default function LanguageSwitcher({ lang, onChange }) {
  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            border: "1px solid var(--color-border)",
            background: lang === l.code ? "var(--color-accent)" : "transparent",
            color: lang === l.code ? "white" : "var(--color-text-secondary)",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: lang === l.code ? 600 : 400,
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
