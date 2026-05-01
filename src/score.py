# apps/Save-my-Brain/src/score.py
"""Financial Clarity Score — compute and persist the user's score.

Score logic (engagement + coverage):
  +8  per bank/credit_card/mortgage statement doc (capped at last 3 months × doc types)
  +10 per insurance doc uploaded (capped at 5 policies)
  +8  per investment/mpf doc uploaded (capped at 5)
  +3  per AI chat question asked this week (max +9/week, tracked via chat_events setting)
  +5  cleared action item (tracked via action_events setting)

The score is recomputed from scratch on each call (idempotent).
Stored in settings table. Max 100. Floor 0.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, date, timedelta
from . import storage
from .config import Config

_BANK_TYPES = {"bank", "credit_card", "mortgage"}
_INVEST_TYPES = {"investment", "mpf"}
_INSURANCE_TYPES = {"insurance"}

_MAX_STATEMENT_MONTHS = 3    # only count the 3 most recent months of bank docs
_MAX_INSURANCE_DOCS = 5
_MAX_INVEST_DOCS = 5
_MAX_AI_PTS_PER_WEEK = 9
_MAX_SCORE = 100


def compute_score(config: Config) -> dict:
    """Return dict with keys: score, delta, nudge."""
    with storage.get_db(config) as conn:
        docs = conn.execute(
            "SELECT doc_type, doc_date, created_at FROM documents ORDER BY created_at DESC"
        ).fetchall()
        chat_events_raw = conn.execute(
            "SELECT value FROM settings WHERE key='clarity_chat_events'"
        ).fetchone()
        action_events_raw = conn.execute(
            "SELECT value FROM settings WHERE key='clarity_action_events'"
        ).fetchone()

    pts = 0

    # Bank/credit_card/mortgage statements — count distinct months, cap at _MAX_STATEMENT_MONTHS
    bank_months = sorted(set(
        (r[1] or r[2] or "")[:7]
        for r in docs if r[0] in _BANK_TYPES and (r[1] or r[2] or "")[:7]
    ), reverse=True)[:_MAX_STATEMENT_MONTHS]
    pts += len(bank_months) * 8

    # Insurance docs — cap at _MAX_INSURANCE_DOCS
    insurance_count = min(sum(1 for r in docs if r[0] in _INSURANCE_TYPES), _MAX_INSURANCE_DOCS)
    pts += insurance_count * 10

    # Investment/MPF — cap at _MAX_INVEST_DOCS
    invest_count = min(sum(1 for r in docs if r[0] in _INVEST_TYPES), _MAX_INVEST_DOCS)
    pts += invest_count * 8

    # AI chat questions this week
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    chat_pts = 0
    if chat_events_raw:
        events = json.loads(chat_events_raw[0])
        recent = [e for e in events if e >= week_ago]
        chat_pts = min(len(recent) * 3, _MAX_AI_PTS_PER_WEEK)
    pts += chat_pts

    # Cleared action items (lifetime, stored as list of ISO timestamps)
    if action_events_raw:
        action_pts = min(len(json.loads(action_events_raw[0])) * 5, 25)
        pts += action_pts

    score = min(pts, _MAX_SCORE)

    # Compute delta vs stored score
    stored = storage.get_setting(config, "clarity_score", "0")
    try:
        prev_score = int(stored)
    except ValueError:
        prev_score = 0
    delta = score - prev_score

    # Persist new score
    storage.set_setting(config, "clarity_score", str(score))
    storage.set_setting(config, "clarity_score_updated_at", datetime.now(timezone.utc).isoformat())

    # Nudge text — what would give the most points next
    nudge = _compute_nudge(config, docs, bank_months)

    return {"score": score, "delta": delta, "nudge": nudge}


def _compute_nudge(config: Config, docs: list, bank_months: list) -> str:
    """Return a short motivational nudge string."""
    today = date.today()
    current_month = today.strftime("%Y-%m")
    prev_month = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

    # Missing current or previous month bank statement?
    if current_month not in bank_months and prev_month not in bank_months:
        return "Upload last month's bank statement to +8 pts"
    if current_month not in bank_months:
        return "Upload this month's statement to keep your score up"

    # No insurance?
    has_insurance = any(r[0] == "insurance" for r in docs)
    if not has_insurance:
        return "Upload an insurance policy to +10 pts"

    # No investment/MPF?
    has_invest = any(r[0] in {"investment", "mpf"} for r in docs)
    if not has_invest:
        return "Upload an MPF or brokerage statement to +8 pts"

    return "Ask AI a question to earn more points"


def record_chat_event(config: Config) -> None:
    """Call after each AI chat message to track for score."""
    raw = storage.get_setting(config, "clarity_chat_events", "[]")
    try:
        events = json.loads(raw)
    except ValueError:
        events = []
    events.append(datetime.now(timezone.utc).isoformat())
    # Keep only last 60 days to avoid unbounded growth
    cutoff = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    events = [e for e in events if e >= cutoff]
    storage.set_setting(config, "clarity_chat_events", json.dumps(events))


def record_action_cleared(config: Config) -> None:
    """Call when a user clears an action item."""
    raw = storage.get_setting(config, "clarity_action_events", "[]")
    try:
        events = json.loads(raw)
    except ValueError:
        events = []
    events.append(datetime.now(timezone.utc).isoformat())
    storage.set_setting(config, "clarity_action_events", json.dumps(events))
