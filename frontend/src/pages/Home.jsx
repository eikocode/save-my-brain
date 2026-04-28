import { useEffect, useRef, useState, useCallback } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount, currency = "HKD") {
  return `${currency} ${Number(amount).toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMonth(ym) {
  if (!ym) return "All time";
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1).toLocaleString("en", { month: "long", year: "numeric" });
}

const CAT_EMOJI = {
  groceries: "🛒", dining: "🍽️", software: "💻", shopping: "🛍️",
  electronics: "📱", transport: "🚇", travel: "✈️", health: "💊",
  beauty: "💅", entertainment: "🎬", education: "📚",
  utilities: "💡", insurance: "🛡️", rent: "🏠", tax: "📋",
  rewards: "🎁", flowers: "💐", home: "🔧", banking: "🏦", misc: "📦",
};

const CAT_LABEL = {
  groceries: "Groceries", dining: "Dining & Cafes", software: "Software & Apps",
  shopping: "Shopping", electronics: "Electronics", transport: "Transport",
  travel: "Travel", health: "Health", beauty: "Beauty & Salon",
  entertainment: "Entertainment", education: "Education",
  utilities: "Utilities", insurance: "Insurance", rent: "Rent",
  tax: "Tax", rewards: "Rewards", flowers: "Flowers & Gifts",
  home: "Home & Maintenance", banking: "Bank Fees", misc: "Other",
};

function MarkdownText({ text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "6px" }} />;
        if (/^#+\s/.test(line)) {
          const content = line.replace(/^#+\s/, "").replace(/\*\*/g, "");
          return <div key={i} style={{ fontWeight: 700, fontSize: "13px", marginTop: "8px", color: "var(--color-accent)" }}>{content}</div>;
        }
        const isBullet = line.startsWith("- ") || line.startsWith("• ");
        const content = (isBullet ? line.slice(2) : line).replace(/\*\*(.+?)\*\*/g, "§$1§");
        const parts = content.split(/(§.+?§)/);
        const rendered = parts.map((p, j) =>
          p.startsWith("§") && p.endsWith("§") ? <strong key={j}>{p.slice(1, -1)}</strong> : p
        );
        return (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
            {isBullet && <span style={{ opacity: 0.4, flexShrink: 0 }}>·</span>}
            <span>{rendered}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent, delta }) {
  const up = delta > 0;
  return (
    <div className="card" style={{ padding: "20px 24px", borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
        {sub && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{sub}</span>}
        {delta != null && (
          <span style={{ fontSize: "11px", fontWeight: 700, color: up ? "#ef4444" : "#10b981" }}>
            {up ? "↑" : "↓"} {Math.abs(delta)}% vs prev
          </span>
        )}
      </div>
    </div>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({ cat, currency, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 0",
        borderBottom: "1px solid var(--color-border)",
        cursor: "pointer",
        opacity: selected === null || selected === cat.name ? 1 : 0.45,
        transition: "opacity 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "26px", textAlign: "center", fontSize: "17px", flexShrink: 0 }}>
          {CAT_EMOJI[cat.name] || "📦"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600 }}>{CAT_LABEL[cat.name] || cat.name}</span>
            <span style={{ fontSize: "14px", fontWeight: 700, flexShrink: 0, marginLeft: "12px" }}>
              {fmt(cat.total, currency)}
            </span>
          </div>
          <div style={{ height: "4px", borderRadius: "2px", background: "var(--color-border)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.min(cat.pct, 100)}%`,
              background: selected === cat.name ? "#10b981" : "var(--color-accent)",
              borderRadius: "2px", transition: "width 0.6s ease, background 0.2s",
            }} />
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "3px" }}>
            {cat.count} transaction{cat.count !== 1 ? "s" : ""} · {cat.pct}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inline transaction list ───────────────────────────────────────────────────

function InlineTxnList({ category, month, currency, onClose }) {
  const [txns, setTxns] = useState(null);

  useEffect(() => {
    const url = `/api/transactions/by-category?category=${category}${month ? `&month=${month}` : ""}`;
    apiFetch(url).then(r => r.json()).then(setTxns).catch(() => setTxns([]));
  }, [category, month]);

  return (
    <div style={{
      marginTop: "0", background: "var(--color-bg)", border: "1px solid var(--color-accent)",
      borderRadius: "8px", padding: "16px", marginBottom: "8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>
          {CAT_EMOJI[category]} {CAT_LABEL[category] || category}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "16px" }}>✕</button>
      </div>
      {txns === null ? (
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>Loading…</div>
      ) : txns.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No transactions.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {txns.map((t, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: i < txns.length - 1 ? "1px solid var(--color-border)" : "none",
              fontSize: "13px",
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{t.merchant}</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>{t.date}</div>
              </div>
              <div style={{ fontWeight: 700 }}>{fmt(t.amount, t.currency)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recent transaction row ────────────────────────────────────────────────────

function TxnRow({ txn }) {
  const isIncome = txn.direction === "income";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ width: "26px", textAlign: "center", fontSize: "15px", flexShrink: 0 }}>
        {CAT_EMOJI[txn.category] || "📦"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {txn.merchant}
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
          {txn.date} · {CAT_LABEL[txn.category] || txn.category}
        </div>
      </div>
      <div style={{ fontSize: "13px", fontWeight: 700, flexShrink: 0, color: isIncome ? "#10b981" : "var(--color-text)" }}>
        {isIncome ? "+" : "-"}{fmt(txn.amount, txn.currency)}
      </div>
    </div>
  );
}

function Skeleton({ h = "16px", w = "100%", mb = "0" }) {
  return <div style={{ height: h, width: w, background: "var(--color-border)", borderRadius: "6px", marginBottom: mb, opacity: 0.5 }} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [data, setData] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null); // null = use API default
  const [selectedCat, setSelectedCat] = useState(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef(null);

  const loadDashboard = useCallback((month) => {
    setData(null);
    setSelectedCat(null);
    const url = `/api/dashboard${month ? `?month=${month}` : ""}`;
    apiFetch(url).then(r => r.json()).then(d => {
      setData(d);
      if (month === null || month === undefined) setSelectedMonth(d.selected_month || "");
    }).catch(() => setData({}));
  }, []);

  useEffect(() => { loadDashboard(null); }, [loadDashboard]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleMonthChange = (m) => {
    setSelectedMonth(m);
    loadDashboard(m);
  };

  const handleCatClick = (catName) => {
    setSelectedCat(prev => prev === catName ? null : catName);
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const resp = await apiFetch("/api/chat", { method: "POST", body: JSON.stringify({ message: msg }) });
      const d = await resp.json();
      setMessages(prev => [...prev, { role: "ai", text: d.message || "No response." }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Sorry, something went wrong." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const cur = data?.currency || "HKD";
  const loading = data === null;
  const availableMonths = data?.available_months || [];

  return (
    <Layout>
      <div style={{ padding: "24px 32px", maxWidth: "900px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 800, margin: 0 }}>Overview</h1>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {/* Month picker */}
            <select
              value={selectedMonth || ""}
              onChange={e => handleMonthChange(e.target.value)}
              style={{
                padding: "7px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                border: "1px solid var(--color-border)", background: "var(--color-surface)",
                color: "var(--color-text)", cursor: "pointer",
              }}
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>{fmtMonth(m)}</option>
              ))}
            </select>
            <a
              href="/api/export/csv"
              download="savemybrain-transactions.csv"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "7px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                color: "var(--color-text)", textDecoration: "none",
              }}
            >↓ CSV</a>
          </div>
        </div>

        {/* ── Stat strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          {loading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="card" style={{ padding: "20px 24px" }}>
                <Skeleton h="10px" w="60%" mb="10px" /><Skeleton h="24px" w="70%" />
              </div>
            ))
          ) : (
            <>
              <StatTile
                label={`Spent in ${fmtMonth(data.selected_month)}`}
                value={fmt(data.period_spent, cur)}
                sub={data.prev_spent > 0 ? `vs ${fmt(data.prev_spent, cur)} prev` : "no prior month"}
                accent="var(--color-accent)"
                delta={data.delta_pct}
              />
              <StatTile label="Total tracked" value={fmt(data.total_spent, cur)} sub="all documents" accent="#8b5cf6" />
              <StatTile label="Documents" value={data.doc_count} sub="files saved" accent="#10b981" />
              <StatTile label="Transactions" value={data.txn_count} sub="line items" accent="#f59e0b" />
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>

          {/* ── Category breakdown ── */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "2px" }}>
              Spending by Category
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "14px" }}>
              {fmtMonth(data?.selected_month)} · tap to drill down
            </div>

            {loading
              ? Array(6).fill(0).map((_, i) => (
                  <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
                    <Skeleton h="13px" mb="6px" /><Skeleton h="4px" mb="4px" /><Skeleton h="10px" w="40%" />
                  </div>
                ))
              : (data.categories || []).map(cat => (
                  <div key={cat.name}>
                    <CategoryRow
                      cat={cat}
                      currency={cur}
                      selected={selectedCat}
                      onClick={() => handleCatClick(cat.name)}
                    />
                    {selectedCat === cat.name && (
                      <InlineTxnList
                        category={cat.name}
                        month={data.selected_month}
                        currency={cur}
                        onClose={() => setSelectedCat(null)}
                      />
                    )}
                  </div>
                ))
            }
          </div>

          {/* ── Recent transactions ── */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "2px" }}>
              Recent Activity
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "14px" }}>latest 15 · transfers excluded</div>
            {loading
              ? Array(6).fill(0).map((_, i) => (
                  <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
                    <Skeleton h="13px" w="70%" mb="5px" /><Skeleton h="10px" w="40%" />
                  </div>
                ))
              : (data.recent || []).map((txn, i) => <TxnRow key={i} txn={txn} />)
            }
          </div>
        </div>

        {/* ── Ask AI ── */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "2px" }}>
            Ask AI
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "14px" }}>
            "How much on dining in Feb?" · "When does my insurance renew?" · "Biggest expense last month?"
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px", maxHeight: "260px", overflowY: "auto" }}>
            {messages.length === 0 && (
              <div style={{ color: "var(--color-text-muted)", fontSize: "13px", fontStyle: "italic" }}>No questions yet.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
                background: m.role === "user" ? "var(--color-accent)" : "var(--color-surface)",
                color: m.role === "user" ? "white" : "var(--color-text)",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                padding: "10px 14px", fontSize: "13px", lineHeight: 1.6,
                border: m.role === "ai" ? "1px solid var(--color-border)" : "none",
              }}>
                {m.role === "ai" ? <MarkdownText text={m.text} /> : m.text}
              </div>
            ))}
            {chatLoading && (
              <div style={{
                alignSelf: "flex-start", background: "var(--color-surface)",
                border: "1px solid var(--color-border)", borderRadius: "16px 16px 16px 4px",
                padding: "10px 14px", fontSize: "13px", color: "var(--color-text-muted)",
              }}>Thinking…</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask about your spending…"
              style={{
                flex: 1, padding: "9px 14px", borderRadius: "8px",
                border: "1px solid var(--color-border)", background: "var(--color-bg)",
                color: "var(--color-text)", fontSize: "13px", outline: "none",
              }}
            />
            <button className="btn-primary" onClick={sendMessage} disabled={chatLoading || !input.trim()}
              style={{ padding: "9px 18px", borderRadius: "8px", fontSize: "13px" }}>
              Send
            </button>
          </div>
        </div>

      </div>
    </Layout>
  );
}
