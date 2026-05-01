"""Shared chat intelligence — used by both the web API and the Telegram bot."""
from __future__ import annotations

import json
import logging

from .config import Config
from . import storage

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are Save My Brain AI, a personal finance assistant. "
    "Answer questions using the actual transaction data and document summaries provided. "
    "Always use real numbers from the data — never estimate. "
    "Keep answers concise and conversational — this is a chat, not a report. "
    "Format: plain text with bullet points starting with '- ' and bold key numbers as **HKD X**. "
    "No markdown headers. No # symbols.\n\n"
)


def build_context(config: Config) -> str:
    """Build a text context block from all documents and transactions."""
    docs = storage.get_documents(config, limit=50)
    txns = storage.get_transactions(config)
    lines = ["=== DOCUMENTS ==="]
    for d in docs:
        lines.append(
            f"[{d.get('doc_type','?')}] {d.get('issuer') or d.get('original_path')} "
            f"| date: {d.get('doc_date') or 'unknown'} "
            f"| total: {d.get('currency','')} {d.get('total') or 'N/A'}"
        )
        if d.get("summary"):
            lines.append(f"  Summary: {d['summary']}")
        holdings_raw = d.get("holdings")
        if holdings_raw:
            try:
                holdings = json.loads(holdings_raw) if isinstance(holdings_raw, str) else holdings_raw
                if holdings:
                    lines.append("  Holdings:")
                    for h in holdings:
                        lines.append(
                            f"    - {h.get('name')} | {h.get('currency','')} "
                            f"{h.get('balance','')} | type: {h.get('type','')}"
                        )
            except Exception:
                pass
    lines.append("\n=== TRANSACTIONS ===")
    for t in txns:
        lines.append(
            f"{t.get('date','?')} | {t.get('merchant','?')} | "
            f"{t.get('currency','HKD')} {t.get('amount','?')} | "
            f"{t.get('category','misc')} | {t.get('direction','expense')}"
            + (f" | {t.get('notes')}" if t.get("notes") else "")
        )
    return "\n".join(lines)


def chat_reply(config: Config, message: str) -> str:
    """Send a message to Haiku with full financial context. Returns reply text."""
    if not message.strip():
        return ""
    context = build_context(config)
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=config.anthropic_api_key)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SYSTEM_PROMPT + (context or "No documents yet."),
            messages=[{"role": "user", "content": message}],
        )
        return resp.content[0].text.strip()
    except Exception as e:
        log.error("chat_reply failed: %s", e)
        return f"Sorry, I couldn't process that: {e}"
