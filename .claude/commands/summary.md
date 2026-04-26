Show P&L summary. Usage: /summary [entity] [YYYY-MM]

Both arguments are optional. If omitted, shows all entities / all time.

1. Load config via `src/config.py Config.load()`
2. Call `src/storage.get_transactions(config, entity=entity, month=month)`
3. Calculate:
   - Total income = sum of amounts where direction == "income"
   - Total expenses = sum of amounts where direction == "expense"
   - Net = income − expenses
   - Breakdown by category (sum amounts per category)
4. Display:
   - Header: "{entity or 'All Entities'} · {month or 'All Time'}"
   - Income / Expenses / Net totals (HKD, formatted with commas)
   - Category breakdown table: Category · Income · Expenses · Net
   - Number of transactions
