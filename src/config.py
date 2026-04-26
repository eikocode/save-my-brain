from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".savemybrain" / "config.json"


@dataclass
class Config:
    inbox_folder: str = str(Path.home() / "Desktop" / "SavemyBrain Inbox")
    output_folder: str = str(Path.home() / "Dropbox" / "SavemyBrain")
    entities: list[str] = field(default_factory=lambda: [
        "goodhold", "thousand_ford", "santo_star", "anrobo", "adelainec"
    ])
    anthropic_api_key: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    google_sheet_id: str = ""
    web_port: int = 8095
    extraction_mode: str = "oauth"  # "oauth" | "api"
    _db_path: str = ""  # override for testing

    @classmethod
    def load(cls) -> "Config":
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text())
            valid = {k: v for k, v in data.items()
                     if k in cls.__dataclass_fields__ and not k.startswith("_")}
            return cls(**valid)
        return cls()

    def save(self) -> None:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = {k: v for k, v in asdict(self).items() if not k.startswith("_")}
        CONFIG_PATH.write_text(json.dumps(data, indent=2))
