Process all documents currently in the Ledger inbox folder.

1. Load config from `~/.ledger/config.json` using `src/config.py Config.load()`
2. Call `src/storage.init_db(config)` to ensure DB exists
3. List all `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp` files in `config.inbox_folder`
4. For each file:
   a. Compute MD5 hash via `src/storage.file_hash(path)`
   b. Skip if `src/storage.is_duplicate(config, hash)` is True — print "⏭️ Skipping duplicate: {name}"
   c. Call `src/extractor.extract_document(config, path)` to read the document
   d. Call `src/classifier.classify(result, config.entities)` to normalise fields
   e. If `result.entity` is empty, print "⚠️ Could not detect entity for {name} — skipping" and continue
   f. Call `src/storage.save_document(...)` then `src/storage.save_transactions(...)`
   g. Print "✅ {name} → {entity} ({doc_type}) — {n} transactions saved"
5. Print a summary: "Processed {n} new documents, skipped {m} duplicates"
