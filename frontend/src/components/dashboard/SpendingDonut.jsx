// frontend/src/components/dashboard/SpendingDonut.jsx
// Props: categories — array of { name, pct, total, count } (already computed by /api/dashboard)
// month — display string e.g. "Apr"

const PALETTE = [
  { key: "dining",        color: "#7dd0ff", emoji: "🍽️" },
  { key: "shopping",      color: "#f59e0b", emoji: "🛍️" },
  { key: "insurance",     color: "#a78bfa", emoji: "🛡️" },
  { key: "transport",     color: "#10b981", emoji: "🚇" },
  { key: "travel",        color: "#fb923c", emoji: "✈️" },
  { key: "entertainment", color: "#f472b6", emoji: "🎬" },
  { key: "utilities",     color: "#34d399", emoji: "💡" },
  { key: "health",        color: "#60a5fa", emoji: "💊" },
  { key: "groceries",     color: "#fbbf24", emoji: "🛒" },
  { key: "other",         color: "#475569", emoji: "📦" },
];

function getColor(name) {
  return PALETTE.find(p => p.key === name)?.color ?? "#475569";
}
function getEmoji(name) {
  return PALETTE.find(p => p.key === name)?.emoji ?? "📦";
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function SpendingDonut({ categories = [], month = "" }) {
  if (!categories || categories.length === 0) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "14px", padding: "14px",
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "110px",
      }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textAlign: "center" }}>
          Upload a bank statement<br />to see where your money goes.
        </div>
      </div>
    );
  }

  // Take top 4, collapse rest into Other
  const top4 = categories.slice(0, 4);
  const otherPct = categories.slice(4).reduce((s, c) => s + c.pct, 0);
  const displayed = otherPct > 0
    ? [...top4, { name: "other", pct: Math.max(1, Math.round(otherPct)) }]
    : top4;

  // Build SVG arcs: each segment is dasharray=pct dashoffset=-cumulative
  const CIRC = 99.9;
  let offset = 0;
  const segments = displayed.map(cat => {
    const dash = (cat.pct / 100) * CIRC;
    const seg = { name: cat.name, dash, offset, color: getColor(cat.name), pct: cat.pct };
    offset += dash;
    return seg;
  });

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "14px", padding: "14px",
    }}>
      <div style={{
        fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--color-text-muted)", marginBottom: "12px",
      }}>
        {month ? `Where it goes · ${month}` : "Where it goes"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ position: "relative", width: "64px", height: "64px", flexShrink: 0 }}>
          <svg viewBox="0 0 36 36" style={{ width: "64px", height: "64px", transform: "rotate(-90deg)" }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a2440" strokeWidth="4" />
            {segments.map(seg => (
              <circle key={seg.name}
                cx="18" cy="18" r="15.9" fill="none"
                stroke={seg.color} strokeWidth="4"
                strokeDasharray={`${seg.dash} ${CIRC - seg.dash}`}
                strokeDashoffset={-seg.offset}
              />
            ))}
          </svg>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
          {displayed.map(cat => (
            <div key={cat.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
              <span style={{ color: getColor(cat.name) }}>
                {getEmoji(cat.name)} {cap(cat.name)}
              </span>
              <span style={{ color: "var(--color-text)", fontWeight: 700 }}>{cat.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
