Show the last 10 documents processed and a per-entity transaction count.

1. Load config via `src/config.py Config.load()`
2. Call `src/storage.get_documents(config, limit=10)` and display as a table:
   - Columns: Date · Entity · Type · Issuer · Currency · Total
3. Call `src/storage.get_transactions(config)` and count per entity.
   Display as a summary table:
   - Columns: Entity · Total Transactions · Income (HKD) · Expenses (HKD) · Net

Format numbers with commas. Show "No documents yet" if empty.
