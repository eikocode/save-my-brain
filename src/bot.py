from __future__ import annotations

import logging
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
from .renderer import render_pdf_preview, render_summary, render_transactions
from . import storage

log = logging.getLogger(__name__)
router = Router()
_sessions: dict[str, dict] = {}


def _entity_keyboard(session_key: str, entities: list[str] | None = None) -> InlineKeyboardMarkup:
    if entities is None:
        entities = []
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=e, callback_data=f"entity:{session_key}:{e}")]
        for e in entities
    ])


def _action_keyboard(session_key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="✅ Save", callback_data=f"save:{session_key}"),
            InlineKeyboardButton(text="🗑️ Discard", callback_data=f"discard:{session_key}"),
        ],
        [
            InlineKeyboardButton(text="📋 Preview transactions", callback_data=f"preview:{session_key}"),
            InlineKeyboardButton(text="✏️ Change entity", callback_data=f"change:{session_key}"),
        ],
    ])


def _result_text(result: ExtractionResult, entity: str, confirmed: bool = False) -> str:
    if confirmed:
        confidence = "(confirmed)"
    elif result.entity_confidence == "high":
        confidence = "(auto-detected)"
    else:
        confidence = "(guessed)"
    entity_display = entity.replace("_", " ").title()
    return (
        f"✅ *{result.doc_type.title()} detected*\n"
        f"📅 {result.doc_date} · {result.currency} {result.total:,.2f}\n"
        f"🏢 {result.issuer}\n"
        f"🏠 Entity: {entity_display} {confidence}\n"
        f"📂 Transactions: {len(result.transactions)}"
    )


@router.message(F.document | F.photo)
async def handle_doc(message: Message, config: Config) -> None:
    if message.document:
        file, fname = message.document, message.document.file_name
    else:
        file, fname = message.photo[-1], f"photo_{message.message_id}.jpg"

    tf = tempfile.NamedTemporaryFile(suffix=Path(fname).suffix, delete=False)
    tf.close()
    tmp_path = Path(tf.name)
    await message.bot.download(file, destination=tmp_path)

    h = storage.file_hash(tmp_path)
    if storage.is_duplicate(config, h):
        orig = storage.get_document_by_hash(config, h)
        if orig:
            entity_display = (orig.get("entity") or "unknown").replace("_", " ").title()
            date_saved = (orig.get("created_at") or "")[:10]
            await message.reply(
                f"⚠️ *Already saved* — this file was processed before.\n\n"
                f"📅 Saved on: {date_saved}\n"
                f"📄 Type: {orig.get('doc_type', '?').title()}\n"
                f"🏢 Issuer: {orig.get('issuer') or '?'}\n"
                f"🏠 Entity: {entity_display}\n"
                f"💰 Total: {orig.get('currency', 'HKD')} {orig.get('total', 0):,.2f}",
                parse_mode="Markdown",
            )
        else:
            await message.reply("⚠️ Already processed (duplicate).")
        tmp_path.unlink(missing_ok=True)
        return

    # Send first-page preview before extraction
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
        await message.reply(f"❌ Extraction failed: {e}")
        return
    classify(result, config.entities)

    if result.doc_type == "unknown" and not result.issuer and result.total == 0:
        tmp_path.unlink(missing_ok=True)
        await message.reply(
            "❌ Could not read this document.\n\n"
            "If you're using OAuth mode, try switching to API mode in `configure.py` "
            "(set an Anthropic API key). PDFs work best in API mode."
        )
        return

    # Evict sessions older than 1 hour to prevent memory/disk leaks from abandoned flows
    cutoff = datetime.now(timezone.utc).timestamp() - 3600
    stale = [k for k, v in _sessions.items() if v.get("ts", 0) < cutoff]
    for k in stale:
        if p := _sessions.pop(k, {}).get("tmp_path"):
            Path(p).unlink(missing_ok=True)

    session_key = str(message.message_id)
    _sessions[session_key] = {
        "result": result, "tmp_path": tmp_path, "hash": h, "entity": result.entity,
        "ts": datetime.now(timezone.utc).timestamp(),
    }

    text = _result_text(result, result.entity or "unknown")
    if not result.entity or result.entity_confidence == "low":
        await message.reply(
            text + "\n\n❓ *Which entity is this for?*",
            parse_mode="Markdown",
            reply_markup=_entity_keyboard(session_key, config.entities),
        )
    else:
        await message.reply(text, parse_mode="Markdown",
                            reply_markup=_action_keyboard(session_key))


@router.callback_query(F.data.startswith("entity:"))
async def cb_entity(cq: CallbackQuery, config: Config) -> None:
    _, session_key, entity = cq.data.split(":", 2)
    if session_key not in _sessions:
        await cq.answer("Session expired.")
        return
    _sessions[session_key]["entity"] = entity
    result = _sessions[session_key]["result"]
    await cq.message.edit_text(
        _result_text(result, entity, confirmed=True), parse_mode="Markdown",
        reply_markup=_action_keyboard(session_key),
    )
    await cq.answer()


@router.callback_query(F.data.startswith("save:"))
async def cb_save(cq: CallbackQuery, config: Config) -> None:
    _, session_key = cq.data.split(":", 1)
    if session_key not in _sessions:
        await cq.answer("Session expired.")
        return
    sess = _sessions.pop(session_key)
    result, tmp_path, h, entity = (
        sess["result"], Path(sess["tmp_path"]), sess["hash"], sess["entity"]
    )
    if not entity:
        await cq.answer("Please select an entity first.")
        return
    doc_id = storage.save_document(
        config, entity, result.doc_type, result.issuer, result.doc_date,
        result.currency, result.total, h, str(tmp_path), result.summary,
    )
    storage.save_transactions(config, doc_id, entity, result.transactions)
    tmp_path.unlink(missing_ok=True)
    await cq.message.edit_text(f"✅ Saved — {len(result.transactions)} transaction(s) stored.")
    await cq.answer()


@router.callback_query(F.data.startswith("preview:"))
async def cb_preview(cq: CallbackQuery) -> None:
    _, session_key = cq.data.split(":", 1)
    if session_key not in _sessions:
        await cq.answer("Session expired.")
        return
    result = _sessions[session_key]["result"]
    if not result.transactions:
        await cq.answer("No transactions extracted.")
        return
    title = f"{result.issuer}  ·  {len(result.transactions)} transactions"
    img_bytes = render_transactions(result.transactions, title=title)
    from aiogram.types import BufferedInputFile
    await cq.message.reply_photo(
        photo=BufferedInputFile(img_bytes, filename="transactions.png"),
        caption=f"📋 *{title}*",
        parse_mode="Markdown",
    )
    await cq.answer()


@router.callback_query(F.data.startswith("change:"))
async def cb_change(cq: CallbackQuery, config: Config) -> None:
    _, session_key = cq.data.split(":", 1)
    if session_key not in _sessions:
        await cq.answer("Session expired.")
        return
    await cq.message.edit_reply_markup(reply_markup=_entity_keyboard(session_key, config.entities))
    await cq.answer()


@router.callback_query(F.data.startswith("discard:"))
async def cb_discard(cq: CallbackQuery) -> None:
    _, session_key = cq.data.split(":", 1)
    sess = _sessions.pop(session_key, {})
    if p := sess.get("tmp_path"):
        Path(p).unlink(missing_ok=True)
    await cq.message.edit_text("🗑️ Discarded.")
    await cq.answer()


@router.message(Command("status"))
async def cmd_status(message: Message, config: Config) -> None:
    docs = storage.get_documents(config, limit=10)
    if not docs:
        await message.reply("No documents processed yet.")
        return
    lines = ["*Last 10 documents:*\n"]
    for d in docs:
        lines.append(
            f"• {d.get('doc_date') or '?'} · {d['entity']} · {d['doc_type']} · "
            f"{d.get('currency', '')} {d.get('total') or 0:,.0f}"
        )
    await message.reply("\n".join(lines), parse_mode="Markdown")


@router.message(Command("summary"))
async def cmd_summary(message: Message, config: Config) -> None:
    parts = (message.text or "").split()
    entity = parts[1] if len(parts) > 1 else None
    month = parts[2] if len(parts) > 2 else None
    txns = storage.get_transactions(config, entity=entity, month=month)
    if not txns:
        await message.reply("No transactions found for those filters.")
        return
    income = sum(t["amount"] for t in txns if t["direction"] == "income")
    expenses = sum(t["amount"] for t in txns if t["direction"] == "expense")
    label = f"{entity or 'all entities'} · {month or 'all time'}"
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
        await message.reply("No transactions found for those filters.")
        return
    # Cap at 50 rows to keep image readable
    capped = txns[:50]
    img_bytes = render_transactions(capped)
    from aiogram.types import BufferedInputFile
    label = f"{(entity or 'all').replace('_', ' ').title()} · {month or 'all time'} · {len(txns)} transaction(s)"
    if len(txns) > 50:
        label += " (showing first 50)"
    await message.reply_photo(
        photo=BufferedInputFile(img_bytes, filename="transactions.png"),
        caption=f"📋 *{label}*",
        parse_mode="Markdown",
    )


@router.message(Command("pl"))
async def cmd_pl(message: Message, config: Config) -> None:
    parts = (message.text or "").split()
    entity = parts[1] if len(parts) > 1 else None
    month = parts[2] if len(parts) > 2 else None
    txns = storage.get_transactions(config, entity=entity, month=month)
    if not txns:
        await message.reply("No transactions found for those filters.")
        return
    label_entity = (entity or "all entities").replace("_", " ").title()
    label_month = month or "all time"
    img_bytes = render_summary(label_entity, label_month, txns)
    from aiogram.types import BufferedInputFile
    await message.reply_photo(
        photo=BufferedInputFile(img_bytes, filename="pl.png"),
        caption=f"📊 *{label_entity}  ·  {label_month}*",
        parse_mode="Markdown",
    )


@router.message()
async def cmd_fallback(message: Message) -> None:
    await message.reply(
        "📂 *SavemyBrain Bot*\n\n"
        "Send me a PDF, photo, or document to process it.\n\n"
        "*Commands:*\n"
        "/status — last 10 documents\n"
        "/transactions [entity] [YYYY-MM] — transaction detail image\n"
        "/pl [entity] [YYYY-MM] — P&L summary image",
        parse_mode="Markdown",
    )


async def run_bot(config: Config) -> None:
    bot = Bot(token=config.telegram_bot_token)
    dp = Dispatcher()
    dp.include_router(router)
    dp["config"] = config
    storage.init_db(config)
    await dp.start_polling(bot)
