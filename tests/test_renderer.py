from src.renderer import render_transactions, render_summary


def test_render_transactions_returns_png_bytes():
    txns = [
        {"date": "2026-04-01", "merchant": "Towngas", "amount": 1200.0,
         "currency": "HKD", "category": "utilities", "direction": "expense"},
        {"date": "2026-04-05", "merchant": "HSBC Rental", "amount": 30000.0,
         "currency": "HKD", "category": "income", "direction": "income"},
    ]
    result = render_transactions(txns)
    assert isinstance(result, bytes)
    assert result[:4] == b"\x89PNG"


def test_render_transactions_empty():
    result = render_transactions([])
    assert isinstance(result, bytes)
    assert result[:4] == b"\x89PNG"


def test_render_summary_returns_png_bytes():
    txns = [
        {"amount": 30000.0, "direction": "income"},
        {"amount": 1200.0, "direction": "expense"},
    ]
    result = render_summary("goodhold", "2026-04", txns)
    assert isinstance(result, bytes)
    assert result[:4] == b"\x89PNG"
