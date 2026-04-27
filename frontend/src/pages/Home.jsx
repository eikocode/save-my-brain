import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { apiFetch } from "../auth";

function MarkdownText({ text }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "6px" }} />;
        // ## heading
        if (line.startsWith("## ")) {
          const content = line.slice(3).replace(/\*\*/g, "");
          return <div key={i} style={{ fontWeight: 700, fontSize: "13px", marginTop: "8px", color: "var(--color-accent)" }}>{content}</div>;
        }
        // ### heading
        if (line.startsWith("### ")) {
          const content = line.slice(4).replace(/\*\*/g, "");
          return <div key={i} style={{ fontWeight: 700, fontSize: "13px", marginTop: "6px" }}>{content}</div>;
        }
        // bullet
        const isBullet = line.startsWith("- ") || line.startsWith("• ");
        const content = (isBullet ? line.slice(2) : line).replace(/\*\*(.+?)\*\*/g, "§BOLD§$1§END§");
        const parts = content.split(/(§BOLD§.+?§END§)/);
        const rendered = parts.map((p, j) => {
          if (p.startsWith("§BOLD§") && p.endsWith("§END§")) {
            return <strong key={j}>{p.slice(6, -5)}</strong>;
          }
          return p;
        });
        return (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
            {isBullet && <span style={{ opacity: 0.5, flexShrink: 0 }}>·</span>}
            <span>{rendered}</span>
          </div>
        );
      })}
    </div>
  );
}

const CARD_COLORS = [
  "var(--color-accent)",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
];

function InsightCard({ card, index }) {
  return (
    <div className="card" style={{
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      borderTop: `3px solid ${CARD_COLORS[index % CARD_COLORS.length]}`,
      minHeight: "110px",
    }}>
      <div style={{ fontSize: "22px" }}>{card.icon}</div>
      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {card.title}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>
        {card.value}
      </div>
      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
        {card.detail}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card" style={{ padding: "20px 24px", minHeight: "110px", opacity: 0.5 }}>
      <div style={{ width: "28px", height: "28px", background: "var(--color-border)", borderRadius: "6px", marginBottom: "8px" }} />
      <div style={{ width: "60%", height: "10px", background: "var(--color-border)", borderRadius: "4px", marginBottom: "8px" }} />
      <div style={{ width: "80%", height: "20px", background: "var(--color-border)", borderRadius: "4px", marginBottom: "6px" }} />
      <div style={{ width: "90%", height: "10px", background: "var(--color-border)", borderRadius: "4px" }} />
    </div>
  );
}

export default function Home() {
  const [cards, setCards] = useState(null);
  const [insightsError, setInsightsError] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const bottomRef = useRef(null);

  const loadInsights = () => {
    setCards(null);
    setInsightsError(null);
    apiFetch("/api/insights")
      .then(r => r.json())
      .then(data => {
        setCards(data.cards || []);
        setGeneratedAt(data.generated_at || null);
        if (data.error) setInsightsError(data.error);
      })
      .catch(() => {
        setCards([]);
        setInsightsError("Could not load insights");
      });
  };

  useEffect(() => { loadInsights(); }, []);

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
      const resp = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: "ai", text: data.message || "No response." }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", text: "Sorry, something went wrong." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fmtTime = iso => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  return (
    <Layout>
      <div style={{ padding: "32px", maxWidth: "900px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Dashboard</h1>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
              {generatedAt ? `Insights generated at ${fmtTime(generatedAt)}` : "Analysing your documents…"}
            </div>
          </div>
          <button
            onClick={loadInsights}
            style={{
              background: "none", border: "1px solid var(--color-border)",
              borderRadius: "8px", padding: "8px 14px", cursor: "pointer",
              fontSize: "13px", color: "var(--color-text-muted)",
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Insight cards */}
        {insightsError && (
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderRadius: "8px", fontSize: "13px", color: "#ef4444", marginBottom: "24px" }}>
            {insightsError}
          </div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}>
          {cards === null
            ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : cards.length === 0
              ? <div style={{ gridColumn: "1/-1", color: "var(--color-text-muted)", fontSize: "14px", padding: "24px 0" }}>
                  No documents yet — upload some to see insights.
                </div>
              : cards.map((c, i) => <InsightCard key={i} card={c} index={i} />)
          }
        </div>

        {/* Ask anything */}
        <div className="card" style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>
            💬 Ask anything about your documents
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px", maxHeight: "320px", overflowY: "auto" }}>
            {messages.length === 0 && (
              <div style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>
                Try: "How much did I spend on coffee?" · "When is my next insurance renewal?" · "What's my biggest expense this year?"
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.role === "user" ? "var(--color-accent)" : "var(--color-surface)",
                color: m.role === "user" ? "white" : "var(--color-text)",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                padding: "10px 14px",
                fontSize: "14px",
                lineHeight: 1.6,
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
              }}>
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Ask a question…"
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "8px",
                border: "1px solid var(--color-border)", background: "var(--color-bg)",
                color: "var(--color-text)", fontSize: "14px", outline: "none",
              }}
            />
            <button
              className="btn-primary"
              onClick={sendMessage}
              disabled={chatLoading || !input.trim()}
              style={{ padding: "10px 18px", borderRadius: "8px", fontSize: "14px" }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
