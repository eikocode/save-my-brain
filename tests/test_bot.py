import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.bot import _result_text, _action_keyboard, _entity_keyboard
from src.extractor import ExtractionResult


def _mock_result(entity="goodhold", confidence="high", total=1200.0, doc_type="receipt"):
    return ExtractionResult(
        entity=entity, entity_confidence=confidence, doc_type=doc_type,
        issuer="Towngas", doc_date="2026-04-01", currency="HKD", total=total,
        transactions=[{"date": "2026-04-01", "merchant": "Towngas", "amount": 1200.0,
                       "currency": "HKD", "category": "utilities", "direction": "expense"}],
    )


def test_result_text_high_confidence():
    r = _mock_result("goodhold", "high")
    text = _result_text(r, "goodhold")
    assert "auto-detected" in text
    assert "Goodhold" in text
    assert "1,200.00" in text


def test_result_text_low_confidence():
    r = _mock_result("goodhold", "low")
    text = _result_text(r, "goodhold")
    assert "guessed" in text


def test_action_keyboard_has_three_buttons():
    kb = _action_keyboard("session123")
    assert len(kb.inline_keyboard[0]) == 3
    labels = [btn.text for btn in kb.inline_keyboard[0]]
    assert any("Save" in l for l in labels)
    assert any("Change" in l for l in labels)
    assert any("Discard" in l for l in labels)


def test_entity_keyboard_has_five_buttons():
    kb = _entity_keyboard("session123")
    all_buttons = [btn for row in kb.inline_keyboard for btn in row]
    assert len(all_buttons) == 5
    data_values = [btn.callback_data for btn in all_buttons]
    assert any("goodhold" in d for d in data_values)
    assert any("adelainec" in d for d in data_values)
