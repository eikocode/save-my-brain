#!/usr/bin/env python3
"""Interactive setup wizard. Run once to configure SavemyBrain."""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from src.config import Config, CONFIG_PATH


def _prompt(label: str, default: str = "") -> str:
    val = input(f"{label} [{default}]: ").strip() if default else input(f"{label}: ").strip()
    return val or default


def main() -> None:
    print("\n=== SavemyBrain Setup ===\n")
    config = Config()

    config.inbox_folder = _prompt("Inbox folder (drop files here)", config.inbox_folder)
    config.output_folder = _prompt("Output folder (CSV + exports)", config.output_folder)

    api_key = _prompt("Anthropic API key (leave blank for OAuth/CLI mode)", "")
    if api_key:
        config.anthropic_api_key = api_key
        config.extraction_mode = "api"
        print("  → Extraction mode: API")
    else:
        config.extraction_mode = "oauth"
        print("  → Extraction mode: OAuth (uses Claude CLI — must be logged in)")

    config.telegram_bot_token = _prompt("Telegram bot token (from @BotFather)", "")
    config.telegram_chat_id = _prompt("Your Telegram chat ID (from @userinfobot)", "")
    config.google_sheet_id = _prompt("Google Sheet ID (optional — leave blank to skip)", "")
    config.web_port = int(_prompt("Web dashboard port", str(config.web_port)))

    entities_input = _prompt(
        "Entity keys (comma-separated)",
        ",".join(config.entities)
    )
    config.entities = [e.strip() for e in entities_input.split(",") if e.strip()]

    config.save()
    print(f"\n✅ Config saved to {CONFIG_PATH}")

    # Create inbox folder
    inbox = Path(config.inbox_folder).expanduser()
    inbox.mkdir(parents=True, exist_ok=True)
    print(f"✅ Inbox folder ready: {inbox}")

    # Init database
    from src import storage
    storage.init_db(config)
    print("✅ Database initialised: apps/SavemyBrain/data/savemybrain.db")

    # launchd
    if sys.platform == "darwin":
        try:
            setup = input("\nSet up auto-start on login (macOS launchd)? [y/N]: ").strip().lower()
        except EOFError:
            setup = ""
        if setup == "y":
            _setup_launchd(config)

    print(f"\n✅ Setup complete!\n   Run: python start.py\n   Web: http://localhost:{config.web_port}\n")


def _setup_launchd(config: Config) -> None:
    label = "com.aios.savemybrain"
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
    app_dir = Path(__file__).parent.resolve()
    log_dir = Path.home() / "Library" / "Logs"
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{sys.executable}</string>
    <string>{app_dir / 'start.py'}</string>
  </array>
  <key>WorkingDirectory</key><string>{app_dir}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{log_dir / 'savemybrain.log'}</string>
  <key>StandardErrorPath</key><string>{log_dir / 'savemybrain-error.log'}</string>
</dict>
</plist>"""
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    plist_path.write_text(plist)
    subprocess.run(["launchctl", "load", str(plist_path)], check=False)
    print(f"✅ launchd service installed: {label}")
    print(f"   Log: {log_dir / 'savemybrain.log'}")


if __name__ == "__main__":
    main()
