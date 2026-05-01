from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

CACHE_HOURS = 24
_FRANKFURTER = "https://api.frankfurter.app/latest"


def get_rates(config, base: str) -> dict[str, float]:
    """Return FX rates relative to base currency, cached in DB for 24h.

    frankfurter response example (base=HKD):
        {"base":"HKD","rates":{"USD":0.1282,"EUR":0.1175,...}}
    Meaning 1 HKD = 0.1282 USD.
    To convert USD→HKD: usd_amount / rates["USD"].
    """
    from .storage import get_db

    base = base.upper()
    with get_db(config) as conn:
        row = conn.execute(
            "SELECT rates_json, updated_at FROM fx_rates WHERE base=?", (base,)
        ).fetchone()
        if row:
            try:
                updated = datetime.fromisoformat(row[1])
                if (datetime.now(timezone.utc) - updated) < timedelta(hours=CACHE_HOURS):
                    rates = json.loads(row[0])
                    rates[base] = 1.0
                    return rates
            except Exception:
                pass

    try:
        url = f"{_FRANKFURTER}?from={base}"
        req = urllib.request.Request(url, headers={"User-Agent": "SaveMyBrain/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        rates = data.get("rates", {})
        rates[base] = 1.0
        with get_db(config) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO fx_rates (base, rates_json, updated_at) VALUES (?,?,?)",
                (base, json.dumps(rates), datetime.now(timezone.utc).isoformat()),
            )
        return rates
    except (urllib.error.URLError, Exception):
        return {base: 1.0}


def to_base(amount: float, from_ccy: str, base_ccy: str, rates: dict[str, float]) -> float:
    """Convert amount from from_ccy to base_ccy.

    rates[X] = how many X per 1 base_ccy (e.g. base=HKD, rates[USD]=0.128).
    So: base_amount = foreign_amount / rates[foreign_ccy].
    Unknown currencies are returned as-is (no conversion).
    """
    if not from_ccy:
        return amount
    from_ccy = from_ccy.upper()
    base_ccy = base_ccy.upper()
    if from_ccy == base_ccy:
        return amount
    rate = rates.get(from_ccy)
    if not rate:
        return amount
    return amount / rate
