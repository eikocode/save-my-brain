from __future__ import annotations

import hashlib
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import Config


def _db_path(config: Config) -> Path:
    if config._db_path:
        return Path(config._db_path)
    return Path(__file__).parent.parent / "data" / "savemybrain.db"


@contextmanager
def get_db(config: Config):
    path = _db_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(config: Config) -> None:
    with get_db(config) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                entity          TEXT NOT NULL,
                doc_type        TEXT NOT NULL DEFAULT 'unknown',
                issuer          TEXT,
                doc_date        TEXT,
                currency        TEXT,
                total           REAL,
                file_hash       TEXT UNIQUE NOT NULL,
                original_path   TEXT,
                summary         TEXT,
                reference_number TEXT,
                coverage_period  TEXT,
                holdings        TEXT,
                created_at      TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dismissed_merges (
                pair_key TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                entity      TEXT NOT NULL,
                date        TEXT,
                merchant    TEXT,
                amount      REAL,
                currency    TEXT,
                category    TEXT DEFAULT 'misc',
                direction   TEXT DEFAULT 'expense',
                notes       TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fx_rates (
                base        TEXT PRIMARY KEY,
                rates_json  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
        """)


def file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def is_duplicate(config: Config, hash_val: str) -> bool:
    with get_db(config) as conn:
        row = conn.execute(
            "SELECT id FROM documents WHERE file_hash = ?", (hash_val,)
        ).fetchone()
        return row is not None


def get_document_by_hash(config: Config, hash_val: str) -> dict | None:
    with get_db(config) as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE file_hash = ?", (hash_val,)
        ).fetchone()
        return dict(row) if row else None


def save_document(config: Config, entity: str, doc_type: str, issuer: str,
                  doc_date: str, currency: str, total: float, file_hash_val: str,
                  original_path: str, summary: str,
                  reference_number: str = "", coverage_period: str = "",
                  holdings: list | None = None) -> int:
    import json as _json
    with get_db(config) as conn:
        cur = conn.execute(
            """INSERT INTO documents
               (entity, doc_type, issuer, doc_date, currency, total,
                file_hash, original_path, summary, reference_number, coverage_period, holdings, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entity, doc_type, issuer, doc_date, currency, total,
             file_hash_val, original_path, summary,
             reference_number, coverage_period,
             _json.dumps(holdings) if holdings else None,
             datetime.now(timezone.utc).isoformat()),
        )
        return cur.lastrowid


def find_insurance_duplicate(config: Config, reference_number: str, coverage_period: str) -> dict | None:
    """Check if an insurance doc with the same policy number AND overlapping coverage period already exists.

    Same policy number + different coverage year = new annual payment → not a duplicate.
    Same policy number + same coverage year = duplicate page → flag it.
    """
    if not reference_number:
        return None
    with get_db(config) as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE reference_number = ? AND doc_type IN ('insurance', 'receipt')",
            (reference_number,)
        ).fetchall()
        if not rows:
            return None
        # If no coverage period provided, any match on policy number is suspicious — return first hit
        if not coverage_period:
            return dict(rows[0])
        # Coverage period format: YYYY-MM-DD/YYYY-MM-DD
        try:
            new_start = coverage_period.split("/")[0][:7]  # YYYY-MM
        except (IndexError, AttributeError):
            return dict(rows[0])
        for row in rows:
            existing_period = row["coverage_period"] or ""
            if not existing_period:
                continue
            try:
                existing_start = existing_period.split("/")[0][:7]  # YYYY-MM
                if existing_start == new_start:
                    return dict(row)
            except (IndexError, AttributeError):
                continue
        return None


_INVESTMENT_KEYWORDS = {
    "buy", "sell", "purchase", "dividend", "dividends", "interest",
    "securities", "shares", "stock", "equity", "bond", "etf",
    "mutual fund", "trade", "proceeds", "commission",
}


def sanitise_statement_total(doc_type: str, total: float, transactions: list[dict]) -> float:
    """For bank/investment statements, zero out totals that are account balances or
    investment activity (stock trades, dividends) rather than actual spending."""
    if doc_type not in ("statement", "bank", "investment", "mortgage"):
        return total
    txn_sum = sum(abs(t.get("amount") or 0) for t in transactions)
    # Zero if total is far larger than transaction activity (account balance)
    if total > 10_000 and (txn_sum == 0 or total > txn_sum * 10):
        return 0.0
    # Zero if all transactions look like investment activity (not consumer spending)
    if transactions:
        non_misc = [t for t in transactions if t.get("category", "misc") not in ("misc", "transfer", "rewards")]
        if not non_misc:
            all_text = " ".join(
                ((t.get("merchant") or "") + " " + (t.get("notes") or "")).lower()
                for t in transactions
            )
            if any(kw in all_text for kw in _INVESTMENT_KEYWORDS):
                return 0.0
    return total


def filter_saveable_transactions(
    doc_type: str, total: float, transactions: list[dict]
) -> list[dict]:
    """Drop transactions that would double-count a policy/certificate document.

    Insurance certificates and policy letters state the premium as a figure,
    but the actual cash movement is captured by the accompanying receipt.
    Saving both creates a duplicate expense on the dashboard.

    Rule: if doc_type is 'insurance' and there is no positive-amount receipt
    transaction (i.e. all amounts match the policy face value with no payment
    reference), return an empty list — the receipt page will carry the real txn.
    """
    if doc_type != "insurance":
        return transactions
    # If total is zero there are no real payments on this page
    if total == 0:
        return []
    # If every transaction lacks a payment reference (notes mention "certificate",
    # "policy", "coverage") it's likely a policy face-value entry, not a payment
    policy_keywords = {"certificate", "policy", "coverage", "assurance", "plan"}
    filtered = []
    for t in transactions:
        notes_lower = (t.get("notes") or "").lower()
        if any(kw in notes_lower for kw in policy_keywords):
            continue
        filtered.append(t)
    return filtered


def save_transactions(config: Config, doc_id: int, entity: str,
                      transactions: list[dict]) -> None:
    with get_db(config) as conn:
        conn.executemany(
            """INSERT INTO transactions
               (document_id, entity, date, merchant, amount,
                currency, category, direction, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (doc_id, entity,
                 t.get("date"), t.get("merchant"), t.get("amount"),
                 t.get("currency"), t.get("category", "misc"),
                 t.get("direction", "expense"), t.get("notes"))
                for t in transactions
            ],
        )


def get_documents(config: Config, limit: int | None = None) -> list[dict]:
    sql = "SELECT * FROM documents ORDER BY created_at DESC"
    params: list = []
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    with get_db(config) as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


_SPENDING_TYPES = {"credit_card", "receipt", "invoice", "insurance"}
_NON_SPENDING_TYPES = {"bank", "investment", "mortgage", "statement"}


def get_entity_summaries(config: Config) -> list[dict]:
    sql = """
        SELECT
            entity,
            COUNT(*) AS doc_count,
            MAX(currency) AS currency,
            MAX(created_at) AS last_updated,
            GROUP_CONCAT(DISTINCT doc_type) AS doc_types,
            SUM(CASE WHEN total IS NOT NULL THEN total ELSE 0 END) AS total_amount
        FROM documents
        GROUP BY entity
        ORDER BY last_updated DESC
    """
    detail_sql = """
        SELECT entity, doc_type,
               COUNT(*) AS count,
               SUM(CASE WHEN total IS NOT NULL THEN total ELSE 0 END) AS subtotal,
               MAX(currency) AS currency
        FROM documents
        GROUP BY entity, doc_type
    """
    with get_db(config) as conn:
        rows = [dict(r) for r in conn.execute(sql).fetchall()]
        detail_rows = [dict(r) for r in conn.execute(detail_sql).fetchall()]

    # Build per-entity doc_type breakdown
    from collections import defaultdict
    breakdown: dict[str, list] = defaultdict(list)
    for r in detail_rows:
        breakdown[r["entity"]].append({
            "doc_type": r["doc_type"],
            "count": r["count"],
            "subtotal": round(r["subtotal"] or 0, 2),
            "currency": r["currency"] or "HKD",
        })

    for row in rows:
        entity = row["entity"]
        row["breakdown"] = breakdown.get(entity, [])
        # Spending total: only credit_card, receipt, invoice, insurance
        row["spending_total"] = round(sum(
            b["subtotal"] for b in row["breakdown"]
            if b["doc_type"] in _SPENDING_TYPES
        ), 2)
        # Non-spending count: bank, investment, mortgage
        row["account_count"] = sum(
            b["count"] for b in row["breakdown"]
            if b["doc_type"] in _NON_SPENDING_TYPES
        )
    return rows


def get_documents_by_entity(config: Config, entity: str,
                             page: int = 1, limit: int = 20) -> tuple[list[dict], int]:
    offset = (page - 1) * limit
    with get_db(config) as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE entity = ?", (entity,)
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM documents WHERE entity = ? ORDER BY COALESCE(doc_date, created_at) DESC LIMIT ? OFFSET ?",
            (entity, limit, offset),
        ).fetchall()
    return [dict(r) for r in rows], total


def search_documents(config: Config, query: str,
                     page: int = 1, limit: int = 20) -> tuple[list[dict], int]:
    q = f"%{query}%"
    with get_db(config) as conn:
        total = conn.execute(
            """SELECT COUNT(*) FROM documents
               WHERE issuer LIKE ? OR summary LIKE ? OR doc_type LIKE ? OR entity LIKE ?""",
            (q, q, q, q),
        ).fetchone()[0]
        rows = conn.execute(
            """SELECT * FROM documents
               WHERE issuer LIKE ? OR summary LIKE ? OR doc_type LIKE ? OR entity LIKE ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (q, q, q, q, limit, (page - 1) * limit),
        ).fetchall()
    return [dict(r) for r in rows], total


def count_uploads_this_month(config: Config) -> int:
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    with get_db(config) as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE created_at LIKE ?",
            (f"{month}%",)
        ).fetchone()
        return row[0] if row else 0


def get_expiring_documents(config: Config, days_ahead: int = 60) -> list[dict]:
    """Return documents whose coverage_period end date is within days_ahead days from today.
    Sorted by days_remaining ascending (most urgent first)."""
    from datetime import date, timedelta
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    with get_db(config) as conn:
        rows = conn.execute(
            "SELECT * FROM documents WHERE coverage_period IS NOT NULL AND coverage_period != ''"
        ).fetchall()
    results = []
    for row in [dict(r) for r in rows]:
        period = row.get("coverage_period", "")
        if not period or "/" not in period:
            continue
        try:
            end_str = period.split("/")[1][:10]
            end_date = date.fromisoformat(end_str)
            days_left = (end_date - today).days
            if -90 <= days_left <= days_ahead:
                row["expiry_date"] = end_str
                row["days_remaining"] = days_left
                results.append(row)
        except (IndexError, ValueError):
            continue
    return sorted(results, key=lambda x: x["days_remaining"])


def zero_document_total(config: Config, doc_id: int) -> None:
    with get_db(config) as conn:
        conn.execute("UPDATE documents SET total = 0 WHERE id = ?", (doc_id,))


def delete_document(config: Config, doc_id: int) -> bool:
    """Delete a document and all its data. Returns True if found and deleted, False if not found.
    Transactions cascade automatically via FK ON DELETE CASCADE."""
    with get_db(config) as conn:
        # Explicit delete of transactions as safety net (cascade handles it, but be explicit)
        conn.execute("DELETE FROM transactions WHERE document_id = ?", (doc_id,))
        cur = conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        return cur.rowcount > 0


def find_similar_entity(config: Config, new_entity: str, new_issuer: str) -> dict | None:
    """Return an existing entity that looks like the same institution as new_entity.
    Uses word-overlap on issuer names. Returns None if no similar entity found,
    or if the pair was previously dismissed by the user."""
    from difflib import SequenceMatcher
    with get_db(config) as conn:
        dismissed = {
            r[0] for r in conn.execute(
                "SELECT pair_key FROM dismissed_merges"
            ).fetchall()
        }
        rows = conn.execute(
            "SELECT DISTINCT entity, issuer FROM documents WHERE entity != ?",
            (new_entity,)
        ).fetchall()

    seen: set[str] = set()
    new_lower = new_issuer.lower()
    for entity, issuer in rows:
        if entity in seen:
            continue
        seen.add(entity)
        pair_key = "/".join(sorted([new_entity, entity]))
        if pair_key in dismissed:
            continue
        existing_lower = (issuer or "").lower()
        ratio = SequenceMatcher(None, new_lower, existing_lower).ratio()
        # Also catch containment: "Citibank" inside "Citibank (Hong Kong)"
        contained = new_lower in existing_lower or existing_lower in new_lower
        if ratio >= 0.65 or contained:
            return {"entity": entity, "issuer": issuer, "similarity": round(ratio, 2), "pair_key": pair_key}
    return None


def merge_entities(config: Config, from_entity: str, to_entity: str) -> int:
    """Move all documents and transactions from from_entity into to_entity.
    Returns number of documents moved."""
    with get_db(config) as conn:
        cur = conn.execute(
            "UPDATE documents SET entity=? WHERE entity=?", (to_entity, from_entity)
        )
        conn.execute(
            "UPDATE transactions SET entity=? WHERE entity=?", (to_entity, from_entity)
        )
        return cur.rowcount


def dismiss_merge(config: Config, pair_key: str) -> None:
    """Remember that the user said these two entities are NOT the same."""
    with get_db(config) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO dismissed_merges (pair_key) VALUES (?)", (pair_key,)
        )


def get_setting(config: Config, key: str, default: str = "") -> str:
    with get_db(config) as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row[0] if row else default


def set_setting(config: Config, key: str, value: str) -> None:
    with get_db(config) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", (key, value)
        )


def get_transactions(config: Config, entity: str = None, month: str = None,
                     category: str = None, direction: str = None) -> list[dict]:
    sql = "SELECT * FROM transactions WHERE 1=1"
    params: list = []
    if entity:
        sql += " AND entity = ?"
        params.append(entity)
    if month:
        sql += " AND date LIKE ?"
        params.append(f"{month}%")
    if category:
        sql += " AND category = ?"
        params.append(category)
    if direction:
        sql += " AND direction = ?"
        params.append(direction)
    sql += " ORDER BY date DESC"
    with get_db(config) as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
