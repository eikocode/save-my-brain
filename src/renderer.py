from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_BG = (18, 18, 18)
_FG = (220, 220, 220)
_ACCENT = (100, 200, 150)
_INC = (100, 220, 100)
_EXP = (220, 100, 100)
_ROW_H = 32
_PAD = 16
_FONT_SIZE = 14
_COLS = ["Date", "Merchant", "Amount", "Currency", "Category", "Direction"]


def _font(size: int = _FONT_SIZE):
    for path in ("/System/Library/Fonts/Helvetica.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def render_pdf_preview(file_path: Path) -> bytes | None:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        try:
            import fitz
            doc = fitz.open(str(file_path))
            pix = doc[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            return pix.tobytes("png")
        except Exception:
            return None
    elif suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        return file_path.read_bytes()
    return None


_CAT_COLORS = {
    "rewards":    (220, 200,  60),
    "rent":       (100, 160, 220),
    "utilities":  (220, 160,  80),
    "insurance":  (180, 100, 220),
    "management": ( 80, 200, 180),
    "misc":       (140, 140, 140),
}


def render_transactions(transactions: list[dict], title: str = "") -> bytes:
    from collections import defaultdict

    income_total = expense_total = 0.0
    by_cat: dict[str, list[float]] = defaultdict(list)
    by_merchant: dict[str, float] = defaultdict(float)

    for t in transactions:
        amount = abs(float(t.get("amount") or 0))
        direction = t.get("direction", "expense")
        cat = t.get("category") or "misc"
        merchant = (t.get("merchant") or "Unknown").strip()
        by_cat[cat].append(amount)
        by_merchant[merchant] += amount
        if direction == "income":
            income_total += amount
        else:
            expense_total += amount

    net = income_total - expense_total
    cats = sorted(by_cat.items(), key=lambda x: -sum(x[1]))
    merchants = sorted(by_merchant.items(), key=lambda x: -x[1])[:12]

    width = 680
    pad = 20
    row_h = 26
    font = _font(13)
    font_sm = _font(11)
    font_lg = _font(15)

    height = (pad + 36 + 16 + 44 + 16 + 18 + len(cats) * row_h +
              16 + 18 + len(merchants) * row_h + pad)

    img = Image.new("RGB", (width, height), _BG)
    draw = ImageDraw.Draw(img)
    y = pad

    # Title
    draw.text((pad, y), title or f"{len(transactions)} transactions", fill=_ACCENT, font=font_lg)
    y += 36

    # Totals
    draw.text((pad, y),        f"Income    HKD {income_total:>10,.0f}", fill=_INC, font=font)
    draw.text((pad + 280, y),  f"Expenses  HKD {expense_total:>10,.0f}", fill=_EXP, font=font)
    y += 22
    draw.text((pad, y), f"Net       HKD {net:>10,.0f}", fill=(_INC if net >= 0 else _EXP), font=font)
    y += 38

    # Category breakdown
    draw.text((pad, y), "BY CATEGORY", fill=_ACCENT, font=font_sm)
    y += 18
    bar_x = pad + 120
    bar_max = width - bar_x - 200
    max_cat = max((sum(v) for v in by_cat.values()), default=1)
    for cat, amounts in cats:
        total = sum(amounts)
        bar_w = max(2, int(bar_max * total / max_cat))
        color = _CAT_COLORS.get(cat, (140, 140, 140))
        draw.rectangle([bar_x, y + 5, bar_x + bar_w, y + row_h - 5], fill=color)
        draw.text((pad, y + 4), cat.title(), fill=_FG, font=font_sm)
        draw.text((bar_x + bar_max + 10, y + 4),
                  f"HKD {total:>8,.0f}  {len(amounts)}×", fill=_FG, font=font_sm)
        y += row_h
    y += 16

    # Top merchants
    draw.text((pad, y), "TOP MERCHANTS", fill=_ACCENT, font=font_sm)
    y += 18
    max_merch = max((v for _, v in merchants), default=1)
    bar_x2 = pad + 220
    bar_max2 = width - bar_x2 - 160
    for merchant, total in merchants:
        name = merchant[:30] + "…" if len(merchant) > 30 else merchant
        bar_w = max(2, int(bar_max2 * total / max_merch))
        draw.rectangle([bar_x2, y + 5, bar_x2 + bar_w, y + row_h - 5], fill=(80, 100, 130))
        draw.text((pad, y + 4), name, fill=_FG, font=font_sm)
        draw.text((bar_x2 + bar_max2 + 10, y + 4), f"HKD {total:>8,.0f}", fill=_FG, font=font_sm)
        y += row_h

    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def render_summary(entity: str, month: str, transactions: list[dict]) -> bytes:
    income = sum(t.get("amount", 0) for t in transactions if t.get("direction") == "income")
    expenses = sum(t.get("amount", 0) for t in transactions if t.get("direction") == "expense")
    net = income - expenses

    font_lg = _font(16)
    font_sm = _font(12)
    width, height = 600, 280
    img = Image.new("RGB", (width, height), _BG)
    draw = ImageDraw.Draw(img)

    draw.text((_PAD, _PAD), f"{entity}  ·  {month}", fill=_ACCENT, font=font_lg)
    draw.text((_PAD, 55), f"Income:    HKD {income:>12,.2f}", fill=_INC, font=font_lg)
    draw.text((_PAD, 90), f"Expenses:  HKD {expenses:>12,.2f}", fill=_EXP, font=font_lg)
    draw.text((_PAD, 125), f"Net:       HKD {net:>12,.2f}", fill=_FG, font=font_lg)

    bar_x, bar_y, bar_w, bar_h = _PAD, 175, width - _PAD * 2, 30
    max_val = max(income, expenses, 1)
    draw.rectangle([bar_x, bar_y, bar_x + int(bar_w * income / max_val), bar_y + bar_h // 2 - 1],
                   fill=_INC)
    draw.rectangle([bar_x, bar_y + bar_h // 2 + 1,
                    bar_x + int(bar_w * expenses / max_val), bar_y + bar_h], fill=_EXP)
    draw.text((_PAD, bar_y + bar_h + 10), "■ Income   ■ Expenses", fill=_FG, font=font_sm)

    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
