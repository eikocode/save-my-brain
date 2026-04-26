Search transactions. Usage: /find [query]

The query can contain:
- A merchant name or partial name (case-insensitive)
- An entity key (goodhold, thousand_ford, etc.)
- A category (utilities, rent, insurance, etc.)
- A month (YYYY-MM)
- A direction (income or expense)

1. Load config via `src/config.py Config.load()`
2. Call `src/storage.get_transactions(config)` to get all transactions
3. Filter results where any field contains the query string (case-insensitive)
4. Display matching transactions as a table:
   - Columns: Date · Entity · Merchant · Amount · Currency · Category · Direction
5. Show "Found {n} matching transactions" or "No matches found"
