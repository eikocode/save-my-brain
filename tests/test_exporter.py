import csv
from unittest.mock import MagicMock, patch
from src import exporter, storage


def _seed_db(config):
    storage.init_db(config)
    doc_id = storage.save_document(
        config, entity="goodhold", doc_type="receipt", issuer="CLP",
        doc_date="2026-04-10", currency="HKD", total=800.0,
        file_hash_val="aabbcc", original_path="/tmp/clp.jpg", summary="Electric"
    )
    storage.save_transactions(config, doc_id, "goodhold", [
        {"date": "2026-04-10", "merchant": "CLP Power", "amount": 800.0,
         "currency": "HKD", "category": "utilities", "direction": "expense"},
    ])
    return doc_id


def test_export_csv_creates_file(tmp_config, tmp_path):
    tmp_config.output_folder = str(tmp_path / "output")
    _seed_db(tmp_config)
    path = exporter.export_csv(tmp_config)
    assert path.exists()


def test_export_csv_has_correct_headers(tmp_config, tmp_path):
    tmp_config.output_folder = str(tmp_path / "output")
    _seed_db(tmp_config)
    path = exporter.export_csv(tmp_config)
    with path.open() as f:
        reader = csv.DictReader(f)
        assert "entity" in reader.fieldnames
        assert "amount" in reader.fieldnames
        assert "direction" in reader.fieldnames
        assert "issuer" in reader.fieldnames


def test_export_csv_row_content(tmp_config, tmp_path):
    tmp_config.output_folder = str(tmp_path / "output")
    _seed_db(tmp_config)
    path = exporter.export_csv(tmp_config)
    with path.open() as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 1
    assert rows[0]["entity"] == "goodhold"
    assert rows[0]["merchant"] == "CLP Power"
    assert rows[0]["issuer"] == "CLP"


def test_sync_to_sheets_skips_when_no_config(tmp_config):
    storage.init_db(tmp_config)
    tmp_config.google_sheet_id = ""
    count = exporter.sync_to_sheets(tmp_config)
    assert count == 0


def test_sync_to_sheets_writes_rows(tmp_config, tmp_path, monkeypatch):
    import sys

    tmp_config.output_folder = str(tmp_path / "output")
    tmp_config.google_sheet_id = "sheet123"
    _seed_db(tmp_config)

    mock_sheet = MagicMock()
    mock_gc = MagicMock()
    mock_gc.open_by_key.return_value.sheet1 = mock_sheet

    mock_gspread = MagicMock()
    mock_gspread.authorize.return_value = mock_gc

    mock_credentials_cls = MagicMock()
    mock_credentials_cls.from_service_account_file.return_value = MagicMock()
    mock_google_oauth2 = MagicMock()
    mock_google_oauth2.service_account.Credentials = mock_credentials_cls

    monkeypatch.setitem(sys.modules, "gspread", mock_gspread)
    monkeypatch.setitem(sys.modules, "google", MagicMock())
    monkeypatch.setitem(sys.modules, "google.oauth2", mock_google_oauth2)
    monkeypatch.setitem(sys.modules, "google.oauth2.service_account", mock_google_oauth2.service_account)

    with patch("pathlib.Path.exists", return_value=True):
        count = exporter.sync_to_sheets(tmp_config)

    assert count == 1
    mock_sheet.clear.assert_called_once()
    mock_sheet.update.assert_called_once()
