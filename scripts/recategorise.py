#!/usr/bin/env python3
"""One-time script to re-categorise existing transactions using Claude."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import Config
from src import storage
import anthropic

CATEGORIES = [
    "groceries","dining","transport","travel","shopping","electronics",
    "health","beauty","entertainment","software","education",
    "utilities","insurance","rent","tax","rewards","misc",
]

PROMPT = """Categorise each transaction below. Return ONLY a JSON array of objects with keys "id" and "category".
Pick the most specific category from: {cats}.

Rules:
- groceries: City Super, Great, Sogo food, Wellcome, supermarkets
- dining: restaurants, cafes, food delivery
- transport: MTR, taxi, Uber, petrol, parking, flights, ferry
- travel: hotels, holiday packages
- shopping: retail, clothing, department stores, Amazon
- electronics: Apple Store, tech, gadgets
- health: pharmacy, doctors, dentist, gym
- beauty: salon, spa, haircut
- entertainment: cinema, events, Netflix, Spotify
- software: Wix, Dropbox, Loom, CapCut, Base44, Patreon, SaaS
- education: Thinkific, courses, books, AAA Accelerator
- utilities: electricity, gas, water, internet, phone
- insurance: AXA, insurance premiums
- rent: rental income or rent paid
- tax: tax payments
- rewards: cashback, bank rebates, bonus credits
- misc: anything else

Transactions:
{txns}
""".format(cats=", ".join(CATEGORIES), txns="{txns}")

def main():
    config = Config.load()
    txns = storage.get_transactions(config)
    if not txns:
        print("No transactions found.")
        return

    # Build input list
    items = [{"id": t["id"], "merchant": t.get("merchant","?"), "amount": t.get("amount"), "notes": t.get("notes","")} for t in txns]

    # Process in batches of 50
    client = anthropic.Anthropic(api_key=config.anthropic_api_key)
    batch_size = 50
    updates = []
    for i in range(0, len(items), batch_size):
        batch = items[i:i+batch_size]
        prompt = PROMPT.format(txns=json.dumps(batch, ensure_ascii=False))
        print(f"Categorising batch {i//batch_size + 1} ({len(batch)} transactions)…")
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(raw)
        updates.extend(result)

    # Apply updates
    from src.storage import get_db
    with get_db(config) as conn:
        for u in updates:
            cat = u.get("category", "misc")
            if cat not in CATEGORIES:
                cat = "misc"
            conn.execute("UPDATE transactions SET category = ? WHERE id = ?", (cat, u["id"]))

    print(f"Done — updated {len(updates)} transactions.")

if __name__ == "__main__":
    main()
