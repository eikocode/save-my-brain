from pathlib import Path
import pytest
from src.config import Config


@pytest.fixture
def tmp_config(tmp_path):
    return Config(
        inbox_folder=str(tmp_path / "inbox"),
        output_folder=str(tmp_path / "output"),
        entities=["acme", "globex"],
        anthropic_api_key="test-key",
        telegram_bot_token="",
        telegram_chat_id="",
        google_sheet_id="",
        web_port=8095,
        extraction_mode="api",
        _db_path=str(tmp_path / "test.db"),
    )


@pytest.fixture
def sample_pdf(tmp_path):
    """Minimal valid PDF bytes for testing."""
    path = tmp_path / "sample.pdf"
    path.write_bytes(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")
    return path
