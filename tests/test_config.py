import json
from pathlib import Path
from src.config import Config


def test_config_defaults():
    c = Config()
    assert c.web_port == 8095
    assert "goodhold" in c.entities
    assert c.extraction_mode == "oauth"


def test_config_save_and_load(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    monkeypatch.setattr("src.config.CONFIG_PATH", config_path)

    c = Config(web_port=9000, extraction_mode="api")
    c.save()

    assert config_path.exists()
    data = json.loads(config_path.read_text())
    assert data["web_port"] == 9000
    assert "_db_path" not in data

    loaded = Config.load()
    assert loaded.web_port == 9000
    assert loaded.extraction_mode == "api"


def test_config_load_missing_returns_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr("src.config.CONFIG_PATH", tmp_path / "nonexistent.json")
    c = Config.load()
    assert c.web_port == 8095
