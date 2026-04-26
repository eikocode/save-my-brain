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
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                entity      TEXT NOT NULL,
                doc_type    TEXT NOT NULL DEFAULT 'unknown',
                issuer      TEXT,
                doc_date    TEXT,
                currency    TEXT,
                total       REAL,
                file_hash   TEXT UNIQUE NOT NULL,
                original_path TEXT,
                summary     TEXT,
                created_at  TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id),
                entity      TEXT NOT NULL,
                date        TEXT,
                merchant    TEXT,
                amount      REAL,
                currency    TEXT,
                category    TEXT DEFAULT 'misc',
                direction   TEXT DEFAULT 'expense',
                notes       TEXT
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
                  original_path: str, summary: str) -> int:
    with get_db(config) as conn:
        cur = conn.execute(
            """INSERT INTO documents
               (entity, doc_type, issuer, doc_date, currency, total,
                file_hash, original_path, summary, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entity, doc_type, issuer, doc_date, currency, total,
             file_hash_val, original_path, summary,
             datetime.now(timezone.utc).isoformat()),
        )
        return cur.lastrowid


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


def delete_document(config: Config, doc_id: int) -> None:
    with get_db(config) as conn:
        conn.execute("DELETE FROM transactions WHERE document_id = ?", (doc_id,))
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))


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
