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
        return [
            {
                "id": d["id"],
                "filename": d.get("original_filename") or d.get("filename") or "document",
                "doc_type": d.get("doc_type") or "other",
                "summary": d.get("summary"),
                "uploaded_at": d.get("created_at"),
                "family_member_id": None,
                "key_points": None,
                "red_flags": None,
                "structured_data": None,
            }
            for d in docs
        ]

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

    @app.post("/api/chat")
    async def api_chat(request: Request):
        body = await request.json()
        msg = (body.get("message") or "").strip()
        if not msg:
            return {"message": ""}
        docs = storage.get_documents(config, limit=20)
        context = "\n".join(
            f"- [{d.get('doc_type','?')}] {d.get('issuer') or d.get('filename')} "
            f"{d.get('doc_date','')} {d.get('currency','')} {d.get('total') or ''}"
            for d in docs
        )
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=config.anthropic_api_key)
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=(
                    "You are Save My Brain AI, a business document assistant. "
                    "Answer questions based on the user's saved documents. Be concise.\n\n"
                    f"Documents on file:\n{context or 'None yet.'}"
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
