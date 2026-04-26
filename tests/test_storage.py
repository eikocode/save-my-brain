from pathlib import Path
from src import storage


def test_init_db_creates_tables(tmp_config):
    storage.init_db(tmp_config)
    with storage.get_db(tmp_config) as conn:
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
    assert "documents" in tables
    assert "transactions" in tables


def test_is_duplicate_false_for_new_hash(tmp_config):
    storage.init_db(tmp_config)
    assert storage.is_duplicate(tmp_config, "abc123") is False


def test_save_and_retrieve_document(tmp_config):
    storage.init_db(tmp_config)
    doc_id = storage.save_document(
        tmp_config, entity="acme", doc_type="receipt",
        issuer="Towngas", doc_date="2026-04-01", currency="HKD",
        total=1200.0, file_hash_val="deadbeef",
        original_path="/tmp/bill.pdf", summary="Gas bill April"
    )
    assert isinstance(doc_id, int)
    assert storage.is_duplicate(tmp_config, "deadbeef") is True

    docs = storage.get_documents(tmp_config)
    assert len(docs) == 1
    assert docs[0]["entity"] == "acme"
    assert docs[0]["total"] == 1200.0


def test_save_and_query_transactions(tmp_config):
    storage.init_db(tmp_config)
    doc_id = storage.save_document(
        tmp_config, entity="acme", doc_type="receipt",
        issuer="CLP", doc_date="2026-04-10", currency="HKD",
        total=800.0, file_hash_val="aabbcc",
        original_path="/tmp/clp.jpg", summary="Electric bill"
    )
    storage.save_transactions(tmp_config, doc_id, "acme", [
        {"date": "2026-04-10", "merchant": "CLP Power", "amount": 800.0,
         "currency": "HKD", "category": "utilities", "direction": "expense"},
    ])
    txns = storage.get_transactions(tmp_config)
    assert len(txns) == 1
    assert txns[0]["merchant"] == "CLP Power"

    filtered = storage.get_transactions(tmp_config, entity="acme", month="2026-04")
    assert len(filtered) == 1

    no_match = storage.get_transactions(tmp_config, entity="globex")
    assert len(no_match) == 0


def test_file_hash_is_md5(tmp_path):
    f = tmp_path / "test.txt"
    f.write_bytes(b"hello")
    h = storage.file_hash(f)
    assert len(h) == 32
    assert storage.file_hash(f) == h  # deterministic
