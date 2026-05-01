// frontend/src/components/dashboard/ActionCentre.jsx
// Props: items — array of action items, onAsk — callback(prefill string) for ASK items

const TYPE_STYLE = {
  renewal: {
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    ctaColor: "#f59e0b",
    emoji: "⏰",
  },
  upload: {
    bg: "rgba(125,208,255,0.05)",
    border: "rgba(125,208,255,0.12)",
    ctaColor: "#7dd0ff",
    emoji: "📎",
  },
  insight: {
    bg: "rgba(16,185,129,0.05)",
    border: "rgba(16,185,129,0.12)",
    ctaColor: "#10b981",
    emoji: "💡",
  },
};

function ActionItem({ item, onAsk }) {
  const style = TYPE_STYLE[item.type] || TYPE_STYLE.insight;
  return (
    <div
      onClick={item.type === "insight" && item.prefill ? () => onAsk?.(item.prefill) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: "8px", padding: "7px 10px",
        cursor: item.type === "insight" ? "pointer" : "default",
      }}
    >
      <span style={{ fontSize: "12px", flexShrink: 0 }}>{style.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text)" }}>
          {item.text}
        </div>
        {item.subtext && (
          <div style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>{item.subtext}</div>
        )}
      </div>
      <span style={{ fontSize: "8px", color: style.ctaColor, fontWeight: 700, flexShrink: 0 }}>
        {item.cta}
      </span>
    </div>
  );
}

export default function ActionCentre({ items = [], onAsk }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "14px", padding: "14px",
    }}>
      <div style={{
        fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--color-text-muted)", marginBottom: "10px",
      }}>
        Action Centre
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textAlign: "center", padding: "12px 0" }}>
          All clear — no urgent actions right now. 🎉
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {items.map((item, i) => (
            <ActionItem key={i} item={item} onAsk={onAsk} />
          ))}
        </div>
      )}
    </div>
  );
}
