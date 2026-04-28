from __future__ import annotations

import tempfile
from pathlib import Path
from urllib.parse import quote

import uvicorn
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from .classifier import classify
from .config import Config
from .extractor import extract_document
from . import exporter, storage

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
_CATEGORIES = ["rent", "utilities", "insurance", "management", "rewards", "misc"]


def create_app(config: Config) -> FastAPI:
    app = FastAPI(title="SavemyBrain")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))

    def _fmt_doc(d: dict) -> dict:
        return {
            "id": d["id"],
            "entity": d.get("entity") or "unknown",
            "filename": d.get("original_path") or "document",
            "doc_type": d.get("doc_type") or "other",
            "issuer": d.get("issuer"),
            "doc_date": d.get("doc_date"),
            "currency": d.get("currency"),
            "total": d.get("total"),
            "summary": d.get("summary"),
            "uploaded_at": d.get("created_at"),
            "family_member_id": None,
            "key_points": None,
            "red_flags": None,
            "structured_data": None,
        }

    def _entity_display(entity: str) -> str:
        if not entity or entity == "unknown":
            return "Unclassified"
        return entity.replace("_", " ").title()

    # ── REST API endpoints (used by React frontend) ──────────────────────────

    @app.get("/api/users/me")
    async def api_me():
        return {"id": 1, "name": "User", "email": "", "language": "en",
                "timezone": "Asia/Hong_Kong", "onboarding_complete": True}

    @app.post("/api/users/onboarding")
    async def api_onboarding(request: Request):
        return {"ok": True}

    @app.get("/api/users/family-members")
    async def api_family_members():
        return []

    @app.get("/api/billing/status")
    async def api_billing_status():
        return {"plan": "trial", "days_remaining": 7, "docs_remaining": 3}

    @app.get("/api/documents")
    async def api_documents():
        docs = storage.get_documents(config)
        return [_fmt_doc(d) for d in docs]

    @app.get("/api/folders")
    async def api_folders():
        summaries = storage.get_entity_summaries(config)
        return [
            {
                "entity": s["entity"],
                "display_name": _entity_display(s["entity"]),
                "doc_count": s["doc_count"],
                "total_amount": round(s["total_amount"] or 0, 2),
                "currency": s["currency"] or "HKD",
                "last_updated": (s["last_updated"] or "")[:10],
                "doc_types": (s["doc_types"] or "").split(","),
            }
            for s in summaries
        ]

    @app.get("/api/folders/{entity}/documents")
    async def api_folder_docs(entity: str, page: int = 1, limit: int = 20):
        docs, total = storage.get_documents_by_entity(config, entity, page, limit)
        return {
            "docs": [_fmt_doc(d) for d in docs],
            "total": total,
            "page": page,
            "pages": max(1, -(-total // limit)),
        }

    @app.get("/api/documents/search")
    async def api_search(q: str = "", page: int = 1, limit: int = 20):
        if not q.strip():
            return {"docs": [], "total": 0, "page": 1, "pages": 0}
        docs, total = storage.search_documents(config, q.strip(), page, limit)
        return {
            "docs": [_fmt_doc(d) for d in docs],
            "total": total,
            "page": page,
            "pages": max(1, -(-total // limit)),
        }

    @app.get("/api/export/csv")
    async def api_export_csv():
        from fastapi.responses import StreamingResponse
        import io
        from . import exporter
        txns = storage.get_transactions(config)
        docs = {d["id"]: d for d in storage.get_documents(config)}
        output = io.StringIO()
        import csv as _csv
        writer = _csv.DictWriter(output, fieldnames=exporter.CSV_HEADERS)
        writer.writeheader()
        for t in txns:
            doc = docs.get(t.get("document_id"), {})
            writer.writerow({
                "id": t.get("id",""), "entity": t.get("entity",""),
                "date": t.get("date",""), "merchant": t.get("merchant",""),
                "amount": t.get("amount",""), "currency": t.get("currency",""),
                "category": t.get("category",""), "direction": t.get("direction",""),
                "issuer": doc.get("issuer",""), "doc_date": doc.get("doc_date",""),
                "doc_type": doc.get("doc_type",""), "doc_id": t.get("document_id",""),
            })
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=savemybrain-transactions.csv"},
        )

    @app.delete("/api/documents/{doc_id}", status_code=200)
    async def api_delete_document(doc_id: int):
        storage.delete_document(config, doc_id)
        return {"ok": True}

    @app.post("/api/documents/upload", status_code=201)
    async def api_upload(file: UploadFile = File(...)):
        suffix = Path(file.filename or "upload").suffix or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
            tf.write(await file.read())
            tmp_path = Path(tf.name)

        h = storage.file_hash(tmp_path)
        if storage.is_duplicate(config, h):
            tmp_path.unlink(missing_ok=True)
            return JSONResponse(status_code=409, content={"detail": "Duplicate — already processed"})

        try:
            result = extract_document(config, tmp_path)
            classify(result, config.entities)
            from .bot import _entity_from_result
            entity = _entity_from_result(result)
            doc_id = storage.save_document(
                config, entity, result.doc_type, result.issuer,
                result.doc_date, result.currency, result.total,
                h, file.filename or "upload", result.summary,
            )
            storage.save_transactions(config, doc_id, entity, result.transactions)
        except Exception as e:
            tmp_path.unlink(missing_ok=True)
            return JSONResponse(status_code=422, content={"detail": str(e)})

        tmp_path.unlink(missing_ok=True)
        return {"id": doc_id, "filename": file.filename, "doc_type": result.doc_type,
                "summary": result.summary}

    def _build_full_context(docs: list[dict]) -> str:
        txns = storage.get_transactions(config)
        lines = ["=== DOCUMENTS ==="]
        for d in docs:
            lines.append(
                f"[{d.get('doc_type','?')}] {d.get('issuer') or d.get('filename')} "
                f"| date: {d.get('doc_date') or 'unknown'} "
                f"| total: {d.get('currency','')} {d.get('total') or 'N/A'} "
                f"| {(d.get('summary') or '')[:200]}"
            )
        lines.append("\n=== TRANSACTIONS ===")
        for t in txns:
            lines.append(
                f"{t.get('date','?')} | {t.get('merchant','?')} | "
                f"{t.get('currency','HKD')} {t.get('amount','?')} | "
                f"{t.get('category','misc')} | {t.get('direction','expense')}"
                + (f" | {t.get('notes')}" if t.get('notes') else "")
            )
        return "\n".join(lines)

    def _clean_merchant(name: str) -> str:
        import re
        if not name:
            return name
        # Strip payment prefixes
        name = re.sub(r"^(BBMSL\*|KPAY\*|DNH\*|SQ \*)", "", name, flags=re.I)
        # Known cleanups
        replacements = {
            "CITY SUPER LIMITED": "City Super",
            "GREAT 255GPP": "Great",
            "SOGO(CWB) SUPERMARKET": "Sogo Supermarket",
            "SOGO CWB SUPERMARKET": "Sogo Supermarket",
            "APPLE.COM/BILL HOLLYHILL": "Apple Subscriptions",
            "THINKIFIC.COM VANCOUVER": "Thinkific",
            "AAAACCELERATOR": "AAA Accelerator",
            "Fleuria Fleuriste": "Fleuria",
            "FLEURIA FLEURISTE": "Fleuria",
            "BBMSLFLEURIA FLEURISTE": "Fleuria",
            "Slowood HP Hong Kong": "Slowood",
            "Slowood HP": "Slowood",
            "American Express - Annual Fee": "Amex Annual Fee",
            "Payment Received Through Autopay": "Credit Card Autopay",
            "HSBC Autopay Payment": "Credit Card Autopay",
            "PAID BY AUTOPAY": "Credit Card Autopay",
            "Paid by Autopay": "Credit Card Autopay",
        }
        for old, new in replacements.items():
            if old.lower() in name.lower():
                return new
        # Title-case if ALL CAPS
        if name == name.upper() and len(name) > 3:
            name = name.title()
        return name

    @app.get("/api/dashboard")
    async def api_dashboard(month: str = ""):
        # month="" means all-time (the default)
        EXCLUDE = ('transfer', 'rewards', 'misc')
        date_filter = f"{month}%" if month else "%"

        with storage.get_db(config) as conn:
            # Available months for picker
            available_months = [
                r[0] for r in conn.execute(
                    "SELECT DISTINCT substr(date,1,7) FROM transactions WHERE date IS NOT NULL ORDER BY 1 DESC"
                ).fetchall() if r[0]
            ]

            # Total tracked (always all-time)
            total_spent = conn.execute(
                "SELECT SUM(amount) FROM transactions WHERE direction='expense' AND category NOT IN (?,?,?)",
                EXCLUDE
            ).fetchone()[0] or 0

            # Period spend
            period_spent = conn.execute(
                "SELECT SUM(amount) FROM transactions WHERE direction='expense' AND category NOT IN (?,?,?) AND date LIKE ?",
                (*EXCLUDE, date_filter)
            ).fetchone()[0] or 0

            # Previous month spend (for delta — only meaningful when a month is selected)
            prev_spent = 0
            prev_month = ""
            if month and len(month) == 7:
                yr, mo = int(month[:4]), int(month[5:])
                prev_mo = mo - 1 or 12
                prev_yr = yr if mo > 1 else yr - 1
                prev_month = f"{prev_yr:04d}-{prev_mo:02d}"
                prev_spent = conn.execute(
                    "SELECT SUM(amount) FROM transactions WHERE direction='expense' AND category NOT IN (?,?,?) AND date LIKE ?",
                    (*EXCLUDE, f"{prev_month}%")
                ).fetchone()[0] or 0

            # Category breakdown
            cats = conn.execute(
                """SELECT category, SUM(amount) as total, COUNT(*) as count
                   FROM transactions
                   WHERE direction='expense' AND category NOT IN (?,?,?) AND date LIKE ?
                   GROUP BY category ORDER BY total DESC""",
                (*EXCLUDE, date_filter)
            ).fetchall()

            # Top merchant per category
            top_merchants = {}
            for cat, _, _ in cats:
                row = conn.execute(
                    """SELECT merchant, SUM(amount) as s FROM transactions
                       WHERE category=? AND direction='expense' AND date LIKE ?
                       GROUP BY merchant ORDER BY s DESC LIMIT 1""",
                    (cat, date_filter)
                ).fetchone()
                if row:
                    top_merchants[cat] = _clean_merchant(row[0])

            # Recent transactions — filtered to month, excluding transfers
            recent = conn.execute(
                """SELECT date, merchant, amount, currency, category, direction
                   FROM transactions
                   WHERE category != 'transfer' AND date LIKE ?
                   ORDER BY date DESC LIMIT 20""",
                (date_filter,)
            ).fetchall()

            # Spending trend: monthly totals for last 8 months
            trend_rows = conn.execute(
                """SELECT substr(date,1,7) as m, SUM(amount) as total
                   FROM transactions
                   WHERE direction='expense' AND category NOT IN (?,?,?) AND date IS NOT NULL
                   GROUP BY m ORDER BY m DESC LIMIT 8""",
                EXCLUDE
            ).fetchall()

            # Counts (all-time)
            doc_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            txn_count = conn.execute(
                "SELECT COUNT(*) FROM transactions WHERE category != 'transfer'"
            ).fetchone()[0]

            currency = (conn.execute(
                "SELECT currency FROM transactions GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1"
            ).fetchone() or ["HKD"])[0]

        cat_total = sum(r[1] for r in cats) or 1
        delta_pct = round((period_spent - prev_spent) / prev_spent * 100, 1) if prev_spent else None

        return {
            "currency": currency,
            "total_spent": round(total_spent, 2),
            "period_spent": round(period_spent, 2),
            "prev_spent": round(prev_spent, 2),
            "delta_pct": delta_pct,
            "selected_month": month,
            "available_months": available_months,
            "doc_count": doc_count,
            "txn_count": txn_count,
            "categories": [
                {
                    "name": r[0],
                    "total": round(r[1], 2),
                    "count": r[2],
                    "pct": round(r[1] / cat_total * 100, 1),
                    "top_merchant": top_merchants.get(r[0], ""),
                }
                for r in cats
            ],
            "recent": [
                {
                    "date": r[0],
                    "merchant": _clean_merchant(r[1]),
                    "amount": round(r[2], 2),
                    "currency": r[3],
                    "category": r[4],
                    "direction": r[5],
                }
                for r in recent
            ],
            "trend": [
                {"month": r[0], "total": round(r[1], 2)}
                for r in reversed(trend_rows)
            ],
        }

    @app.get("/api/transactions/by-category")
    async def api_txns_by_category(category: str, month: str = ""):
        with storage.get_db(config) as conn:
            sql = "SELECT date, merchant, amount, currency, direction FROM transactions WHERE category = ?"
            params: list = [category]
            if month:
                sql += " AND date LIKE ?"
                params.append(f"{month}%")
            sql += " ORDER BY date DESC"
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "date": r[0],
                "merchant": _clean_merchant(r[1]),
                "amount": round(r[2], 2),
                "currency": r[3],
                "direction": r[4],
            }
            for r in rows
        ]

    @app.get("/api/insights")
    async def api_insights():
        docs = storage.get_documents(config, limit=50)
        if not docs:
            return {"cards": [], "generated_at": None}
        context = _build_full_context(docs)
        prompt = (
            "You are an AI financial assistant. Analyse the user's documents below and "
            "return a JSON array of exactly 6 insight cards. Each card must have these fields:\n"
            "  icon (single emoji), title (short label), value (the key number or date), "
            "detail (one concise sentence of context)\n\n"
            "Focus on: total spend by category, upcoming renewals or due dates, largest single expense, "
            "spending trends, any alerts or anomalies worth flagging.\n"
            "Return ONLY valid JSON — no markdown, no explanation.\n\n"
            f"Documents:\n{context}"
        )
        try:
            import anthropic, json as _json
            client = anthropic.Anthropic(api_key=config.anthropic_api_key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text.strip()
            # strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            cards = _json.loads(raw.strip())
            from datetime import datetime, timezone
            return {"cards": cards, "generated_at": datetime.now(timezone.utc).isoformat()}
        except Exception as e:
            return {"cards": [], "error": str(e)}

    @app.post("/api/chat")
    async def api_chat(request: Request):
        body = await request.json()
        msg = (body.get("message") or "").strip()
        if not msg:
            return {"message": ""}
        docs = storage.get_documents(config, limit=50)
        context = _build_full_context(docs)
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=config.anthropic_api_key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=(
                    "You are Save My Brain AI, a personal finance assistant. "
                    "Answer questions using the actual transaction data and document summaries provided. "
                    "Always use real numbers from the data — never estimate. "
                    "Format: plain section headers (no # symbols), bullet points starting with '- ', "
                    "bold key numbers as **HKD X**. Be concise.\n\n"
                    f"{context or 'No documents yet.'}"
                ),
                messages=[{"role": "user", "content": msg}],
            )
            return {"message": resp.content[0].text}
        except Exception as e:
            return {"message": f"Sorry, I couldn't process that: {e}"}

    # ── End REST API ─────────────────────────────────────────────────────────

    @app.get("/", response_class=HTMLResponse)
    async def dashboard(request: Request):
        summaries = []
        for entity in config.entities:
            txns = storage.get_transactions(config, entity=entity)
            income = sum(t["amount"] for t in txns if t["direction"] == "income")
            expenses = sum(t["amount"] for t in txns if t["direction"] == "expense")
            summaries.append({
                "entity": entity, "income": income,
                "expenses": expenses, "net": income - expenses,
                "count": len(txns),
            })
        return templates.TemplateResponse(request, "dashboard.html",
                                          {"summaries": summaries})

    @app.get("/transactions", response_class=HTMLResponse)
    async def transactions(request: Request, entity: str = None, month: str = None,
                           category: str = None, direction: str = None):
        txns = storage.get_transactions(
            config, entity=entity, month=month, category=category, direction=direction
        )
        return templates.TemplateResponse(request, "transactions.html", {
            "transactions": txns,
            "entities": config.entities, "categories": _CATEGORIES,
            "entity": entity, "month": month, "category": category, "direction": direction,
        })

    @app.get("/upload", response_class=HTMLResponse)
    async def upload_page(request: Request, message: str = None):
        return templates.TemplateResponse(request, "upload.html",
                                          {"message": message,
                                           "entities": config.entities})

    @app.post("/upload")
    async def upload_file(request: Request, file: UploadFile = File(...),
                          entity: str = None):
        suffix = Path(file.filename).suffix or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
            tf.write(await file.read())
            tmp_path = Path(tf.name)

        h = storage.file_hash(tmp_path)
        if storage.is_duplicate(config, h):
            tmp_path.unlink(missing_ok=True)
            return RedirectResponse(url="/upload?message=Duplicate+already+processed",
                                    status_code=303)

        try:
            result = extract_document(config, tmp_path)
            classify(result, config.entities)
            used_entity = entity or result.entity or "unknown"
            doc_id = storage.save_document(
                config, used_entity, result.doc_type, result.issuer,
                result.doc_date, result.currency, result.total,
                h, str(tmp_path), result.summary,
            )
            storage.save_transactions(config, doc_id, used_entity, result.transactions)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            return RedirectResponse(url="/upload?message=Processing+failed",
                                    status_code=303)
        tmp_path.unlink(missing_ok=True)
        return RedirectResponse(url="/transactions", status_code=303)

    @app.get("/export", response_class=HTMLResponse)
    async def export_page(request: Request, synced: int = None, csv_path: str = None):
        return templates.TemplateResponse(request, "export.html", {
            "synced": synced, "csv_path": csv_path,
        })

    @app.post("/export")
    async def do_export(request: Request):
        csv_path = exporter.export_csv(config)
        synced = exporter.sync_to_sheets(config)
        return RedirectResponse(
            url=f"/export?synced={synced}&csv_path={quote(str(csv_path), safe='')}",
            status_code=303,
        )

    return app


def run_web(config: Config) -> None:
    storage.init_db(config)
    uvicorn.run(create_app(config), host="0.0.0.0", port=config.web_port, log_level="warning")
