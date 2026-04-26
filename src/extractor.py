from __future__ import annotations

import base64
import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import anthropic

from .config import Config

_IMAGE_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
}


def _claude_bin() -> str:
    found = shutil.which("claude")
    if found:
        return found
    for p in [Path.home() / ".local/bin/claude", Path("/usr/local/bin/claude")]:
        if p.exists():
            return str(p)
    raise RuntimeError("claude CLI not found — install it or set extraction_mode to 'api'")


def _build_prompt(entities: list[str]) -> str:
    entity_list = ", ".join(entities) if entities else "unknown"
    return f"""You are a financial document reader. Extract structured data from the document.

Return ONLY valid JSON — no markdown fences, no extra text:
{{
  "entity": "one of: {entity_list}, or null if uncertain",
  "entity_confidence": "high or low",
  "doc_type": "statement, receipt, invoice, insurance, or unknown",
  "issuer": "institution or merchant name as string",
  "doc_date": "YYYY-MM-DD or null",
  "currency": "3-letter code e.g. HKD",
  "total": 0.00,
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "merchant": "name",
      "amount": 0.00,
      "currency": "HKD",
      "category": "rent, utilities, insurance, management, rewards, or misc",
      "direction": "income or expense",
      "notes": "optional string or null"
    }}
  ],
  "summary": "2-3 sentence markdown summary of the document"
}}

Category rules:
- "rent": rental income received or rent paid
- "utilities": electricity, gas, water, internet, phone bills
- "insurance": insurance premiums
- "management": property management fees, agent fees
- "rewards": cashback, rebates, bank bonus credits, points redemptions — small credits from the bank itself
- "misc": everything else

Direction rules — read these carefully:
- "income": ONLY genuine income — rent received, salary, business revenue, interest earned
- "expense": ALL payments going out — purchases, bills, fees, and ALSO credit card autopay payments (even if labeled "autopay" or "payment received")
- Credit card autopay / bill payments are EXPENSES (money leaving the account to pay a card or bill)
- Small bank credits labeled as rebate, cashback, reward, or bonus → direction "income", category "rewards"
- Always use POSITIVE amounts regardless of whether the statement shows debits as negative"""


@dataclass
class ExtractionResult:
    entity: str
    entity_confidence: str
    doc_type: str
    issuer: str
    doc_date: str
    currency: str
    total: float
    transactions: list[dict] = field(default_factory=list)
    summary: str = ""
    raw: dict = field(default_factory=dict)


def extract_document(config: Config, file_path: Path) -> ExtractionResult:
    if config.extraction_mode == "api":
        return _extract_via_api(config, file_path)
    return _extract_via_oauth(config, file_path)


def _extract_via_oauth(config: Config, file_path: Path) -> ExtractionResult:
    prompt = f"Read {file_path}\n\n{_build_prompt(config.entities)}"
    result = subprocess.run(
        [_claude_bin(), "--print", "--dangerously-skip-permissions", prompt],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI failed (exit {result.returncode}): {result.stderr.strip()}"
        )
    return _parse_response(result.stdout)


def _extract_via_api(config: Config, file_path: Path) -> ExtractionResult:
    client = anthropic.Anthropic(api_key=config.anthropic_api_key)
    suffix = file_path.suffix.lower()
    data = base64.standard_b64encode(file_path.read_bytes()).decode()

    if suffix == ".pdf":
        media_block = {"type": "document",
                       "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
    else:
        media_type = _IMAGE_TYPES.get(suffix, "image/jpeg")
        media_block = {"type": "image",
                       "source": {"type": "base64", "media_type": media_type, "data": data}}

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[{"role": "user", "content": [
            media_block,
            {"type": "text", "text": _build_prompt(config.entities)},
        ]}],
    )
    return _parse_response(response.content[0].text)


def _parse_response(text: str) -> ExtractionResult:
    text = text.strip()
    # Strip markdown fences — model doesn't always follow the "no fences" instruction
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model returned non-JSON response: {e}\n\nRaw text: {text[:200]}")
    return ExtractionResult(
        entity=data.get("entity") or "",
        entity_confidence=data.get("entity_confidence", "low"),
        doc_type=data.get("doc_type", "unknown"),
        issuer=data.get("issuer") or "",
        doc_date=data.get("doc_date") or "",
        currency=data.get("currency") or "HKD",
        total=float(data.get("total") or 0),
        transactions=data.get("transactions") or [],
        summary=data.get("summary") or "",
        raw=data,
    )
