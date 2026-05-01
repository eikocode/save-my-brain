from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".savemybrain" / "config.json"


@dataclass
class Config:
    inbox_folder: str = str(Path.home() / "Desktop" / "SavemyBrain Inbox")
    output_folder: str = str(Path.home() / "Dropbox" / "SavemyBrain")
    entities: list[str] = field(default_factory=lambda: ["company_a", "company_b"])
    anthropic_api_key: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    google_sheet_id: str = ""
    web_port: int = 8095
    extraction_mode: str = "oauth"  # "oauth" | "api"
    monthly_upload_limit: int = 10   # 0 = unlimited
    _db_path: str = ""  # override for testing

    @classmethod
    def load(cls) -> "Config":
        # Load dotenv if present (project-local .env takes priority)
        env_file = Path(__file__).parent.parent / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())

        data: dict = {}
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text())

        # Environment variable overrides (SCREAMING_SNAKE → snake_case field names)
        _env_map = {
            "ANTHROPIC_API_KEY": "anthropic_api_key",
            "EXTRACTION_MODE": "extraction_mode",
            "TELEGRAM_BOT_TOKEN": "telegram_bot_token",
            "TELEGRAM_CHAT_ID": "telegram_chat_id",
            "WEB_PORT": "web_port",
            "MONTHLY_UPLOAD_LIMIT": "monthly_upload_limit",
        }
        for env_key, field_name in _env_map.items():
            val = os.environ.get(env_key)
            if val:
                data[field_name] = val

        valid = {k: v for k, v in data.items()
                 if k in cls.__dataclass_fields__ and not k.startswith("_")}
        return cls(**valid)

    def save(self) -> None:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = {k: v for k, v in asdict(self).items() if not k.startswith("_")}
        CONFIG_PATH.write_text(json.dumps(data, indent=2))
