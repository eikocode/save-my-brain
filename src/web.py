from __future__ import annotations

import asyncio
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
from . import exporter, fx, score as score_mod, storage

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
        entity = d.get("entity") or "unknown"
        raw_issuer = d.get("issuer") or ""
        # Use entity alias for display if issuer maps to a known brand
        display_issuer = _entity_display(entity) if entity != "unknown" else raw_issuer
        return {
            "id": d["id"],
            "entity": entity,
            "filename": d.get("original_path") or "document",
            "doc_type": d.get("doc_type") or "other",
            "issuer": display_issuer,
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

    _CORPORATE_TAIL = {
        "clearing", "corporation", "limited", "ltd", "co",
        "inc", "llc", "plc", "pte", "group", "holdings",
        "international", "securities", "financial", "services",
        "company", "enterprises", "asset", "management",
    }
    # Known clearing-house → brand mappings
    _ENTITY_ALIASES = {
        "apex clearing": "Firstrade",
        "apex_clearing": "Firstrade",
    }
    _ALL_CAPS_BRANDS = {
        "hsbc", "bea", "dbs", "uob", "ocbc", "icbc", "boc", "aia",
        "mtr", "amex", "hkex", "bnp", "atm", "td", "etf", "ira",
    }

    def _entity_display(entity: str) -> str:
        if not entity or entity == "unknown":
            return "Unclassified"
        # Check alias map first
        key = entity.replace("_", " ").lower().strip()
        for alias, canonical in _ENTITY_ALIASES.items():
            if key.startswith(alias):
                return canonical
        words = entity.replace("_", " ").split()
        # Strip trailing generic corporate words, keeping at least 2 words
        while len(words) > 2 and words[-1].lower().rstrip(".") in _CORPORATE_TAIL:
            words.pop()
        # Apply casing: all-caps for known brands or originally-all-caps words
        result = []
        for word in words:
            if word.lower().rstrip(".") in _ALL_CAPS_BRANDS or (len(word) > 1 and word.isupper()):
                result.append(word.upper())
            else:
                result.append(word.capitalize())
        return " ".join(result)

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
                "spending_total": s.get("spending_total", 0),
                "account_count": s.get("account_count", 0),
                "currency": s["currency"] or "HKD",
                "last_updated": (s["last_updated"] or "")[:10],
                "doc_types": (s["doc_types"] or "").split(","),
                "breakdown": s.get("breakdown", []),
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

    @app.get("/api/documents/{doc_id}/transactions")
    async def api_doc_transactions(doc_id: int):
        with storage.get_db(config) as conn:
            rows = conn.execute(
                "SELECT date, merchant, amount, currency, category, direction, notes "
                "FROM transactions WHERE document_id = ? ORDER BY date",
                (doc_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    @app.get("/api/documents/{doc_id}/holdings")
    async def api_doc_holdings(doc_id: int):
        with storage.get_db(config) as conn:
            row = conn.execute(
                "SELECT holdings FROM documents WHERE id = ?", (doc_id,)
            ).fetchone()
        if not row or not row["holdings"]:
            return []
        import json as _json
        try:
            return _json.loads(row["holdings"]) if isinstance(row["holdings"], str) else (row["holdings"] or [])
        except Exception:
            return []

    @app.delete("/api/documents/{doc_id}", status_code=200)
    async def api_delete_document(doc_id: int):
        deleted = storage.delete_document(config, doc_id)
        if not deleted:
            return JSONResponse(status_code=404, content={"detail": f"Document {doc_id} not found"})
        return {"ok": True}

    @app.post("/api/documents/upload", status_code=201)
    async def api_upload(file: UploadFile = File(...)):
        suffix = Path(file.filename or "upload").suffix or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
            tf.write(await file.read())
            tmp_path = Path(tf.name)

        if config.monthly_upload_limit > 0:
            used = storage.count_uploads_this_month(config)
            if used >= config.monthly_upload_limit:
                tmp_path.unlink(missing_ok=True)
                return JSONResponse(status_code=429, content={
                    "detail": f"Monthly upload limit reached ({config.monthly_upload_limit} documents). Upgrade your plan to upload more."
                })

        h = storage.file_hash(tmp_path)
        if storage.is_duplicate(config, h):
            tmp_path.unlink(missing_ok=True)
            return JSONResponse(status_code=409, content={"detail": "Duplicate — already processed"})

        doc_id = None
        result = None
        entity = "unknown"
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, extract_document, config, tmp_path)
            classify(result, config.entities)
            from .bot import _entity_from_result
            entity = _entity_from_result(result)

            # Insurance duplicate check: same policy number + same coverage year
            if result.doc_type == "insurance" and result.reference_number:
                existing = storage.find_insurance_duplicate(config, result.reference_number, result.coverage_period)
                if existing:
                    tmp_path.unlink(missing_ok=True)
                    return JSONResponse(status_code=409, content={
                        "detail": f"Duplicate — policy {result.reference_number} for this coverage period already saved (doc ID {existing['id']})"
                    })

            safe_total = storage.sanitise_statement_total(result.doc_type, result.total, result.transactions)
            doc_id = storage.save_document(
                config, entity, result.doc_type, result.issuer,
                result.doc_date, result.currency, safe_total,
                h, file.filename or "upload", result.summary,
                result.reference_number, result.coverage_period,
                result.holdings,
            )
            txns = storage.filter_saveable_transactions(result.doc_type, result.total, result.transactions)
            if not txns and result.doc_type == "insurance":
                storage.zero_document_total(config, doc_id)
            storage.save_transactions(config, doc_id, entity, txns)
        except Exception as e:
            tmp_path.unlink(missing_ok=True)
            if "UNIQUE constraint failed" in str(e):
                return JSONResponse(status_code=409, content={"detail": "Duplicate — already processed"})
            # Document was already saved — anything that failed after is non-critical
            if doc_id is not None:
                return {"id": doc_id, "filename": file.filename,
                        "doc_type": result.doc_type if result else "unknown", "summary": ""}
            return JSONResponse(status_code=422, content={"detail": str(e)})

        tmp_path.unlink(missing_ok=True)
        response: dict = {"id": doc_id, "filename": file.filename,
                          "doc_type": result.doc_type, "summary": result.summary}
        # Check if the new entity looks like an existing one
        similar = storage.find_similar_entity(config, entity, result.issuer)
        if similar:
            response["suggested_merge"] = {
                "new_entity": entity,
                "new_issuer": result.issuer,
                "existing_entity": similar["entity"],
                "existing_issuer": similar["issuer"],
                "pair_key": similar["pair_key"],
            }
        return response

    @app.post("/api/entities/merge")
    async def api_merge_entities(body: dict):
        from_entity = body.get("from_entity", "")
        to_entity = body.get("to_entity", "")
        if not from_entity or not to_entity:
            return JSONResponse(status_code=400, content={"detail": "from_entity and to_entity required"})
        moved = storage.merge_entities(config, from_entity, to_entity)
        return {"ok": True, "moved": moved, "into": to_entity}

    @app.post("/api/entities/dismiss-merge")
    async def api_dismiss_merge(body: dict):
        pair_key = body.get("pair_key", "")
        if not pair_key:
            return JSONResponse(status_code=400, content={"detail": "pair_key required"})
        storage.dismiss_merge(config, pair_key)
        return {"ok": True}

    @app.get("/api/alerts/renewals")
    async def api_renewals(days: int = 60):
        docs = storage.get_expiring_documents(config, days_ahead=days)
        return [
            {
                "id": d["id"],
                "entity": d.get("entity") or "unknown",
                "issuer": d.get("issuer") or d.get("entity"),
                "doc_type": d.get("doc_type"),
                "reference_number": d.get("reference_number") or "",
                "expiry_date": d["expiry_date"],
                "days_remaining": d["days_remaining"],
            }
            for d in docs
        ]

    def _build_full_context(docs: list[dict]) -> str:
        import json as _json
        txns = storage.get_transactions(config)
        lines = ["=== DOCUMENTS ==="]
        for d in docs:
            lines.append(
                f"[{d.get('doc_type','?')}] {d.get('issuer') or d.get('original_path')} "
                f"| date: {d.get('doc_date') or 'unknown'} "
                f"| total: {d.get('currency','')} {d.get('total') or 'N/A'}"
            )
            if d.get('summary'):
                lines.append(f"  Summary: {d['summary']}")
            holdings_raw = d.get('holdings')
            if holdings_raw:
                try:
                    holdings = _json.loads(holdings_raw) if isinstance(holdings_raw, str) else holdings_raw
                    if holdings:
                        lines.append("  Holdings:")
                        for h in holdings:
                            lines.append(f"    - {h.get('name')} | {h.get('currency','')} {h.get('balance','')} | type: {h.get('type','')}")
                except Exception:
                    pass
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

        # 1. Strip payment processor prefixes
        name = re.sub(
            r"^(BBMSL\*|KPAY\*|DNH\*|SQ \*|TST\*|STRIPE\*|PP\*|PAYPAL \*|AMZN\*|APL\*)",
            "", name, flags=re.I,
        ).strip()

        # 2. Substring brand normalization — first match wins (most specific first)
        _BRANDS = [
            # Autopay / transfers
            ("autopay", "Credit Card Autopay"),
            ("paid by auto", "Credit Card Autopay"),
            ("payment received", "Credit Card Autopay"),
            # Apple
            ("apple.com/bill", "Apple Subscriptions"),
            ("apple subscriptions", "Apple Subscriptions"),
            # Known merchants
            ("city super", "City Super"),
            ("aaaaccelerator", "AAA Accelerator"),
            ("thinkific", "Thinkific"),
            ("fleuria", "Fleuria"),
            ("slowood", "Slowood"),
            ("great food", "Great"),
            ("great 2", "Great"),
            ("sogo", "Sogo"),
            ("american express", "Amex Annual Fee"),
            ("amex annual", "Amex Annual Fee"),
            # F&B chains
            ("mcdonald", "McDonald's"),
            ("starbucks", "Starbucks"),
            ("kfc", "KFC"),
            ("cafe de coral", "Café de Coral"),
            ("caféde coral", "Café de Coral"),
            ("fairwood", "Fairwood"),
            ("maxim", "Maxim's"),
            ("pacific coffee", "Pacific Coffee"),
            ("oliver's", "Oliver's"),
            ("pret a manger", "Pret A Manger"),
            ("subway", "Subway"),
            ("pizza hut", "Pizza Hut"),
            ("burger king", "Burger King"),
            ("yoshinoya", "Yoshinoya"),
            ("mak's noodle", "Mak's Noodle"),
            # Supermarkets / convenience
            ("7-eleven", "7-Eleven"),
            ("7eleven", "7-Eleven"),
            ("wellcome", "Wellcome"),
            ("park n shop", "Park N Shop"),
            ("parknshop", "Park N Shop"),
            ("circle k", "Circle K"),
            ("watsons", "Watsons"),
            ("mannings", "Mannings"),
            ("hktvmall", "HKTVmall"),
            # Retail
            ("uniqlo", "Uniqlo"),
            ("zara", "Zara"),
            ("h&m", "H&M"),
            ("ikea", "IKEA"),
            ("muji", "Muji"),
            ("log-on", "LOG-ON"),
            ("logon", "LOG-ON"),
            ("three sixty", "ThreeSixty"),
            # Transport
            ("mtr", "MTR"),
            ("octopus", "Octopus"),
            ("uber", "Uber"),
            ("taxi", "Taxi"),
            # Online / software
            ("netflix", "Netflix"),
            ("spotify", "Spotify"),
            ("google", "Google"),
            ("amazon", "Amazon"),
            ("dropbox", "Dropbox"),
            ("notion", "Notion"),
            ("openai", "OpenAI"),
            ("anthropic", "Anthropic"),
            ("chatgpt", "ChatGPT"),
        ]
        name_lower = name.lower()
        for pattern, canonical in _BRANDS:
            if pattern in name_lower:
                return canonical

        # 3. Strip trailing store/branch numbers (e.g. "WATSONS 0234", "CIRCLE K #042")
        name = re.sub(r"[\s#\-]+\d{3,}\s*$", "", name).strip()

        # 4. Strip trailing HK district/location codes
        name = re.sub(
            r"\s+(HKG|HK|HONGKONG|HONG\s*KONG|CWB|TST|MK|NP|TKO|TW|SKM|KLN|KOWLOON|ADMIRALTY|CENTRAL|WANCHAI|MONGKOK|SHATIN|TAIKOO)\s*$",
            "", name, flags=re.I,
        ).strip()

        # 5. Strip trailing .com domain junk (e.g. "NOTION.SO", "SPOTIFY.COM")
        name = re.sub(r"\.(com|io|so|co|app|net|org)\b.*$", "", name, flags=re.I).strip()

        # 6. Title-case if ALL CAPS
        if name == name.upper() and len(name) > 3:
            name = name.title()

        return name

    @app.get("/api/settings")
    async def api_get_settings():
        return {
            "base_currency": storage.get_setting(config, "base_currency", "HKD"),
        }

    @app.patch("/api/settings")
    async def api_update_settings(body: dict):
        allowed = {"base_currency"}
        for key, value in body.items():
            if key in allowed:
                storage.set_setting(config, key, str(value))
        return {"ok": True}

    @app.get("/api/dashboard")
    async def api_dashboard(month: str = ""):
        from collections import defaultdict

        base_currency = storage.get_setting(config, "base_currency", "HKD")
        rates = fx.get_rates(config, base_currency)

        EXCLUDE = ("transfer", "rewards", "misc")

        with storage.get_db(config) as conn:
            available_months = [
                r[0] for r in conn.execute(
                    "SELECT DISTINCT substr(date,1,7) FROM transactions WHERE date IS NOT NULL ORDER BY 1 DESC"
                ).fetchall() if r[0]
            ]
            doc_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            txn_count = conn.execute(
                "SELECT COUNT(*) FROM transactions WHERE category != 'transfer'"
            ).fetchone()[0]
            # Fetch all transactions for Python-level FX aggregation
            all_rows = conn.execute(
                "SELECT amount, currency, category, direction, date, merchant FROM transactions WHERE date IS NOT NULL"
            ).fetchall()

        def net(amount, currency, direction, category):
            a = fx.to_base(amount or 0, currency or base_currency, base_currency, rates)
            if direction == "expense":
                return a
            if direction == "income" and category not in ("rent", "rewards"):
                return -a
            return 0

        def in_period(date):
            if not month:
                return True
            return (date or "").startswith(month)

        # All-time total (exclude EXCLUDE)
        total_spent = sum(
            net(r[0], r[1], r[3], r[2]) for r in all_rows if r[2] not in EXCLUDE
        )

        # Period rows
        period_rows = [r for r in all_rows if in_period(r[4])]

        period_spent = sum(
            net(r[0], r[1], r[3], r[2]) for r in period_rows if r[2] not in EXCLUDE
        )

        # Previous month
        prev_spent = 0
        prev_month = ""
        if month and len(month) == 7:
            yr, mo = int(month[:4]), int(month[5:])
            prev_mo = mo - 1 or 12
            prev_yr = yr if mo > 1 else yr - 1
            prev_month = f"{prev_yr:04d}-{prev_mo:02d}"
            prev_rows = [r for r in all_rows if (r[4] or "").startswith(prev_month)]
            prev_spent = sum(
                net(r[0], r[1], r[3], r[2]) for r in prev_rows if r[2] not in EXCLUDE
            )

        # Category breakdown (period)
        cat_totals: dict = defaultdict(float)
        cat_counts: dict = defaultdict(int)
        cat_merchant_spend: dict = defaultdict(lambda: defaultdict(float))
        for r in period_rows:
            if r[2] in EXCLUDE:
                continue
            n = net(r[0], r[1], r[3], r[2])
            if n > 0:
                cat_totals[r[2]] += n
                cat_counts[r[2]] += 1
            if r[3] == "expense":
                cat_merchant_spend[r[2]][r[5] or ""] += fx.to_base(
                    r[0] or 0, r[1] or base_currency, base_currency, rates
                )

        top_merchants = {
            cat: _clean_merchant(max(merchants, key=merchants.get))
            for cat, merchants in cat_merchant_spend.items() if merchants
        }
        cats = sorted(
            [(cat, total, cat_counts[cat]) for cat, total in cat_totals.items() if total > 0],
            key=lambda x: -x[1],
        )
        cat_total = sum(c[1] for c in cats) or 1

        # Monthly trend (last 8 months with positive spend)
        month_totals: dict = defaultdict(float)
        for r in all_rows:
            if r[2] not in EXCLUDE and r[4]:
                month_totals[r[4][:7]] += net(r[0], r[1], r[3], r[2])
        trend = sorted(
            [{"month": m, "total": round(t, 2)} for m, t in month_totals.items() if t > 0],
            key=lambda x: x["month"],
        )[-8:]

        # Recent (keep original currency for display)
        recent = sorted(
            [r for r in period_rows if r[2] != "transfer"],
            key=lambda r: r[4] or "",
            reverse=True,
        )[:20]

        # Flag if data has multiple currencies
        currencies_in_use = {(r[1] or base_currency).upper() for r in all_rows if r[1]}
        multi_currency = len(currencies_in_use) > 1

        delta_pct = round((period_spent - prev_spent) / prev_spent * 100, 1) if prev_spent else None

        # ── Clarity Score ─────────────────────────────────────────────
        score_data = score_mod.compute_score(config)

        # ── Action items ──────────────────────────────────────────────
        from datetime import date as _date, timedelta as _td
        action_items = []

        # Type 1: Renewals — insurance docs expiring within 60 days
        expiring = storage.get_expiring_documents(config, days_ahead=60)
        for doc in expiring[:3]:
            days = doc["days_remaining"]
            if days < 0:
                continue
            issuer = doc.get("issuer") or doc.get("entity") or "Policy"
            total = doc.get("total")
            subtext = f"HKD {total:,.0f} due" if total else f"Expires {doc['expiry_date']}"
            action_items.append({
                "type": "renewal",
                "text": f"{issuer} renews in {days}d",
                "subtext": subtext,
                "cta": "URGENT",
                "days_remaining": days,
            })

        # Type 2: Upload nudges — missing statement for current or prior month
        _today = _date.today()
        _cur_month = _today.strftime("%Y-%m")
        _prev_month = (_today.replace(day=1) - _td(days=1)).strftime("%Y-%m")
        _uploaded_months = set(available_months)
        if _cur_month not in _uploaded_months and _prev_month not in _uploaded_months:
            action_items.append({
                "type": "upload",
                "text": f"Upload {_prev_month} bank statement",
                "subtext": "Last sync: " + (available_months[0] if available_months else "never"),
                "cta": "+8 pts",
            })
        elif _cur_month not in _uploaded_months and _today.day >= 5:
            action_items.append({
                "type": "upload",
                "text": f"Upload {_cur_month} statement",
                "subtext": "Keep your picture current",
                "cta": "+8 pts",
            })

        # Type 3: AI insights — biggest spending category up >20% vs prior month
        prior_cat_totals: dict = {}
        if prev_month:
            prev_cat_rows = [r for r in all_rows if (r[4] or "").startswith(prev_month)]
            for r in prev_cat_rows:
                if r[2] not in EXCLUDE:
                    n = net(r[0], r[1], r[3], r[2])
                    if n > 0:
                        prior_cat_totals[r[2]] = prior_cat_totals.get(r[2], 0) + n

        insight_added = False
        for r in cats:
            cat_name, cat_total_val = r[0], r[1]
            prior = prior_cat_totals.get(cat_name, 0)
            if prior > 0 and cat_total_val > 0 and not insight_added:
                pct_change = round((cat_total_val - prior) / prior * 100)
                if pct_change >= 20:
                    action_items.append({
                        "type": "insight",
                        "text": f"{cat_name.capitalize()} ↑{pct_change}% this month",
                        "subtext": "Ask AI to break it down",
                        "cta": "ASK",
                        "prefill": f"Break down my {cat_name} spending this month",
                    })
                    insight_added = True

        return {
            "base_currency": base_currency,
            "multi_currency": multi_currency,
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
                    "date": r[4],
                    "merchant": _clean_merchant(r[5]),
                    "amount": round(r[0] or 0, 2),
                    "currency": r[1] or base_currency,
                    "category": r[2],
                    "direction": r[3],
                }
                for r in recent
            ],
            "trend": trend,
            "clarity_score": score_data["score"],
            "score_delta": score_data["delta"],
            "score_nudge": score_data["nudge"],
            "action_items": action_items,
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
        from .intelligence import chat_reply
        body = await request.json()
        msg = (body.get("message") or "").strip()
        if not msg:
            return {"message": ""}
        loop = asyncio.get_event_loop()
        reply = await loop.run_in_executor(None, chat_reply, config, msg)
        score_mod.record_chat_event(config)
        return {"message": reply}

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
