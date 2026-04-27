import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount, currency = "HKD") {
  return `${currency} ${Number(amount).toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const CAT_EMOJI = {
  groceries: "🛒", dining: "🍽️", software: "💻", shopping: "🛍️",
  electronics: "📱", transport: "🚇", travel: "✈️", health: "💊",
  beauty: "💅", entertainment: "🎬", education: "📚",
  utilities: "💡", insurance: "🛡️", rent: "🏠", tax: "📋",
  rewards: "🎁", misc: "📦",
};

const CAT_LABEL = {
  groceries: "Groceries", dining: "Dining & Cafes", software: "Software & Apps",
  shopping: "Shopping", electronics: "Electronics", transport: "Transport",
  travel: "Travel", health: "Health", beauty: "Beauty & Salon",
  entertainment: "Entertainment", education: "Education",
  utilities: "Utilities", insurance: "Insurance", rent: "Rent",
  tax: "Tax", rewards: "Rewards", misc: "Other",
};

function MarkdownText({ text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "6px" }} />;
        if (line.startsWith("## ") || line.startsWith("### ")) {
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
            {isBullet && <span style={{ opacity: 0.4, flexShrink: 0, marginTop: "1px" }}>·</span>}
            <span>{rendered}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }) {
  return (
    <div className="card" style={{
      padding: "20px 24px",
      borderLeft: `4px solid ${accent || "var(--color-accent)"}`,
    }}>
      <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

// ── Category bar ──────────────────────────────────────────────────────────────

function CategoryBar({ cat, currency }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ width: "28px", textAlign: "center", fontSize: "18px", flexShrink: 0 }}>
        {CAT_EMOJI[cat.name] || "📦"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600 }}>{CAT_LABEL[cat.name] || cat.name}</span>
          <span style={{ fontSize: "14px", fontWeight: 700, flexShrink: 0, marginLeft: "12px" }}>
            {fmt(cat.total, currency)}
          </span>
        </div>
        <div style={{ height: "5px", borderRadius: "3px", background: "var(--color-border)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(cat.pct, 100)}%`, background: "var(--color-accent)", borderRadius: "3px", transition: "width 0.6s ease" }} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "3px" }}>
          {cat.count} transaction{cat.count !== 1 ? "s" : ""} · {cat.pct}%
        </div>
      </div>
    </div>
  );
}

// ── Recent transaction row ────────────────────────────────────────────────────

function TxnRow({ txn }) {
  const isIncome = txn.direction === "income";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ width: "28px", textAlign: "center", fontSize: "16px", flexShrink: 0 }}>
        {CAT_EMOJI[txn.category] || "📦"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {txn.merchant}
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
          {txn.date} · {CAT_LABEL[txn.category] || txn.category}
        </div>
      </div>
      <div style={{ fontSize: "14px", fontWeight: 700, flexShrink: 0, color: isIncome ? "#10b981" : "var(--color-text)" }}>
        {isIncome ? "+" : "-"}{fmt(txn.amount, txn.currency)}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ h = "20px", w = "100%", mb = "0" }) {
  return <div style={{ height: h, width: w, background: "var(--color-border)", borderRadius: "6px", marginBottom: mb, opacity: 0.5 }} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    apiFetch("/api/dashboard").then(r => r.json()).then(setData).catch(() => setData({}));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <Layout>
      <div style={{ padding: "28px 32px", maxWidth: "860px" }}>

        {/* ── Header ── */}
        <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "24px" }}>Overview</h1>

        {/* ── Stat strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px", marginBottom: "28px" }}>
          {loading ? (
            <>
              <div className="card" style={{ padding: "20px 24px" }}><Skeleton h="12px" mb="10px" /><Skeleton h="26px" w="60%" /></div>
              <div className="card" style={{ padding: "20px 24px" }}><Skeleton h="12px" mb="10px" /><Skeleton h="26px" w="60%" /></div>
              <div className="card" style={{ padding: "20px 24px" }}><Skeleton h="12px" mb="10px" /><Skeleton h="26px" w="60%" /></div>
              <div className="card" style={{ padding: "20px 24px" }}><Skeleton h="12px" mb="10px" /><Skeleton h="26px" w="60%" /></div>
            </>
          ) : (
            <>
              <StatTile label="This month" value={fmt(data.month_spent, cur)} sub="total expenses" accent="var(--color-accent)" />
              <StatTile label="All-time spent" value={fmt(data.total_spent, cur)} sub="across all docs" accent="#8b5cf6" />
              <StatTile label="Documents" value={data.doc_count} sub="files saved" accent="#10b981" />
              <StatTile label="Transactions" value={data.txn_count} sub="line items tracked" accent="#f59e0b" />
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>

          {/* ── Spending by category ── */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "4px" }}>
              Spending by Category
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "16px" }}>all time · expenses only</div>
            {loading
              ? Array(6).fill(0).map((_, i) => <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}><Skeleton h="14px" mb="6px" /><Skeleton h="5px" mb="4px" /><Skeleton h="11px" w="40%" /></div>)
              : (data.categories || []).slice(0, 8).map(cat => <CategoryBar key={cat.name} cat={cat} currency={cur} />)
            }
          </div>

          {/* ── Recent transactions ── */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "4px" }}>
              Recent Transactions
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "16px" }}>latest 15</div>
            {loading
              ? Array(6).fill(0).map((_, i) => <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}><Skeleton h="14px" mb="6px" w="70%" /><Skeleton h="11px" w="40%" /></div>)
              : (data.recent || []).map((txn, i) => <TxnRow key={i} txn={txn} />)
            }
          </div>
        </div>

        {/* ── Ask AI ── */}
        <div className="card" style={{ padding: "24px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "4px" }}>
            Ask AI
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "16px" }}>
            Ask anything · "How much did I spend on dining?" · "When does my insurance renew?"
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px", maxHeight: "280px", overflowY: "auto" }}>
            {messages.length === 0 && (
              <div style={{ color: "var(--color-text-muted)", fontSize: "13px", fontStyle: "italic" }}>
                No questions yet. Try one above.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
                background: m.role === "user" ? "var(--color-accent)" : "var(--color-surface)",
                color: m.role === "user" ? "white" : "var(--color-text)",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                padding: "10px 14px", fontSize: "14px", lineHeight: 1.6,
                border: m.role === "ai" ? "1px solid var(--color-border)" : "none",
              }}>
                {m.role === "ai" ? <MarkdownText text={m.text} /> : m.text}
              </div>
            ))}
            {chatLoading && (
              <div style={{
                alignSelf: "flex-start", background: "var(--color-surface)",
                border: "1px solid var(--color-border)", borderRadius: "16px 16px 16px 4px",
                padding: "10px 14px", fontSize: "14px", color: "var(--color-text-muted)",
              }}>Thinking…</div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask a question about your spending…"
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "8px",
                border: "1px solid var(--color-border)", background: "var(--color-bg)",
                color: "var(--color-text)", fontSize: "14px", outline: "none",
              }}
            />
            <button className="btn-primary" onClick={sendMessage} disabled={chatLoading || !input.trim()}
              style={{ padding: "10px 20px", borderRadius: "8px", fontSize: "14px" }}>
              Send
            </button>
          </div>
        </div>

      </div>
    </Layout>
  );
}
