/**
 * PaywallBanner.jsx — Trial status + upgrade prompt
 * Shown in Dashboard and Documents pages when plan = 'trial' and limit is close.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken } from "../auth";

export default function PaywallBanner() {
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/billing/status", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status || status.plan !== "trial") return null;
  if (status.days_remaining > 3 && status.docs_remaining > 1) return null; // Not urgent yet

  const isExpired = !status.active;

  return (
    <div style={{
      background: isExpired ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
      border: `1px solid ${isExpired ? "var(--color-danger)" : "var(--color-warning)"}`,
      borderRadius: "8px",
      padding: "12px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
    }}>
      <div>
        <span style={{ fontWeight: 600, color: isExpired ? "var(--color-danger)" : "var(--color-warning)" }}>
          {isExpired ? "⚠️ Trial Ended" : "⏰ Trial Ending Soon"}
        </span>
        <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginLeft: "8px" }}>
          {isExpired
            ? "Upgrade to continue uploading documents."
            : `${status.days_remaining} days · ${status.docs_remaining} documents remaining`}
        </span>
      </div>
      <button className="btn-primary" style={{ fontSize: "13px" }} onClick={() => navigate("/settings?upgrade=true")}>
        Upgrade Now
      </button>
    </div>
  );
}
