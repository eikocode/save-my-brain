import time
from pathlib import Path
from src.watcher import InboxWatcher


def test_watcher_calls_callback_on_pdf(tmp_config, tmp_path):
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    tmp_config.inbox_folder = str(inbox)

    received = []
    watcher = InboxWatcher(tmp_config, received.append)
    watcher.start()
    try:
        (inbox / "bill.pdf").write_bytes(b"%PDF-1.4")
        time.sleep(0.5)
    finally:
        watcher.stop()

    assert len(received) == 1
    assert received[0].name == "bill.pdf"


def test_watcher_ignores_non_documents(tmp_config, tmp_path):
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    tmp_config.inbox_folder = str(inbox)

    received = []
    watcher = InboxWatcher(tmp_config, received.append)
    watcher.start()
    try:
        (inbox / "notes.txt").write_text("ignore me")
        time.sleep(0.3)
    finally:
        watcher.stop()

    assert len(received) == 0


def test_watcher_creates_inbox_folder(tmp_config, tmp_path):
    inbox = tmp_path / "new_inbox"
    tmp_config.inbox_folder = str(inbox)
    assert not inbox.exists()

    watcher = InboxWatcher(tmp_config, lambda p: None)
    watcher.start()
    watcher.stop()

    assert inbox.exists()
