"""
generate_icons.py — Generate PWA icons for Save My Brain AI
Run once: python generate_icons.py
Outputs: icon-192.png, icon-512.png
"""

from PIL import Image, ImageDraw, ImageFont
import os

BACKGROUND = (15, 23, 42)      # #0F172A dark navy
ACCENT = (14, 165, 233)         # #0EA5E9 electric teal


def generate_icon(size: int, output_path: str):
    img = Image.new("RGBA", (size, size), BACKGROUND)
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle background
    margin = size // 8
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 6,
        fill=ACCENT,
    )

    # Draw simplified brain shape using ellipses
    cx, cy = size // 2, size // 2
    r = size // 4

    # Left brain hemisphere
    draw.ellipse([cx - r - r // 4, cy - r, cx, cy + r // 2], fill=BACKGROUND)
    # Right brain hemisphere
    draw.ellipse([cx, cy - r, cx + r + r // 4, cy + r // 2], fill=BACKGROUND)
    # Brain stem
    draw.ellipse([cx - r // 4, cy + r // 4, cx + r // 4, cy + r], fill=BACKGROUND)
    # Center gap
    draw.line([cx, cy - r, cx, cy + r // 2], fill=ACCENT, width=size // 20)

    # "AI" text at bottom
    text = "AI"
    font_size = size // 5
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except Exception:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text(
        (cx - text_w // 2, size - margin - text_h - size // 20),
        text,
        fill=(248, 250, 252),  # #F8FAFC
        font=font,
    )

    img.save(output_path, "PNG")
    print(f"Generated {output_path} ({size}×{size})")


if __name__ == "__main__":
    os.makedirs(".", exist_ok=True)
    generate_icon(192, "icon-192.png")
    generate_icon(512, "icon-512.png")
