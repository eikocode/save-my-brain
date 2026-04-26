import pytest
from fastapi.testclient import TestClient
from src.web import create_app
from src import storage


@pytest.fixture
def client(tmp_config):
    storage.init_db(tmp_config)
    app = create_app(tmp_config)
    return TestClient(app)


def test_dashboard_loads(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "SavemyBrain" in r.text


def test_transactions_page_empty(client):
    r = client.get("/transactions")
    assert r.status_code == 200


def test_transactions_filter_by_entity(client, tmp_config):
    storage.init_db(tmp_config)
    doc_id = storage.save_document(
        tmp_config, entity="acme", doc_type="receipt", issuer="CLP",
        doc_date="2026-04-10", currency="HKD", total=800.0,
        file_hash_val="abc", original_path="/tmp/a.pdf", summary=""
    )
    storage.save_transactions(tmp_config, doc_id, "acme", [
        {"date": "2026-04-10", "merchant": "CLP Power", "amount": 800.0,
         "currency": "HKD", "category": "utilities", "direction": "expense"}
    ])
    r = client.get("/transactions?entity=acme")
    assert r.status_code == 200
    assert "CLP Power" in r.text


def test_upload_page_loads(client):
    r = client.get("/upload")
    assert r.status_code == 200


def test_export_page_loads(client):
    r = client.get("/export")
    assert r.status_code == 200
