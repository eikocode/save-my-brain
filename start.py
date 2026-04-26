#!/usr/bin/env python3
"""Entry point — starts watcher, web server, and Telegram bot."""
import asyncio
import logging
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
log = logging.getLogger("savemybrain")


def _process_file(config, path: Path) -> None:
    from src import storage
    from src.extractor import extract_document
    from src.classifier import classify

    h = storage.file_hash(path)
    if storage.is_duplicate(config, h):
        log.info("Duplicate skipped: %s", path.name)
        return

    log.info("Processing: %s", path.name)
    result = extract_document(config, path)
    classify(result, config.entities)

    if not result.entity:
        log.warning("Entity unknown for %s — use Telegram bot to file manually", path.name)
        return

    doc_id = storage.save_document(
        config, result.entity, result.doc_type, result.issuer,
        result.doc_date, result.currency, result.total,
        h, str(path), result.summary,
    )
    storage.save_transactions(config, doc_id, result.entity, result.transactions)
    log.info("Saved: %s → %s (%d txns)", path.name, result.entity, len(result.transactions))


async def main() -> None:
    from src.config import Config
    from src import storage
    from src.watcher import InboxWatcher
    from src.bot import run_bot
    from src.web import run_web

    config = Config.load()
    storage.init_db(config)

    # File watcher
    watcher = InboxWatcher(config, lambda p: _process_file(config, p))
    watcher.start()

    # Web server in background thread (uvicorn is sync-safe this way)
    web_thread = threading.Thread(
        target=run_web, args=(config,), daemon=True, name="savemybrain-web"
    )
    web_thread.start()

    log.info(
        "SavemyBrain running — inbox: %s | web: http://localhost:%d | bot: %s",
        config.inbox_folder, config.web_port,
        "enabled" if config.telegram_bot_token else "disabled (no token)",
    )

    if config.telegram_bot_token:
        await run_bot(config)
    else:
        log.info("Telegram bot disabled — set telegram_bot_token in config to enable")
        # Keep watcher alive
        while True:
            await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
