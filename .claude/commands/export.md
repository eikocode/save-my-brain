Regenerate CSV and sync all transactions to Google Sheets.

1. Load config via `src/config.py Config.load()`
2. Call `src/exporter.export_csv(config)` — prints path of generated CSV
3. Call `src/exporter.sync_to_sheets(config)` — returns row count synced
4. Print "✅ CSV written to {path}"
5. Print "✅ {n} rows synced to Google Sheets" or "⚠️ Google Sheets skipped (no credentials)"
