from __future__ import annotations

import asyncio
import logging
import random
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton, InlineKeyboardMarkup, Message,
)

from .classifier import classify
from .config import Config
from .extractor import ExtractionResult, extract_document
from .intelligence import chat_reply
from .renderer import render_pdf_preview, render_summary, render_transactions
from . import storage

log = logging.getLogger(__name__)
router = Router()

_DELETE_KEYWORDS = re.compile(r"\b(delete|remove|erase|discard|trash)\b", re.I)

_QUOTES = [
    ("The secret of getting ahead is getting started.", "Mark Twain"),
    ("It is not enough to be busy. The question is: what are we busy about?", "Henry David Thoreau"),
    ("Your time is limited, so don't waste it living someone else's life.", "Steve Jobs"),
    ("Beware the barrenness of a busy life.", "Socrates"),
    ("The key is not to prioritise what's on your schedule, but to schedule your priorities.", "Stephen Covey"),
    ("Almost everything will work again if you unplug it for a few minutes — including you.", "Anne Lamott"),
    ("The best way to predict your future is to create it.", "Abraham Lincoln"),
    ("Focus on being productive instead of busy.", "Tim Ferriss"),
    ("Simplicity is the ultimate sophistication.", "Leonardo da Vinci"),
    ("Do what you can, with what you have, where you are.", "Theodore Roosevelt"),
    ("The most precious resource we all have is time.", "Steve Jobs"),
    ("An investment in knowledge pays the best interest.", "Benjamin Franklin"),
    ("The art of knowing is knowing what to ignore.", "Rumi"),
    ("Work smarter, not harder.", "Allan F. Mogensen"),
    ("You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"),
]

_GREETING_INTERVAL_HOURS = 24


async def _maybe_greet(message: Message, config: Config) -> None:
    """Send a motivational quote if 24 hours have passed since last greeting.
    Persisted in DB so restarts don't reset the timer."""
    user_id = message.from_user.id
    key = f"greeted_{user_id}"
    now = datetime.now(timezone.utc)
    last_str = storage.get_setting(config, key)
    if last_str:
        try:
            last = datetime.fromisoformat(last_str)
            if (now - last).total_seconds() < _GREETING_INTERVAL_HOURS * 3600:
                return
        except ValueError:
            pass
    storage.set_setting(config, key, now.isoformat())
    quote, author = random.choice(_QUOTES)
    await message.answer(f'💡 _"{quote}"_\n— {author}', parse_mode="Markdown")


def _entity_from_result(result: ExtractionResult) -> str:
    """Auto-detect entity from issuer name — no user input needed."""
    if result.entity and result.entity_confidence == "high":
        return result.entity
    if result.issuer:
        return re.sub(r"[^a-z0-9]+", "_", result.issuer.lower()).strip("_")
    return "unknown"


def _saved_text(result: ExtractionResult, entity: str, n_txns: int) -> str:
    return (
        f"✅ *Saved automatically*\n\n"
        f"📄 {result.doc_type.title()} · {result.issuer}\n"
        f"📅 {result.doc_date} · {result.currency} {result.total:,.2f}\n"
        f"📂 {n_txns} transaction(s) stored\n\n"
        f"_Say \"delete this\" anytime to remove it._"
    )


def _delete_keyboard(doc_ids: list[int]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"🗑️ Delete #{doc_id}", callback_data=f"del:{doc_id}")]
        for doc_id in doc_ids
    ])


@router.message(F.document | F.photo)
async def handle_doc(message: Message, config: Config) -> None:
    await _maybe_greet(message, config)
    if message.document:
        file, fname = message.document, message.document.file_name
    else:
        file, fname = message.photo[-1], f"photo_{message.message_id}.jpg"

    tf = tempfile.NamedTemporaryFile(suffix=Path(fname).suffix, delete=False)
    tf.close()
    tmp_path = Path(tf.name)
    await message.bot.download(file, destination=tmp_path)

    if config.monthly_upload_limit > 0:
        used = storage.count_uploads_this_month(config)
        if used >= config.monthly_upload_limit:
            tmp_path.unlink(missing_ok=True)
            await message.reply(
                f"⚠️ *Monthly upload limit reached* ({config.monthly_upload_limit} documents).\n"
                "Upgrade your plan to upload more this month.",
                parse_mode="Markdown",
            )
            return

    h = storage.file_hash(tmp_path)
    if storage.is_duplicate(config, h):
        orig = storage.get_document_by_hash(config, h)
        if orig:
            date_saved = (orig.get("created_at") or "")[:10]
            await message.reply(
                f"⚠️ *Already saved* — this file was processed before.\n\n"
                f"📅 Saved on: {date_saved}\n"
                f"📄 {orig.get('doc_type', '?').title()} · {orig.get('issuer') or '?'}\n"
                f"💰 {orig.get('currency', 'HKD')} {orig.get('total', 0):,.2f}\n\n"
                f"_Say \"delete this\" if you want to remove it._",
                parse_mode="Markdown",
            )
        else:
            await message.reply("⚠️ Already processed (duplicate).")
        tmp_path.unlink(missing_ok=True)
        return

    # Preview while extracting
    preview_bytes = render_pdf_preview(tmp_path)
    if preview_bytes:
        from aiogram.types import BufferedInputFile
        await message.reply_photo(
            photo=BufferedInputFile(preview_bytes, filename="preview.png"),
            caption="⏳ Reading document…",
        )
    else:
        await message.reply("⏳ Reading document…")

    try:
        result = extract_document(config, tmp_path)
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        await message.reply(f"❌ Could not read this document: {e}")
        return

    classify(result, config.entities)
    tmp_path.unlink(missing_ok=True)

    if result.doc_type == "unknown" and not result.issuer and result.total == 0:
        await message.reply(
            "❌ Could not extract any data from this document.\n"
            "Try a clearer scan or a different file."
        )
        return

    # Auto-detect entity and save immediately — no user input needed
    entity = _entity_from_result(result)

    # Insurance duplicate check: same policy number + same coverage year
    if result.doc_type == "insurance" and result.reference_number:
        existing = storage.find_insurance_duplicate(config, result.reference_number, result.coverage_period)
        if existing:
            await message.reply(
                f"⚠️ *Already saved* — Policy `{result.reference_number}` for this coverage period "
                f"was already recorded (doc ID {existing['id']}).\n\n"
                f"_This looks like another page of the same policy year. Not saved to avoid double-counting._",
                parse_mode="Markdown",
            )
            return

    safe_total = storage.sanitise_statement_total(result.doc_type, result.total, result.transactions)
    doc_id = storage.save_document(
        config, entity, result.doc_type, result.issuer, result.doc_date,
        result.currency, safe_total, h, fname, result.summary,
        result.reference_number, result.coverage_period,
        result.holdings,
    )
    txns = storage.filter_saveable_transactions(result.doc_type, result.total, result.transactions)
    if not txns and result.doc_type == "insurance":
        storage.zero_document_total(config, doc_id)
    storage.save_transactions(config, doc_id, entity, txns)

    await message.reply(
        _saved_text(result, entity, len(result.transactions)),
        parse_mode="Markdown",
    )


@router.callback_query(F.data.startswith("del:"))
async def cb_delete(cq: CallbackQuery, config: Config) -> None:
    _, doc_id_str = cq.data.split(":", 1)
    try:
        doc_id = int(doc_id_str)
    except ValueError:
        await cq.answer("Invalid.")
        return
    deleted = storage.delete_document(config, doc_id)
    if deleted:
        await cq.message.edit_text("🗑️ Deleted — document and all its transactions removed.")
    else:
        await cq.message.edit_text("⚠️ Not found — may have already been deleted.")
    await cq.answer()


@router.message(Command("status"))
async def cmd_status(message: Message, config: Config) -> None:
    docs = storage.get_documents(config, limit=10)
    if not docs:
        await message.reply("No documents saved yet.")
        return
    lines = ["*Last 10 documents:*\n"]
    for d in docs:
        lines.append(
            f"• #{d['id']} · {d.get('doc_date') or '?'} · {d.get('issuer') or d['entity']} · "
            f"{d.get('currency', 'HKD')} {d.get('total') or 0:,.0f}"
        )
    await message.reply("\n".join(lines), parse_mode="Markdown")


@router.message(Command("summary"))
async def cmd_summary(message: Message, config: Config) -> None:
    parts = (message.text or "").split()
    entity = parts[1] if len(parts) > 1 else None
    month = parts[2] if len(parts) > 2 else None
    txns = storage.get_transactions(config, entity=entity, month=month)
    if not txns:
        await message.reply("No transactions found.")
        return
    income = sum(t["amount"] for t in txns if t["direction"] == "income")
    expenses = sum(t["amount"] for t in txns if t["direction"] == "expense")
    label = f"{entity or 'all'} · {month or 'all time'}"
    await message.reply(
        f"*{label}*\n\n"
        f"Income:   HKD {income:,.2f}\n"
        f"Expenses: HKD {expenses:,.2f}\n"
        f"Net:      HKD {income - expenses:,.2f}\n\n"
        f"Transactions: {len(txns)}",
        parse_mode="Markdown",
    )


@router.message(Command("transactions"))
async def cmd_transactions(message: Message, config: Config) -> None:
    parts = (message.text or "").split()
    entity = parts[1] if len(parts) > 1 else None
    month = parts[2] if len(parts) > 2 else None
    txns = storage.get_transactions(config, entity=entity, month=month)
    if not txns:
        await message.reply("No transactions found.")
        return
    capped = txns[:50]
    img_bytes = render_transactions(capped)
    from aiogram.types import BufferedInputFile
    label = f"{(entity or 'all').replace('_', ' ').title()} · {month or 'all time'} · {len(txns)} transaction(s)"
    if len(txns) > 50:
        label += " (showing first 50)"
    await message.reply_photo(
        photo=BufferedInputFile(img_bytes, filename="transactions.png"),
        caption=f"📋 *{label}*", parse_mode="Markdown",
    )


@router.message(Command("pl"))
async def cmd_pl(message: Message, config: Config) -> None:
    parts = (message.text or "").split()
    entity = parts[1] if len(parts) > 1 else None
    month = parts[2] if len(parts) > 2 else None
    txns = storage.get_transactions(config, entity=entity, month=month)
    if not txns:
        await message.reply("No transactions found.")
        return
    label_entity = (entity or "all").replace("_", " ").title()
    label_month = month or "all time"
    img_bytes = render_summary(label_entity, label_month, txns)
    from aiogram.types import BufferedInputFile
    await message.reply_photo(
        photo=BufferedInputFile(img_bytes, filename="pl.png"),
        caption=f"📊 *{label_entity}  ·  {label_month}*", parse_mode="Markdown",
    )


@router.message()
async def cmd_fallback(message: Message, config: Config) -> None:
    await _maybe_greet(message, config)
    text = (message.text or "").strip()

    if not text:
        return

    # Natural language delete
    if _DELETE_KEYWORDS.search(text):
        docs = storage.get_documents(config, limit=5)
        if not docs:
            await message.reply("Nothing saved yet to delete.")
            return
        lines = ["Which document would you like to delete?\n"]
        for d in docs:
            lines.append(f"#{d['id']} · {d.get('doc_date') or '?'} · {d.get('issuer') or d['entity']} · {d.get('currency', 'HKD')} {d.get('total') or 0:,.0f}")
        await message.reply(
            "\n".join(lines),
            reply_markup=_delete_keyboard([d["id"] for d in docs]),
        )
        return

    # Help keywords — don't consume with AI
    if text.lower() in {"help", "/help", "?", "hi", "hello"}:
        await message.reply(
            "📂 *SavemyBrain*\n\n"
            "Send me any bank statement, receipt, or invoice — I'll read it and save it.\n\n"
            "Or just ask me anything about your finances:\n"
            "_\"How much did I spend on dining last month?\"\n"
            "\"What's my biggest expense category?\"\n"
            "\"When does my insurance renew?\"_\n\n"
            "*Commands:*\n"
            "/status — last 10 documents\n"
            "/transactions — full transaction list\n"
            "/pl — income vs expenses\n\n"
            "_Say \"delete\" to remove a document._",
            parse_mode="Markdown",
        )
        return

    # Natural language Q&A — route to AI
    if not storage.get_documents(config, limit=1):
        await message.reply(
            "No documents saved yet. Send me a bank statement, receipt, or invoice to get started."
        )
        return

    thinking = await message.reply("💭 Thinking…")
    loop = asyncio.get_event_loop()
    reply = await loop.run_in_executor(None, chat_reply, config, text)
    await thinking.delete()
    await message.reply(reply, parse_mode="Markdown")


async def run_bot(config: Config) -> None:
    bot = Bot(token=config.telegram_bot_token)
    dp = Dispatcher()
    dp.include_router(router)
    dp["config"] = config
    storage.init_db(config)
    await dp.start_polling(bot)
