import json
import pytest
from unittest.mock import MagicMock, patch
from src.extractor import ExtractionResult, _parse_response, extract_document


def test_parse_response_valid_json():
    payload = json.dumps({
        "entity": "acme",
        "entity_confidence": "high",
        "doc_type": "receipt",
        "issuer": "Towngas",
        "doc_date": "2026-04-01",
        "currency": "HKD",
        "total": 1200.0,
        "transactions": [
            {"date": "2026-04-01", "merchant": "Towngas", "amount": 1200.0,
             "currency": "HKD", "category": "utilities", "direction": "expense"}
        ],
        "summary": "Gas bill for April 2026",
    })
    result = _parse_response(payload)
    assert isinstance(result, ExtractionResult)
    assert result.entity == "acme"
    assert result.entity_confidence == "high"
    assert result.total == 1200.0
    assert len(result.transactions) == 1


def test_parse_response_strips_markdown_fences():
    payload = "```json\n{\"entity\": \"globex\", \"entity_confidence\": \"low\", \"doc_type\": \"unknown\", \"issuer\": \"\", \"doc_date\": null, \"currency\": \"HKD\", \"total\": 0, \"transactions\": [], \"summary\": \"\"}\n```"
    result = _parse_response(payload)
    assert result.entity == "globex"


def test_extract_via_api_mode(tmp_config, sample_pdf):
    tmp_config.extraction_mode = "api"
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=json.dumps({
        "entity": "acme", "entity_confidence": "high",
        "doc_type": "statement", "issuer": "Bank", "doc_date": "2026-04-01",
        "currency": "HKD", "total": 50000.0, "transactions": [], "summary": "Bank statement",
    }))]
    with patch("src.extractor.anthropic.Anthropic") as MockClient:
        MockClient.return_value.messages.create.return_value = mock_response
        result = extract_document(tmp_config, sample_pdf)
    assert result.entity == "acme"
    assert result.total == 50000.0


def test_extract_null_entity_defaults_empty(tmp_config, sample_pdf):
    tmp_config.extraction_mode = "api"
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=json.dumps({
        "entity": None, "entity_confidence": "low",
        "doc_type": "unknown", "issuer": "", "doc_date": None,
        "currency": "HKD", "total": 0, "transactions": [], "summary": "",
    }))]
    with patch("src.extractor.anthropic.Anthropic") as MockClient:
        MockClient.return_value.messages.create.return_value = mock_response
        result = extract_document(tmp_config, sample_pdf)
    assert result.entity == ""
    assert result.entity_confidence == "low"


def test_extract_via_oauth_mode(tmp_config, sample_pdf):
    tmp_config.extraction_mode = "oauth"
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = json.dumps({
        "entity": "globex", "entity_confidence": "high",
        "doc_type": "invoice", "issuer": "Towngas", "doc_date": "2026-04-15",
        "currency": "HKD", "total": 650.0, "transactions": [], "summary": "Gas invoice",
    })
    with patch("src.extractor.subprocess.run", return_value=mock_result) as mock_run:
        result = extract_document(tmp_config, sample_pdf)
    assert result.entity == "globex"
    assert result.total == 650.0
    mock_run.assert_called_once()


def test_oauth_cli_failure_raises(tmp_config, sample_pdf):
    tmp_config.extraction_mode = "oauth"
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "claude: command not found"
    with patch("src.extractor.subprocess.run", return_value=mock_result):
        with pytest.raises(RuntimeError, match="claude CLI failed"):
            extract_document(tmp_config, sample_pdf)


def test_parse_response_invalid_json_raises():
    with pytest.raises(ValueError, match="non-JSON"):
        _parse_response("Sorry, I cannot process that document.")
