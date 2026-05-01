import { useEffect, useRef, useState, useCallback } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../auth";
import ClarityScore from "../components/dashboard/ClarityScore";
import SpendingDonut from "../components/dashboard/SpendingDonut";
import ActionCentre from "../components/dashboard/ActionCentre";
import StatGrid from "../components/dashboard/StatGrid";
import TrendBars from "../components/dashboard/TrendBars";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount, currency = "HKD") {
  return `${currency} ${Number(amount).toLocaleString("en-HK", {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })}`;
}

function fmtMonth(ym) {
  if (!ym) return "All time";
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1).toLocaleString("en", { month: "short", year: "numeric" });
}

const CAT_EMOJI = {
  groceries:"🛒", dining:"🍽️", software:"💻", shopping:"🛍️",
  electronics:"📱", transport:"🚇", travel:"✈️", health:"💊",
  beauty:"💅", entertainment:"🎬", education:"📚",
  utilities:"💡", insurance:"🛡️", rent:"🏠", tax:"📋",
  rewards:"🎁", flowers:"💐", home:"🔧", banking:"🏦", misc:"📦",
};
const CAT_LABEL = {
  groceries:"Groceries", dining:"Dining & Cafes", software:"Software & Apps",
  shopping:"Shopping", electronics:"Electronics", transport:"Transport",
  travel:"Travel", health:"Health", beauty:"Beauty & Salon",
  entertainment:"Entertainment", education:"Education",
  utilities:"Utilities", insurance:"Insurance", rent:"Rent",
  tax:"Tax", rewards:"Rewards", flowers:"Flowers & Gifts",
  home:"Home & Maintenance", banking:"Bank Fees", misc:"Other",
};

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MD({ text }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height:"6px" }} />;
        if (/^#+\s/.test(line)) {
          return <div key={i} style={{ fontWeight:700, fontSize:"13px", marginTop:"8px", color:"var(--color-accent)" }}>
            {line.replace(/^#+\s/,"").replace(/\*\*/g,"")}
          </div>;
        }
        const bullet = line.startsWith("- ") || line.startsWith("• ");
        const parts = (bullet ? line.slice(2) : line)
          .replace(/\*\*(.+?)\*\*/g,"§$1§").split(/(§.+?§)/);
        const rendered = parts.map((p,j) =>
          p.startsWith("§") && p.endsWith("§") ? <strong key={j}>{p.slice(1,-1)}</strong> : p
        );
        return (
          <div key={i} style={{ display:"flex", gap:"6px", alignItems:"flex-start" }}>
            {bullet && <span style={{ opacity:0.4, flexShrink:0 }}>·</span>}
            <span>{rendered}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ h="14px", w="100%", mb="0" }) {
  return <div style={{ height:h, width:w, background:"var(--color-border)", borderRadius:"6px", marginBottom:mb, opacity:0.45 }} />;
}

// ── Category row + drill-down ─────────────────────────────────────────────────

function CategorySection({ cats, selectedCat, onCatClick, month, currency }) {
  return (
    <>
      {cats.map(cat => (
        <div key={cat.name}>
          <div onClick={() => onCatClick(cat.name)}
            style={{
              display:"flex", alignItems:"center", gap:"10px",
              padding:"11px 0", borderBottom:"1px solid var(--color-border)",
              cursor:"pointer",
              opacity: selectedCat === null || selectedCat === cat.name ? 1 : 0.4,
              transition:"opacity 0.15s",
            }}>
            <div style={{ width:"24px", textAlign:"center", fontSize:"16px", flexShrink:0 }}>
              {CAT_EMOJI[cat.name] || "📦"}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:"4px" }}>
                <div>
                  <span style={{ fontSize:"13px", fontWeight:600 }}>{CAT_LABEL[cat.name] || cat.name}</span>
                  {cat.top_merchant && (
                    <span style={{ fontSize:"11px", color:"var(--color-text-muted)", marginLeft:"6px" }}>
                      · {cat.top_merchant}
                    </span>
                  )}
                </div>
                <span style={{ fontSize:"13px", fontWeight:700, flexShrink:0, marginLeft:"8px" }}>
                  {fmt(cat.total, currency)}
                </span>
              </div>
              <div style={{ height:"3px", borderRadius:"2px", background:"var(--color-border)", overflow:"hidden" }}>
                <div style={{
                  height:"100%", width:`${Math.min(cat.pct,100)}%`,
                  background: selectedCat === cat.name ? "#10b981" : "var(--color-accent)",
                  borderRadius:"2px", transition:"width 0.5s ease, background 0.2s",
                }} />
              </div>
              <div style={{ fontSize:"10px", color:"var(--color-text-muted)", marginTop:"3px" }}>
                {cat.count} txn{cat.count !== 1 ? "s":""} · {cat.pct}%
              </div>
            </div>
          </div>

          {selectedCat === cat.name && (
            <DrillDown category={cat.name} month={month} currency={currency} onClose={() => onCatClick(cat.name)} />
          )}
        </div>
      ))}
    </>
  );
}

function DrillDown({ category, month, currency, onClose }) {
  const [txns, setTxns] = useState(null);
  useEffect(() => {
    const url = `/api/transactions/by-category?category=${category}${month ? `&month=${month}` : ""}`;
    apiFetch(url).then(r => r.json()).then(setTxns).catch(() => setTxns([]));
  }, [category, month]);

  return (
    <div style={{
      background:"var(--color-bg)", border:"1px solid var(--color-accent)",
      borderRadius:"8px", padding:"12px 14px", margin:"0 0 4px 34px",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
        <span style={{ fontSize:"12px", fontWeight:700 }}>
          {CAT_EMOJI[category]} {CAT_LABEL[category] || category}
          {month ? ` · ${fmtMonth(month)}` : " · All time"}
        </span>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-text-muted)", fontSize:"14px", padding:"0 2px" }}>✕</button>
      </div>
      {txns === null ? (
        <Sk h="12px" mb="6px" />
      ) : txns.length === 0 ? (
        <div style={{ fontSize:"12px", color:"var(--color-text-muted)" }}>No transactions.</div>
      ) : (
        txns.map((t, i) => (
          <div key={i} style={{
            display:"flex", justifyContent:"space-between", alignItems:"center",
            padding:"7px 0", borderBottom: i < txns.length-1 ? "1px solid var(--color-border)" : "none",
            fontSize:"12px",
          }}>
            <div>
              <div style={{ fontWeight:600 }}>{t.merchant}</div>
              <div style={{ color:"var(--color-text-muted)", fontSize:"10px" }}>{t.date}</div>
            </div>
            <div style={{ fontWeight:700, flexShrink:0, marginLeft:"8px" }}>{fmt(t.amount, t.currency)}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Recent transaction row ────────────────────────────────────────────────────

function TxnRow({ t }) {
  const income = t.direction === "income";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"9px 0", borderBottom:"1px solid var(--color-border)" }}>
      <div style={{ width:"24px", textAlign:"center", fontSize:"14px", flexShrink:0 }}>
        {CAT_EMOJI[t.category] || "📦"}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:"13px", fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.merchant}</div>
        <div style={{ fontSize:"10px", color:"var(--color-text-muted)" }}>{t.date} · {CAT_LABEL[t.category] || t.category}</div>
      </div>
      <div style={{ fontSize:"13px", fontWeight:700, flexShrink:0, color: income ? "#10b981" : "var(--color-text)" }}>
        {income ? "+" : "-"}{fmt(t.amount, t.currency)}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [data, setData] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(""); // "" = all time
  const [selectedCat, setSelectedCat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback((m) => {
    setData(null); setSelectedCat(null);
    apiFetch(`/api/dashboard${m ? `?month=${m}` : ""}`)
      .then(r => r.json()).then(setData).catch(() => setData({}));
  }, []);

  useEffect(() => { load(""); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const handleAsk = (prefill) => {
    setInput(prefill);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setInput("");
    setMessages(p => [...p, { role:"user", text:msg }]);
    setChatLoading(true);
    try {
      const resp = await apiFetch("/api/chat", { method:"POST", body:JSON.stringify({ message:msg }) });
      const d = await resp.json();
      setMessages(p => [...p, { role:"ai", text:d.message || "No response." }]);
    } catch {
      setMessages(p => [...p, { role:"ai", text:"Sorry, something went wrong." }]);
    } finally { setChatLoading(false); }
  };

  const cur = data?.base_currency || "HKD";
  const multiCurrency = data?.multi_currency || false;
  const loading = data === null;
  const months = data?.available_months || [];

  return (
    <Layout>
      <div style={{ padding: "20px 24px", maxWidth: "860px" }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>Overview</h1>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); load(e.target.value); }}
              style={{ padding: "6px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", cursor: "pointer" }}>
              <option value="">All time</option>
              {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>
            <a href="/api/export/csv" download="savemybrain-transactions.csv"
              style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", textDecoration: "none" }}>
              ↓ CSV
            </a>
          </div>
        </div>

        {/* ── ROW 1: Score ring + Stat grid ──────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", marginBottom: "12px" }}>
          {loading
            ? <div className="card" style={{ padding: "16px" }}><Sk h="72px" /></div>
            : <ClarityScore
                score={data.clarity_score ?? 0}
                delta={data.score_delta ?? null}
                nudge={data.score_nudge ?? ""}
              />
          }
          {loading
            ? <div className="card" style={{ padding: "16px" }}><Sk h="80px" /></div>
            : <StatGrid
                spent={data.period_spent}
                docCount={data.doc_count}
                txnCount={data.txn_count}
                currency={cur}
                month={selectedMonth}
                deltaSpentPct={data.delta_pct}
              />
          }
        </div>

        {/* ── ROW 2: Donut + Action Centre ───────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          {loading
            ? <div className="card" style={{ padding: "14px" }}><Sk h="90px" /></div>
            : <SpendingDonut
                categories={data.categories}
                month={selectedMonth ? fmtMonth(selectedMonth).split(" ")[0] : ""}
              />
          }
          {loading
            ? <div className="card" style={{ padding: "14px" }}><Sk h="90px" /></div>
            : <ActionCentre
                items={data.action_items ?? []}
                onAsk={handleAsk}
              />
          }
        </div>

        {/* ── ROW 3: Trend bars ──────────────────────────────────── */}
        {!loading && (
          <div style={{ marginBottom: "16px" }}>
            <TrendBars
              data={data.trend}
              selectedMonth={selectedMonth}
              onSelect={(m) => { setSelectedMonth(m); load(m); }}
            />
          </div>
        )}

        {/* ── Multi-currency note ─────────────────────────────────── */}
        {!loading && multiCurrency && (
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "10px", marginTop: "-4px" }}>
            💱 Totals converted to {cur} · rates updated daily · original currency shown per transaction
          </div>
        )}

        {/* ── Below fold: Category breakdown ─────────────────────── */}
        <div className="card" style={{ padding: "18px 20px", marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-muted)", marginBottom: "2px" }}>
            Spending by Category
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "12px" }}>
            {selectedMonth ? fmtMonth(selectedMonth) : "All time"} · tap to see transactions
          </div>
          {loading ? Array(4).fill(0).map((_, i) => (
            <div key={i} style={{ padding: "11px 0", borderBottom: "1px solid var(--color-border)" }}>
              <Sk h="12px" mb="5px" /><Sk h="3px" mb="3px" /><Sk h="9px" w="35%" />
            </div>
          )) : (data.categories || []).length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", padding: "12px 0" }}>No spending data for this period.</div>
          ) : (
            <CategorySection
              cats={data.categories}
              selectedCat={selectedCat}
              onCatClick={name => setSelectedCat(p => p === name ? null : name)}
              month={selectedMonth}
              currency={cur}
            />
          )}
        </div>

        {/* ── Ask AI ─────────────────────────────────────────────── */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-muted)", marginBottom: "2px" }}>Ask AI</div>
          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "12px" }}>
            "How much on dining last month?" · "When does my insurance renew?" · "Biggest purchase?"
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px", maxHeight: "240px", overflowY: "auto" }}>
            {messages.length === 0 && (
              <div style={{ color: "var(--color-text-muted)", fontSize: "12px", fontStyle: "italic" }}>Ask anything about your spending above.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%",
                background: m.role === "user" ? "var(--color-accent)" : "var(--color-surface)",
                color: m.role === "user" ? "white" : "var(--color-text)",
                borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                padding: "9px 13px", fontSize: "13px", lineHeight: 1.6,
                border: m.role === "ai" ? "1px solid var(--color-border)" : "none",
              }}>
                {m.role === "ai" ? <MD text={m.text} /> : m.text}
              </div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: "flex-start", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px 14px 14px 4px", padding: "9px 13px", fontSize: "13px", color: "var(--color-text-muted)" }}>
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask about your spending…"
              style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "13px", outline: "none" }} />
            <button className="btn-primary" onClick={sendMessage} disabled={chatLoading || !input.trim()}
              style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>Send</button>
          </div>
        </div>

      </div>
    </Layout>
  );
}
