from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from watchdog.events import FileCreatedEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .config import Config

log = logging.getLogger(__name__)
_SUPPORTED = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


class _Handler(FileSystemEventHandler):
    def __init__(self, callback: Callable[[Path], None]):
        self._callback = callback

    def on_created(self, event: FileCreatedEvent) -> None:
        if not event.is_directory:
            path = Path(str(event.src_path))
            if path.suffix.lower() in _SUPPORTED:
                log.info("Inbox: new file %s", path.name)
                self._callback(path)


class InboxWatcher:
    def __init__(self, config: Config, callback: Callable[[Path], None]):
        self._config = config
        self._callback = callback

    def start(self) -> None:
        folder = Path(self._config.inbox_folder).expanduser()
        folder.mkdir(parents=True, exist_ok=True)
        self._observer = Observer()
        self._observer.schedule(_Handler(self._callback), str(folder), recursive=False)
        self._observer.start()
        log.info("Watching %s", folder)

    def stop(self) -> None:
        self._observer.stop()
        self._observer.join()
