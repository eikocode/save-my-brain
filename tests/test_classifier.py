from src.extractor import ExtractionResult
from src.classifier import classify

ENTITIES = ["goodhold", "thousand_ford", "santo_star", "anrobo", "adelainec"]


def _result(entity="goodhold", confidence="high", transactions=None):
    return ExtractionResult(
        entity=entity, entity_confidence=confidence, doc_type="receipt",
        issuer="Test", doc_date="2026-04-01", currency="HKD", total=100.0,
        transactions=transactions or [],
    )


def test_known_entity_unchanged():
    r = classify(_result("goodhold", "high"), ENTITIES)
    assert r.entity == "goodhold"
    assert r.entity_confidence == "high"


def test_unknown_entity_cleared():
    r = classify(_result("nonexistent_co", "high"), ENTITIES)
    assert r.entity == ""
    assert r.entity_confidence == "low"


def test_invalid_category_becomes_misc():
    txns = [{"category": "food", "direction": "expense", "amount": 50}]
    r = classify(_result(transactions=txns), ENTITIES)
    assert r.transactions[0]["category"] == "misc"


def test_invalid_direction_becomes_expense():
    txns = [{"category": "rent", "direction": "unknown", "amount": 100}]
    r = classify(_result(transactions=txns), ENTITIES)
    assert r.transactions[0]["direction"] == "expense"


def test_valid_categories_unchanged():
    for cat in ("rent", "utilities", "insurance", "management", "income", "misc"):
        txns = [{"category": cat, "direction": "expense", "amount": 10}]
        r = classify(_result(transactions=txns), ENTITIES)
        assert r.transactions[0]["category"] == cat
