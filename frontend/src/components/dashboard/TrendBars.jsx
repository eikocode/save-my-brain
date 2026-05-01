// frontend/src/components/dashboard/TrendBars.jsx
// Props: data — array of { month: "2025-11", total: 28450 }, selectedMonth, onSelect

function fmtMonthShort(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1).toLocaleString("en", { month: "short" });
}

export default function TrendBars({ data = [], selectedMonth = "", onSelect }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.total)) || 1;
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "14px", padding: "14px",
    }}>
      <div style={{
        fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase",
        color: "var(--color-text-muted)", marginBottom: "10px",
      }}>
        Monthly trend
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: "44px" }}>
        {data.map(d => {
          const active = d.month === selectedMonth;
          const h = Math.max((d.total / max) * 40, 4);
          return (
            <div key={d.month}
              onClick={() => onSelect && onSelect(active ? "" : d.month)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", cursor: "pointer" }}
            >
              <div style={{
                width: "100%", height: `${h}px`,
                background: active ? "#7dd0ff" : "#1a2440",
                borderRadius: "3px 3px 0 0", transition: "background 0.2s",
              }} />
              <div style={{
                fontSize: "8px",
                color: active ? "#7dd0ff" : "var(--color-text-muted)",
                fontWeight: active ? 700 : 400,
              }}>
                {fmtMonthShort(d.month)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
