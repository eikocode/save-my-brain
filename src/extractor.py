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

_PDF_TEXT_LIMIT = 80_000  # chars per chunk
_CHUNK_PAGES = 15         # pages per extraction chunk
_PAGE_THRESHOLD = 20      # use chunking for PDFs longer than this


def _pdf_page_count(file_path: Path) -> int:
    try:
        import fitz
        doc = fitz.open(str(file_path))
        n = len(doc)
        doc.close()
        return n
    except Exception:
        return 0


def _extract_pdf_text(file_path: Path, start: int = 0, end: int | None = None) -> str:
    """Extract plain text from a PDF page range using PyMuPDF."""
    try:
        import fitz
        doc = fitz.open(str(file_path))
        stop = end if end is not None else len(doc)
        parts = [doc[i].get_text() for i in range(start, min(stop, len(doc)))]
        doc.close()
        return "\n".join(parts).strip()[:_PDF_TEXT_LIMIT]
    except Exception:
        return ""


def _merge_results(chunks: list[ExtractionResult]) -> ExtractionResult:
    """Merge chunk results: metadata from first chunk, transactions/holdings from all."""
    if len(chunks) == 1:
        return chunks[0]
    base = chunks[0]
    seen_txn: set = set()
    all_txns: list = []
    for chunk in chunks:
        for t in chunk.transactions:
            key = (t.get("date"), t.get("amount"), (t.get("merchant") or "")[:20])
            if key not in seen_txn:
                seen_txn.add(key)
                all_txns.append(t)
    seen_holding: set = set()
    all_holdings: list = []
    for chunk in chunks:
        for h in chunk.holdings:
            key = (h.get("name") or "")[:30]
            if key not in seen_holding:
                seen_holding.add(key)
                all_holdings.append(h)
    return ExtractionResult(
        entity=base.entity, entity_confidence=base.entity_confidence,
        doc_type=base.doc_type, issuer=base.issuer, doc_date=base.doc_date,
        currency=base.currency, total=base.total,
        reference_number=base.reference_number, coverage_period=base.coverage_period,
        holdings=all_holdings, transactions=all_txns, summary=base.summary,
        raw=base.raw,
    )


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
  "doc_type": "bank, credit_card, investment, mortgage, receipt, invoice, insurance, or unknown",
  "issuer": "institution or merchant name as string",
  "doc_date": "YYYY-MM-DD or null",
  "currency": "3-letter code e.g. HKD",
  "total": 0.00,
  "reference_number": "policy number, invoice number, receipt number, or null — the primary ID on this document",
  "coverage_period": "YYYY-MM-DD/YYYY-MM-DD for insurance (start/end of coverage), or null",
  "holdings": [
    {{
      "name": "account or product name e.g. AIA Life Insurance Plan, Call Deposit HKD, Mutual Fund",
      "balance": 0.00,
      "currency": "HKD",
      "type": "insurance, deposit, investment, credit_card, loan, or other"
    }}
  ],
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "merchant": "name",
      "amount": 0.00,
      "currency": "HKD",
      "category": "one of the categories below",
      "direction": "income or expense",
      "notes": "optional string or null"
    }}
  ],
  "summary": "2-3 sentence summary of the document"
}}

Field rules:
- "total": sum of actual payment/transaction amounts in this document. NEVER use account balance, portfolio value, or total assets — those are not transactions. For bank/investment statements where no spending occurred, set total to 0.
- "holdings": for consolidated bank/investment statements, list every account or product with its current balance (checking, savings, deposits, insurance plans, mutual funds, credit cards). Leave as [] for receipts and invoices.
- "doc_type": use "bank" for bank/savings/current account statements (including virtual banks: ZA Bank, Mox, WeLab, Livi, Fusion, Ant Bank, Airstar); "credit_card" for credit card statements from any issuer; "investment" for brokerage/fund/stock portfolio statements AND MPF (Mandatory Provident Fund) statements from any trustee (AIA MPF, HSBC MPF, Manulife MPF, BCT, Principal, Sun Life, etc.); "mortgage" for mortgage/home loan statements; "receipt" for payment receipts/confirmations; "invoice" for bills issued to the customer; "insurance" for insurance policies, premium notices, policy documents, benefit statements from life/health/general insurers (AIA, Prudential, Manulife, HSBC Life, FWD, Sun Life, AXA, BOC Life, Hang Seng Insurance, China Life, China Taiping, Chubb, YF Life, Bowtie, Blue Cross, BUPA, CIGNA, OneDegree, and others).
- "issuer": use the full English institutional name as printed on the document (e.g. "HSBC", "Hang Seng Bank", "AIA International Limited", "Futu Securities", "AIA Company (Trustee) Limited"). For MPF, use the trustee name. For credit cards, use the bank/company name not the card network (Visa/Mastercard).

Category rules — pick the most specific match:
- "groceries": supermarkets, food stores (City Super, Great, Sogo food hall, Wellcome, etc.)
- "dining": restaurants, cafes, food delivery, takeaway
- "transport": MTR, taxi, Uber, petrol, parking, flights, ferry
- "travel": hotels, travel packages, holiday spending — use alongside transport for trips
- "shopping": retail, clothing, department stores, online shopping
- "electronics": Apple, tech, gadgets, electronics stores
- "health": pharmacy, doctors, dentist, medical, gym, sports
- "beauty": salon, spa, skincare, haircut
- "entertainment": cinema, events, subscriptions (Netflix, Spotify, etc.)
- "software": SaaS, apps, cloud services (Wix, Dropbox, Loom, CapCut, etc.)
- "education": courses, books, training
- "utilities": electricity, gas, water, internet, phone bills
- "insurance": insurance premiums
- "rent": rental income received or rent paid
- "tax": tax payments, government fees
- "flowers": florists, flower shops, gift shops
- "home": locksmiths, repairs, home maintenance, hardware
- "banking": bank fees, annual fees, credit card charges
- "rewards": cashback, rebates, bank bonus credits, points redemptions
- "transfer": credit card autopay payments, balance transfers — money moving between your own accounts
- "misc": anything that truly doesn't fit above (use sparingly)

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
    reference_number: str = ""
    coverage_period: str = ""
    holdings: list[dict] = field(default_factory=list)
    transactions: list[dict] = field(default_factory=list)
    summary: str = ""
    raw: dict = field(default_factory=dict)


def extract_document(config: Config, file_path: Path) -> ExtractionResult:
    if config.extraction_mode == "api":
        return _extract_via_api(config, file_path)
    return _extract_via_oauth(config, file_path)


def _run_claude(prompt: str) -> str:
    result = subprocess.run(
        [_claude_bin(), "--print", "--dangerously-skip-permissions", prompt],
        capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI failed (exit {result.returncode}): {result.stderr.strip()}"
        )
    return result.stdout


def _extract_via_oauth(config: Config, file_path: Path) -> ExtractionResult:
    suffix = file_path.suffix.lower()

    if suffix != ".pdf":
        return _parse_response(_run_claude(
            f"Read {file_path}\n\n{_build_prompt(config.entities)}"
        ))

    page_count = _pdf_page_count(file_path)

    # Long PDFs: extract in page chunks and merge
    if page_count > _PAGE_THRESHOLD:
        chunks: list[ExtractionResult] = []
        for start in range(0, page_count, _CHUNK_PAGES):
            end = start + _CHUNK_PAGES
            text = _extract_pdf_text(file_path, start, end)
            if not text.strip():
                continue
            if start == 0:
                prompt = (
                    f"Document text (pages 1–{min(end, page_count)} of {page_count} total):\n\n"
                    f"{text}\n\n{_build_prompt(config.entities)}"
                )
            else:
                prompt = (
                    f"Document text (pages {start+1}–{min(end, page_count)} of {page_count} total — continuation):\n\n"
                    f"{text}\n\n"
                    f"This is a continuation of a multi-page document. Extract ONLY transactions and holdings from these pages. "
                    f"For all other fields (entity, issuer, doc_date, currency, total, reference_number, coverage_period, summary) return null or empty — they were captured from earlier pages.\n\n"
                    + _build_prompt(config.entities)
                )
            try:
                chunks.append(_parse_response(_run_claude(prompt)))
            except Exception:
                continue  # skip a bad chunk, carry on
        if chunks:
            return _merge_results(chunks)

    # Short PDFs or fallback: single pass
    pdf_text = _extract_pdf_text(file_path)
    if pdf_text:
        return _parse_response(_run_claude(
            f"Document text (extracted from PDF):\n\n{pdf_text}\n\n{_build_prompt(config.entities)}"
        ))
    # Last resort: ask Claude CLI to read the file directly
    return _parse_response(_run_claude(
        f"Read {file_path}\n\n{_build_prompt(config.entities)}"
    ))


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
    except json.JSONDecodeError:
        # Fallback: try lenient parsing (allows unescaped control chars in strings)
        try:
            data = json.loads(text, strict=False)
        except json.JSONDecodeError:
            # Last resort: use json-repair to fix unescaped quotes, truncation, etc.
            try:
                try:
                    from json_repair import repair_json
                    data = json.loads(repair_json(text))
                except ImportError:
                    raise json.JSONDecodeError("json_repair not available", text, 0)
            except Exception as e:
                raise ValueError(f"Model returned non-JSON response: {e}\n\nRaw text: {text[:200]}")
    return ExtractionResult(
        entity=data.get("entity") or "",
        entity_confidence=data.get("entity_confidence", "low"),
        doc_type=data.get("doc_type", "unknown"),
        issuer=data.get("issuer") or "",
        doc_date=data.get("doc_date") or "",
        currency=data.get("currency") or "HKD",
        total=float(data.get("total") or 0),
        reference_number=data.get("reference_number") or "",
        coverage_period=data.get("coverage_period") or "",
        holdings=data.get("holdings") or [],
        transactions=data.get("transactions") or [],
        summary=data.get("summary") or "",
        raw=data,
    )
