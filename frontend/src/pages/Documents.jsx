/**
 * Documents.jsx — Document library page (authenticated)
 *
 * Shows all uploaded documents with:
 * - AI summary
 * - Key points
 * - Filter by doc type
 * - Download original
 * - Red flag badges
 */

import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import PaywallBanner from "../components/PaywallBanner";
import { getToken } from "../auth";
import { useTranslation } from "../i18n";

const FILTERS = ["all", "bank", "insurance", "legal", "medical", "contract", "other"];

export default function Documents() {
  const { t } = useTranslation();

  const DOC_TYPE_LABELS = {
    bank: `🏦 ${t('documents.filter_bank')}`,
    insurance: `🛡️ ${t('documents.filter_insurance')}`,
    legal: `⚖️ ${t('documents.filter_legal')}`,
    medical: `🏥 ${t('documents.filter_medical')}`,
    contract: `📋 ${t('documents.filter_contract')}`,
    other: `📄 ${t('documents.filter_other')}`,
  };

  const [docs, setDocs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setUploadMsg({ type: "success", text: "✅ Document uploaded and processing. Check back in a moment." });
      // Refresh doc list after 3 seconds
      setTimeout(() => {
        fetch("/api/documents", { headers: { Authorization: `Bearer ${getToken()}` } })
          .then(r => r.json())
          .then(data => setDocs(Array.isArray(data) ? data : (data.documents || [])));
      }, 3000);
    } catch (err) {
      setUploadMsg({ type: "error", text: `❌ ${err.message}` });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  useEffect(() => {
    fetch("/api/documents", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setDocs(Array.isArray(data) ? data : (data.documents || []));
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load documents.");
        setLoading(false);
      });
  }, []);

  const filtered = filter === "all" ? docs : docs.filter((d) => d.doc_type === filter);

  return (
    <Layout>
      <div style={{ padding: "32px" }}>
        <PaywallBanner />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700 }}>📄 {t('documents.page_title')}</h1>
          <label style={{
            background: "var(--color-accent)", color: "#0F172A", padding: "10px 20px",
            borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "14px",
            opacity: uploading ? 0.6 : 1,
          }}>
            {uploading ? "Uploading..." : "⬆️ Upload Document"}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "12px" }}>
          {docs.length} documents · PDF, photos, Word files supported
        </p>
        {uploadMsg && (
          <div style={{
            padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px",
            background: uploadMsg.type === "success" ? "rgba(20,184,166,0.1)" : "rgba(239,68,68,0.1)",
            color: uploadMsg.type === "success" ? "var(--color-accent)" : "var(--color-danger)",
            border: `1px solid ${uploadMsg.type === "success" ? "var(--color-accent)" : "var(--color-danger)"}`,
          }}>
            {uploadMsg.text}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                border: "1px solid var(--color-border)",
                background: filter === f ? "var(--color-accent)" : "transparent",
                color: filter === f ? "white" : "var(--color-text-secondary)",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {f === "all" ? t('documents.filter_all') : DOC_TYPE_LABELS[f] || f}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: "var(--color-text-secondary)" }}>{t('common.loading')}</p>}
        {error && <p style={{ color: "var(--color-danger)" }}>{t('common.error_generic')}</p>}

        {!loading && filtered.length === 0 && (
          <div className="card" style={{ padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              No documents yet. Upload your first document using the button above, or send any PDF or photo to your Telegram bot.
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filtered.map((doc) => {
            const keyPoints = (() => {
              try { return JSON.parse(doc.key_points || "[]"); } catch { return []; }
            })();
            const redFlags = (() => {
              try { return JSON.parse(doc.red_flags || "[]"); } catch { return []; }
            })();
            const isExpanded = expanded === doc.id;

            return (
              <div key={doc.id} className="card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", background: "var(--color-surface)", padding: "2px 8px", borderRadius: "12px", color: "var(--color-accent)" }}>
                        {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      </span>
                      {redFlags.length > 0 && (
                        <span style={{ fontSize: "12px", background: "rgba(239,68,68,0.15)", color: "var(--color-danger)", padding: "2px 8px", borderRadius: "12px" }}>
                          ⚠️ {redFlags.length} red flag{redFlags.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>{doc.filename}</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                      Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="btn-outline"
                    style={{ fontSize: "12px", padding: "6px 12px" }}
                    onClick={() => setExpanded(isExpanded ? null : doc.id)}
                  >
                    {isExpanded ? "Hide" : "View Summary"}
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--color-border)" }}>
                    {doc.summary && (
                      <p style={{ fontSize: "14px", lineHeight: 1.6, marginBottom: "16px" }}>{doc.summary}</p>
                    )}
                    {keyPoints.length > 0 && (
                      <div style={{ marginBottom: "12px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "6px", textTransform: "uppercase" }}>{t('documents.key_points')}</div>
                        <ul style={{ paddingLeft: "16px", margin: 0 }}>
                          {keyPoints.map((kp, i) => (
                            <li key={i} style={{ fontSize: "13px", marginBottom: "4px" }}>{kp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {redFlags.length > 0 && (
                      <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "12px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-danger)", marginBottom: "6px" }}>⚠️ {t('documents.red_flags')}</div>
                        <ul style={{ paddingLeft: "16px", margin: 0 }}>
                          {redFlags.map((rf, i) => (
                            <li key={i} style={{ fontSize: "13px", color: "var(--color-danger)", marginBottom: "4px" }}>{rf}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
