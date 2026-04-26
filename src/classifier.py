from __future__ import annotations

from .extractor import ExtractionResult

_VALID_CATEGORIES = {"rent", "utilities", "insurance", "management", "rewards", "misc"}
_VALID_DIRECTIONS = {"income", "expense"}


def classify(result: ExtractionResult, known_entities: list[str]) -> ExtractionResult:
    """Normalise entity and transaction fields. Mutates result in place, returns it."""
    if result.entity and result.entity not in known_entities:
        result.entity = ""
        result.entity_confidence = "low"

    for t in result.transactions:
        if t.get("category") not in _VALID_CATEGORIES:
            t["category"] = "misc"
        if t.get("direction") not in _VALID_DIRECTIONS:
            t["direction"] = "expense"

    return result
