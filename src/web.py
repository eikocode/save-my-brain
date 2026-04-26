from __future__ import annotations

import tempfile
from pathlib import Path
from urllib.parse import quote

import uvicorn
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from .classifier import classify
from .config import Config
from .extractor import extract_document
from . import exporter, storage

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
_CATEGORIES = ["rent", "utilities", "insurance", "management", "rewards", "misc"]


def create_app(config: Config) -> FastAPI:
    app = FastAPI(title="SavemyBrain")
    templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))

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
