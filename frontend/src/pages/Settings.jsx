/**
 * Settings.jsx — Account settings page (v2)
 *
 * Sections:
 * 1. Profile — name, email, plan
 * 2. Team Members — manage team (view/manage)
 * 3. Notification Channels — Telegram, Email, LINE
 * 4. Plan & Billing — upgrade buttons
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { apiFetch, getUser } from "../auth";

export default function Settings() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [billingStatus, setBillingStatus] = useState(null);
  const [baseCurrency, setBaseCurrency] = useState("HKD");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const localUser = getUser();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      showToast("Payment successful! Your plan is now active.");
    }
    if (searchParams.get("upgrade") === "true") {
      showToast("Your trial has ended. Please upgrade to continue.", "warning");
    }

    Promise.all([
      apiFetch("/api/users/me").then(r => r.json()).catch(() => null),
      apiFetch("/api/users/family-members").then(r => r.json()).catch(() => []),
      apiFetch("/api/billing/status").then(r => r.json()).catch(() => null),
      apiFetch("/api/settings").then(r => r.json()).catch(() => null),
    ]).then(([userData, members, billing, settings]) => {
      setUser(userData);
      setFamilyMembers(Array.isArray(members) ? members : []);
      setBillingStatus(billing);
      if (settings?.base_currency) setBaseCurrency(settings.base_currency);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-muted)" }}>
          <div className="spinner" style={{ marginBottom: "16px" }} />
          Loading settings...
        </div>
      </Layout>
    );
  }

  const nonSelf = familyMembers.filter(m => m.relationship !== "self");
  const displayUser = user || localUser;

  const CURRENCIES = [
    ["HKD", "HKD — Hong Kong Dollar"],
    ["USD", "USD — US Dollar"],
    ["EUR", "EUR — Euro"],
    ["GBP", "GBP — British Pound"],
    ["JPY", "JPY — Japanese Yen"],
    ["CAD", "CAD — Canadian Dollar"],
    ["AUD", "AUD — Australian Dollar"],
    ["SGD", "SGD — Singapore Dollar"],
    ["TWD", "TWD — Taiwan Dollar"],
    ["CNY", "CNY — Chinese Yuan"],
    ["CHF", "CHF — Swiss Franc"],
    ["NZD", "NZD — New Zealand Dollar"],
    ["KRW", "KRW — Korean Won"],
    ["THB", "THB — Thai Baht"],
    ["MYR", "MYR — Malaysian Ringgit"],
    ["PHP", "PHP — Philippine Peso"],
    ["INR", "INR — Indian Rupee"],
    ["IDR", "IDR — Indonesian Rupiah"],
  ];

  const handleSaveCurrency = async () => {
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ base_currency: baseCurrency }),
      });
      showToast("Base currency saved. Dashboard will refresh on next load.");
    } catch {
      showToast("Could not save currency setting.", "warning");
    }
  };

  const handleUpgrade = async (plan) => {
    try {
      const resp = await apiFetch("/api/billing/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
    } catch {
      showToast("Could not start checkout. Please try again.", "warning");
    }
  };

  return (
    <Layout>
      {toast && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 1000,
          background: toast.type === "warning" ? "var(--color-warning)" : "var(--color-success)",
          color: "white", padding: "12px 20px", borderRadius: "8px", fontSize: "14px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: "32px", maxWidth: "720px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "32px" }}>Settings</h1>

        {/* Profile */}
        <section className="card" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>👤 Profile</h2>
          {displayUser && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>Name</span>
                <span style={{ fontWeight: 600 }}>{displayUser.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>Email</span>
                <span style={{ fontSize: "14px" }}>{displayUser.email}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>Language</span>
                <span style={{ fontSize: "14px" }}>{displayUser.language === "zh-tw" ? "繁體中文" : "English"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>Timezone</span>
                <span style={{ fontSize: "14px" }}>{displayUser.timezone}</span>
              </div>
            </div>
          )}
        </section>

        {/* Plan & Billing */}
        <section className="card" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>💳 Plan & Billing</h2>
          {billingStatus ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{billingStatus.plan} Plan</span>
                  {billingStatus.plan === "trial" && (
                    <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                      {billingStatus.days_remaining} days remaining · {billingStatus.docs_remaining} documents remaining
                    </div>
                  )}
                  {billingStatus.plan === "annual" && billingStatus.expires_at && (
                    <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                      Renews {new Date(billingStatus.expires_at).toLocaleDateString()}
                    </div>
                  )}
                  {billingStatus.plan === "lifetime" && (
                    <div style={{ fontSize: "13px", color: "var(--color-success)", marginTop: "4px" }}>Lifetime access</div>
                  )}
                </div>
                {billingStatus.plan === "trial" && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-primary" onClick={() => handleUpgrade("lifetime")}>US$200 Lifetime</button>
                    <button className="btn-secondary" onClick={() => handleUpgrade("annual")}>US$79/year</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>Unable to load billing info.</p>
          )}
        </section>

        {/* Notification Channels */}
        <section className="card" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>🔔 Notifications</h2>
          <p style={{ fontSize: "14px", color: "var(--color-text-muted)", marginBottom: "16px" }}>
            We'll notify you about deadlines, renewals, and anything that needs attention.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "var(--color-bg)", borderRadius: "8px",
              border: "1px solid var(--color-border)",
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>📱 Telegram</span>
                <div style={{ fontSize: "12px", color: "var(--color-success)" }}>Active — alerts sent via bot</div>
              </div>
              <a href="https://t.me/savemybraintest_bot" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "13px", color: "var(--color-accent)" }}>
                Open Bot
              </a>
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "var(--color-bg)", borderRadius: "8px",
              border: "1px solid var(--color-border)",
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>📧 Email</span>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Coming soon</div>
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "var(--color-bg)", borderRadius: "8px",
              border: "1px solid var(--color-border)",
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>💚 LINE Notify</span>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Coming soon</div>
              </div>
            </div>
          </div>
        </section>

        {/* Base Currency */}
        <section className="card" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>💱 Base Currency</h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "16px" }}>
            All dashboard totals are converted to this currency. Individual transactions still show their original currency.
          </p>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={baseCurrency}
              onChange={e => setBaseCurrency(e.target.value)}
              style={{
                flex: 1, padding: "8px 12px", borderRadius: "8px", fontSize: "13px",
                border: "1px solid var(--color-border)", background: "var(--color-bg)",
                color: "var(--color-text)", cursor: "pointer",
              }}
            >
              {CURRENCIES.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <button className="btn-primary" onClick={handleSaveCurrency}
              style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", whiteSpace: "nowrap" }}>
              Save
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "10px" }}>
            Exchange rates are fetched daily from the European Central Bank via frankfurter.app. Unknown currencies are left unconverted.
          </p>
        </section>

        {/* Connections (future) */}
        <section className="card" style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>🔗 Connections</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "var(--color-bg)", borderRadius: "8px",
              border: "1px solid var(--color-border)",
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>🔗 Google</span>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Drive · Sheets · Calendar — coming soon</div>
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "var(--color-bg)", borderRadius: "8px",
              border: "1px solid var(--color-border)",
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>📦 Dropbox</span>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Auto-import from folder — coming soon</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
