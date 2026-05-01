// frontend/src/components/dashboard/StatGrid.jsx
// Props: spent, docCount, txnCount, currency, month, deltaSpentPct

function fmt(amount, currency = "HKD") {
  return `${currency} ${Number(amount).toLocaleString("en-HK", {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })}`;
}

function Tile({ label, value, sub, accentColor, delta }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${accentColor}22`,
      borderRadius: "10px", padding: "12px",
    }}>
      <div style={{
        fontSize: "8px", color: "var(--color-text-muted)",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px",
      }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--color-text)" }}>
        {value}
      </div>
      {(sub || delta != null) && (
        <div style={{ fontSize: "9px", marginTop: "2px", color: delta != null ? (delta > 0 ? "#ef4444" : "#10b981") : "var(--color-text-muted)" }}>
          {delta != null ? `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}%` : sub}
        </div>
      )}
    </div>
  );
}

export default function StatGrid({ spent = 0, docCount = 0, txnCount = 0, currency = "HKD", month = "", deltaSpentPct = null }) {
  const monthLabel = month ? new Date(month + "-01").toLocaleString("en", { month: "short" }) : "All time";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
      <Tile
        label={`Spent · ${monthLabel}`}
        value={fmt(spent, currency)}
        delta={deltaSpentPct}
        accentColor="#7dd0ff"
      />
      <Tile
        label="Documents"
        value={docCount}
        sub="files tracked"
        accentColor="#a78bfa"
      />
      <Tile
        label="Transactions"
        value={txnCount}
        sub="line items"
        accentColor="#f59e0b"
      />
    </div>
  );
}
