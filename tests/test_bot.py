import pytest
from unittest.mock import MagicMock
from src.bot import _entity_from_result, _saved_text
from src.extractor import ExtractionResult


def _mock_result(entity="acme", confidence="high", issuer="Acme Bank", total=1200.0, doc_type="receipt"):
    return ExtractionResult(
        entity=entity, entity_confidence=confidence, doc_type=doc_type,
        issuer=issuer, doc_date="2026-04-01", currency="HKD", total=total,
        transactions=[{"date": "2026-04-01", "merchant": "Towngas", "amount": 1200.0,
                       "currency": "HKD", "category": "utilities", "direction": "expense"}],
    )


def test_entity_from_result_uses_high_confidence():
    r = _mock_result(entity="acme", confidence="high")
    assert _entity_from_result(r) == "acme"


def test_entity_from_result_falls_back_to_issuer():
    r = _mock_result(entity="", confidence="low", issuer="HSBC Visa Signature Card")
    assert _entity_from_result(r) == "hsbc_visa_signature_card"


def test_entity_from_result_unknown_when_no_issuer():
    r = _mock_result(entity="", confidence="low", issuer="")
    assert _entity_from_result(r) == "unknown"


def test_saved_text_contains_key_info():
    r = _mock_result(issuer="Acme Bank", total=1200.0)
    text = _saved_text(r, "acme", 1)
    assert "Saved automatically" in text
    assert "1,200.00" in text
    assert "Acme Bank" in text


def test_saved_text_mentions_delete():
    r = _mock_result()
    text = _saved_text(r, "acme", 5)
    assert "delete" in text.lower()
