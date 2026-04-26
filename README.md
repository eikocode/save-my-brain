# SavemyBrain

Multi-entity bookkeeping app. Reads bank statements, receipts, invoices, and insurance documents via Telegram, web upload, or file drop — Claude extracts the data, stores it by business entity, and syncs to Google Sheets.

## Setup

```bash
cd apps/SavemyBrain
pip install -r requirements.txt
python configure.py
```

## Run

```bash
python start.py
```

- Web dashboard: http://localhost:8095
- Telegram: send a PDF or photo to your bot
- Inbox: drop files into the inbox folder (configured above)

## CLI Commands (in Claude Code)

- `/scan` — process inbox folder
- `/status` — last 10 documents + entity summary
- `/find [query]` — search transactions
- `/summary [entity] [YYYY-MM]` — P&L for entity + month
- `/export` — regenerate CSV + sync Sheets

## Entities

`goodhold` · `thousand_ford` · `santo_star` · `anrobo` · `adelainec`

## Google Sheets (optional)

Place `google-credentials.json` at `~/.ledger/google-credentials.json` and set the Sheet ID in configure.py.
