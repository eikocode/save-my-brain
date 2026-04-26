import csv
from pathlib import Path

from .config import Config

CREDENTIALS_PATH = Path.home() / ".ledger" / "google-credentials.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

CSV_HEADERS = [
    "id", "entity", "date", "merchant", "amount", "currency",
    "category", "direction", "issuer", "doc_date", "doc_type", "doc_id",
]


def get_csv_path(config: Config) -> Path:
    p = Path(config.output_folder).expanduser() / "exports" / "ledger.csv"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def export_csv(config: Config) -> Path:
    """Overwrite CSV with all transactions from DB."""
    from . import storage
    txns = storage.get_transactions(config)
    docs = {d["id"]: d for d in storage.get_documents(config)}
    path = get_csv_path(config)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)
        writer.writeheader()
        for t in txns:
            doc = docs.get(t.get("document_id"), {})
            writer.writerow({
                "id": t.get("id", ""),
                "entity": t.get("entity", ""),
                "date": t.get("date", ""),
                "merchant": t.get("merchant", ""),
                "amount": t.get("amount", ""),
                "currency": t.get("currency", ""),
                "category": t.get("category", ""),
                "direction": t.get("direction", ""),
                "issuer": doc.get("issuer", ""),
                "doc_date": doc.get("doc_date", ""),
                "doc_type": doc.get("doc_type", ""),
                "doc_id": t.get("document_id", ""),
            })
    return path


def sync_to_sheets(config: Config) -> int:
    """Clear and rewrite Google Sheet with all transactions. Returns row count."""
    from . import storage
    if not config.google_sheet_id or not CREDENTIALS_PATH.exists():
        return 0
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        creds = Credentials.from_service_account_file(str(CREDENTIALS_PATH), scopes=SCOPES)
        gc = gspread.authorize(creds)
        sheet = gc.open_by_key(config.google_sheet_id).sheet1
    except Exception:
        return 0

    txns = storage.get_transactions(config)
    docs = {d["id"]: d for d in storage.get_documents(config)}
    rows = [CSV_HEADERS]
    for t in txns:
        doc = docs.get(t.get("document_id"), {})
        rows.append([
            t.get("id", ""), t.get("entity", ""), t.get("date", ""),
            t.get("merchant", ""), t.get("amount", ""), t.get("currency", ""),
            t.get("category", ""), t.get("direction", ""),
            doc.get("issuer", ""), doc.get("doc_date", ""), doc.get("doc_type", ""),
            t.get("document_id", ""),
        ])
    sheet.clear()
    if len(rows) > 1:
        sheet.update("A1", rows)
    return len(rows) - 1
