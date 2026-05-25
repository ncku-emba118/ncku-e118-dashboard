#!/usr/bin/env python3
"""
Generate PWA icons for E118 Dashboard — Variant C · Heraldic Banner.

Composition:
  - Full-bleed wine background (no transparent corners)
  - Enlarged NCKU shield on cream plate, upper portion
  - Gold ribbon banner across bottom containing "EMBA · E118"

Output sizes:
  - assets/pwa-icon-192.png        (Android, favicon high-DPI)
  - assets/pwa-icon-512.png        (Android splash, PWA install)
  - assets/pwa-icon-180.png        (iOS apple-touch-icon)
  - assets/pwa-icon-maskable-512.png  (Android adaptive icon — safe zone compressed)
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
SRC_LOGO = ASSETS / "ncku-emba-logo.png"

WINE = (139, 31, 47, 255)
WINE_DEEP = (107, 22, 34, 255)
GOLD = (201, 169, 97, 255)
GOLD_SOFT = (224, 200, 150, 255)
CREAM = (250, 247, 242, 255)


def find_font(size, bold=False):
    candidates_bold = [
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/System/Library/Fonts/Supplemental/Cochin.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    candidates_reg = [
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/System/Library/Fonts/Supplemental/Cochin.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    candidates = candidates_bold if bold else candidates_reg
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def crop_shield(logo_path):
    """Crop the left-side NCKU shield from the horizontal logo (tight bbox)."""
    logo = Image.open(logo_path).convert("RGBA")
    w, h = logo.size
    shield = logo.crop((0, 0, min(h + 30, w), h))
    bbox = shield.getbbox()
    if bbox:
        shield = shield.crop(bbox)
    return shield


def cream_plate(diameter, ring_width_ratio=0.013):
    plate = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.ellipse((0, 0, diameter - 1, diameter - 1), fill=CREAM)
    rw = max(1, int(diameter * ring_width_ratio))
    d.ellipse((0, 0, diameter - 1, diameter - 1), outline=GOLD, width=rw)
    return plate


def text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox[0], bbox[1]


def make_icon(size, *, maskable=False):
    """Variant C — Heraldic Banner composition.

    maskable=True: compress composition into inner 80% safe zone
    (Android may crop the outer 10% on each side).
    """
    canvas = Image.new("RGBA", (size, size), WINE)
    draw = ImageDraw.Draw(canvas)

    # Define drawable region (full canvas for normal, safe zone for maskable)
    if maskable:
        # Inner 80% safe zone (10% margin per side)
        safe_top = int(size * 0.10)
        safe_bottom = int(size * 0.90)
        safe_left = int(size * 0.10)
        safe_right = int(size * 0.90)
    else:
        safe_top = 0
        safe_bottom = size
        safe_left = 0
        safe_right = size

    safe_w = safe_right - safe_left
    safe_h = safe_bottom - safe_top
    cx = (safe_left + safe_right) // 2

    # Shield on cream plate — upper portion of safe area
    plate_d = int(safe_w * 0.66)
    plate = cream_plate(plate_d, ring_width_ratio=0.013)
    shield = crop_shield(SRC_LOGO)
    target_w = int(plate_d * 0.80)
    ratio = target_w / shield.width
    target_h = int(shield.height * ratio)
    shield_r = shield.resize((target_w, target_h), Image.LANCZOS)

    # Vertical position: center of plate at ~36% of safe area
    plate_cy = safe_top + int(safe_h * 0.36)
    canvas.alpha_composite(plate, (cx - plate_d // 2, plate_cy - plate_d // 2))
    canvas.alpha_composite(shield_r, (cx - target_w // 2, plate_cy - target_h // 2))

    # Gold ribbon banner across bottom of safe area
    banner_top = safe_top + int(safe_h * 0.74)
    banner_bot = safe_top + int(safe_h * 0.94)
    banner_left = safe_left + int(safe_w * 0.06)
    banner_right = safe_right - int(safe_w * 0.06)
    draw.rectangle((banner_left, banner_top, banner_right, banner_bot), fill=GOLD)
    # Inner stroke for ribbon depth
    draw.rectangle(
        (banner_left + 3, banner_top + 3, banner_right - 3, banner_bot - 3),
        outline=WINE_DEEP, width=1,
    )

    # Banner text "EMBA · E118"
    banner_h = banner_bot - banner_top
    txt_font = find_font(int(banner_h * 0.55), bold=True)
    txt = "EMBA · E118"
    tw, th, tox, toy = text_size(draw, txt, txt_font)
    tx = cx - tw // 2 - tox
    ty = (banner_top + banner_bot) // 2 - th // 2 - toy
    draw.text((tx, ty), txt, font=txt_font, fill=WINE_DEEP)

    return canvas


def main():
    ASSETS.mkdir(exist_ok=True)
    if not SRC_LOGO.exists():
        raise SystemExit(f"Missing source logo: {SRC_LOGO}")

    outputs = [
        ("pwa-icon-192.png", 192, False),
        ("pwa-icon-512.png", 512, False),
        ("pwa-icon-180.png", 180, False),
        ("pwa-icon-maskable-512.png", 512, True),
    ]

    for name, size, maskable in outputs:
        icon = make_icon(size, maskable=maskable)
        out = ASSETS / name
        icon.save(out, "PNG", optimize=True)
        print(f"  wrote {out.relative_to(ROOT)}  ({size}x{size}{', maskable' if maskable else ''})")


if __name__ == "__main__":
    main()
