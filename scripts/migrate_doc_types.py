"""One-time migration: reclassify doc_type='statement' docs into
bank | credit_card | investment | mortgage using summary + issuer + entity heuristics."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import Config
from src import storage

_KNOWN_BROKERS = {
    # Online platforms (HK)
    "futu", "moomoo", "tiger broker", "interactive broker", "ibkr",
    "longbridge", "webull", "usmart", "saxo", "stashaway",
    # Bank-linked (HK)
    "boci securities", "hsbc investdirect", "hsbc securities",
    "hang seng securities", "dbs vickers", "dah sing securities",
    "chong hing securities", "bea securities", "cmb international securities",
    # Traditional (HK)
    "phillip securities", "clsa", "guotai junan", "haitong international",
    "bright smart", "gf securities", "huatai international",
    # Overseas (common in HK)
    "apex", "firstrade", "schwab", "fidelity",
    "td ameritrade", "etrade", "e*trade", "robinhood", "vanguard",
    "merrill", "raymond james",
}
_KNOWN_BANKS = {
    # Locally incorporated
    "hsbc", "hang seng bank", "bank of china (hong kong)", "bochk",
    "standard chartered", "bank of east asia", "bea", "dbs bank",
    "china citic bank", "citic bank", "cmb wing lung", "wing lung",
    "ocbc", "icbc", "industrial and commercial bank of china",
    "china construction bank", "ccb", "bank of communications",
    "nanyang commercial", "ncb", "dah sing bank", "chong hing bank",
    "fubon bank", "public bank", "shanghai commercial bank",
    "chiyu banking", "citibank",
    # Virtual banks
    "za bank", "mox bank", "mox", "welab bank", "livi bank",
    "fusion bank", "ant bank", "airstar bank", "pao bank",
    # Foreign banks operating retail in HK
    "uob", "bnp", "barclays", "jpmorgan", "deutsche bank",
}
_CREDIT_CARD_KEYWORDS = {
    "credit card", "visa", "mastercard", "amex", "american express",
    "rewards card", "card statement", "card ending", "card number",
    "charge card",
}
_BANK_KEYWORDS = {
    "consolidated", "citigold", "current account", "savings account",
    "checking account", "bank account", "deposit account",
}
_BROKERAGE_SUMMARY_KEYWORDS = {
    "brokerage account", "trading account",
}
_MORTGAGE_KEYWORDS = {
    "mortgage", "home loan", "property loan",
}


def _classify(doc: dict) -> str | None:
    """Return new doc_type, or None to leave unchanged."""
    if doc.get("doc_type") != "statement":
        return None

    summary = (doc.get("summary") or "").lower()
    issuer = (doc.get("issuer") or "").lower()
    entity = (doc.get("entity") or "").lower()
    combined = f"{summary} {issuer} {entity}"

    if any(kw in combined for kw in _MORTGAGE_KEYWORDS):
        return "mortgage"

    # Bank consolidated/Citigold statements — must check BEFORE investment
    # (they list fund holdings but are bank accounts)
    if any(kw in combined for kw in _BANK_KEYWORDS):
        return "bank"

    # Investment: issuer/entity is a known broker, OR summary explicitly says "brokerage account"
    is_known_broker = any(kw in issuer or kw in entity for kw in _KNOWN_BROKERS)
    is_brokerage_summary = any(kw in summary for kw in _BROKERAGE_SUMMARY_KEYWORDS)
    if is_known_broker or is_brokerage_summary:
        return "investment"

    if any(kw in combined for kw in _CREDIT_CARD_KEYWORDS):
        return "credit_card"

    # Default: known banks without credit card markers → bank
    if any(kw in combined for kw in _KNOWN_BANKS):
        return "bank"

    return None


def run(dry_run: bool = False) -> None:
    config = Config.load()
    docs = storage.get_documents(config)
    statements = [d for d in docs if d.get("doc_type") == "statement"]
    print(f"Found {len(statements)} statement docs to classify\n")

    changes: list[tuple[int, str, str]] = []
    unresolved: list[dict] = []

    for doc in statements:
        new_type = _classify(doc)
        if new_type:
            changes.append((doc["id"], doc.get("original_path", "?"), new_type))
        else:
            unresolved.append(doc)

    print("Proposed changes:")
    for doc_id, path, new_type in changes:
        print(f"  doc {doc_id:>3}  {new_type:<15}  {path}")

    if unresolved:
        print(f"\nCould not classify ({len(unresolved)} docs) — will set to 'bank' as fallback:")
        for doc in unresolved:
            print(f"  doc {doc['id']:>3}  {doc.get('original_path','?')}")
            changes.append((doc["id"], doc.get("original_path", "?"), "bank"))

    if dry_run:
        print("\n[DRY RUN] No changes written.")
        return

    confirm = input(f"\nApply {len(changes)} changes? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    with storage.get_db(config) as conn:
        for doc_id, _, new_type in changes:
            conn.execute("UPDATE documents SET doc_type=? WHERE id=?", (new_type, doc_id))

    print(f"\nDone — updated {len(changes)} documents.")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    run(dry_run=dry_run)
