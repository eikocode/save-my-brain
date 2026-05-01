// SVG ring showing Financial Clarity Score (0-100)
// Props: score (int), delta (int|null), nudge (string)

export default function ClarityScore({ score = 0, delta = null, nudge = "" }) {
  // Ring: circumference of r=15.9 circle ≈ 99.9; dasharray = score% of that
  const CIRC = 99.9;
  const filled = Math.round((score / 100) * CIRC);

  return (
    <div style={{
      background: "rgba(125,208,255,0.05)",
      border: "1px solid rgba(125,208,255,0.12)",
      borderRadius: "14px",
      padding: "16px",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <div style={{
        fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--color-text-muted)", marginBottom: "8px",
      }}>
        Clarity Score
      </div>

      <div style={{ position: "relative", width: "72px", height: "72px", marginBottom: "8px" }}>
        <svg viewBox="0 0 36 36" style={{ width: "72px", height: "72px", transform: "rotate(-90deg)" }}>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a2440" strokeWidth="3.5" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke="#7dd0ff" strokeWidth="3.5"
            strokeDasharray={`${filled} ${CIRC - filled}`}
            strokeLinecap="round"
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
        }}>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#7dd0ff", lineHeight: 1 }}>
            {score}
          </div>
          {delta != null && delta !== 0 && (
            <div style={{ fontSize: "8px", color: delta > 0 ? "#10b981" : "#ef4444" }}>
              {delta > 0 ? "↑" : "↓"}{Math.abs(delta)}
            </div>
          )}
        </div>
      </div>

      {nudge && (
        <div style={{ fontSize: "9px", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          {nudge}
        </div>
      )}
    </div>
  );
}
