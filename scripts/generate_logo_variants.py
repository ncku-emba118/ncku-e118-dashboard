#!/usr/bin/env python3
"""
Generate 4 PWA logo variants — all 學院徽章 direction, all full-bleed wine
(no transparent corners), bigger shield than v1, both EMBA and E118 visible.

Output to assets/_variants/ for user comparison.
After user picks, rename winner to pwa-icon-*.png via generate_pwa_icon.py.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
SRC_LOGO = ASSETS / "ncku-emba-logo.png"
OUT = ASSETS / "_variants"
OUT.mkdir(exist_ok=True)

WINE = (139, 31, 47, 255)
WINE_DEEP = (107, 22, 34, 255)
GOLD = (201, 169, 97, 255)
GOLD_SOFT = (224, 200, 150, 255)
CREAM = (250, 247, 242, 255)
IVORY = (237, 230, 214, 255)
INK = (26, 22, 18, 255)


def find_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/System/Library/Fonts/Supplemental/Cochin.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def crop_shield(logo_path):
    """Crop the left-side shield region tightly."""
    logo = Image.open(logo_path).convert("RGBA")
    w, h = logo.size
    shield = logo.crop((0, 0, min(h + 30, w), h))
    bbox = shield.getbbox()
    if bbox:
        shield = shield.crop(bbox)
    return shield


def cream_plate(diameter, ring_width_ratio=0.012):
    """Cream circular plate with thin gold ring."""
    plate = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.ellipse((0, 0, diameter - 1, diameter - 1), fill=CREAM)
    rw = max(1, int(diameter * ring_width_ratio))
    d.ellipse((0, 0, diameter - 1, diameter - 1), outline=GOLD, width=rw)
    return plate


def text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox[0], bbox[1]


# ── Variant A · Full Bleed Badge with corner brackets ──
def variant_a(size=512):
    """Full wine bleed + gold corner brackets + big shield + EMBA + E118."""
    canvas = Image.new("RGBA", (size, size), WINE)
    draw = ImageDraw.Draw(canvas)

    # Gold corner brackets (4 corners, L-shaped)
    margin = int(size * 0.06)
    bracket_len = int(size * 0.10)
    bw = max(2, int(size * 0.008))
    for (x0, y0, dx1, dy1, dx2, dy2) in [
        (margin, margin, bracket_len, 0, 0, bracket_len),  # TL
        (size - margin, margin, -bracket_len, 0, 0, bracket_len),  # TR
        (margin, size - margin, bracket_len, 0, 0, -bracket_len),  # BL
        (size - margin, size - margin, -bracket_len, 0, 0, -bracket_len),  # BR
    ]:
        draw.line([(x0, y0), (x0 + dx1, y0 + dy1)], fill=GOLD, width=bw)
        draw.line([(x0, y0), (x0 + dx2, y0 + dy2)], fill=GOLD, width=bw)

    # Shield on cream plate, BIG (70% of icon)
    shield = crop_shield(SRC_LOGO)
    plate_d = int(size * 0.62)
    plate = cream_plate(plate_d, ring_width_ratio=0.014)
    target_w = int(plate_d * 0.78)
    ratio = target_w / shield.width
    target_h = int(shield.height * ratio)
    shield_r = shield.resize((target_w, target_h), Image.LANCZOS)

    cx = size // 2
    plate_cy = int(size * 0.42)
    canvas.alpha_composite(plate, (cx - plate_d // 2, plate_cy - plate_d // 2))
    canvas.alpha_composite(shield_r, (cx - target_w // 2, plate_cy - target_h // 2))

    # "NCKU  EMBA" eyebrow
    eb_font = find_font(int(size * 0.052))
    eb = "NCKU  EMBA"
    ebw, ebh, ebox, eboy = text_size(draw, eb, eb_font)
    ex = cx - ebw // 2 - ebox
    ey = int(size * 0.76) - ebh // 2 - eboy
    draw.text((ex, ey), eb, font=eb_font, fill=GOLD_SOFT)

    # "E118" big
    main_font = find_font(int(size * 0.22), bold=True)
    main = "E118"
    mw, mh, mox, moy = text_size(draw, main, main_font)
    mx = cx - mw // 2 - mox
    my = int(size * 0.87) - mh // 2 - moy
    draw.text((mx + 2, my + 3), main, font=main_font, fill=(0, 0, 0, 90))
    draw.text((mx, my), main, font=main_font, fill=GOLD)

    return canvas


# ── Variant B · Crest Stack (clean, no ornament) ──
def variant_b(size=512):
    """Full wine bleed + biggest shield (no decorations) + stacked text."""
    canvas = Image.new("RGBA", (size, size), WINE)
    draw = ImageDraw.Draw(canvas)

    # Tiny "NCKU EMBA" eyebrow at top
    eb_font = find_font(int(size * 0.048))
    eb = "N C K U   E M B A"
    ebw, ebh, ebox, eboy = text_size(draw, eb, eb_font)
    cx = size // 2
    draw.text((cx - ebw // 2 - ebox, int(size * 0.08) - eboy), eb, font=eb_font, fill=GOLD_SOFT)

    # Hairline divider under eyebrow
    line_y = int(size * 0.135)
    line_w = int(size * 0.18)
    draw.line([(cx - line_w // 2, line_y), (cx + line_w // 2, line_y)], fill=GOLD, width=1)

    # MASSIVE shield on cream plate (72% of icon)
    shield = crop_shield(SRC_LOGO)
    plate_d = int(size * 0.66)
    plate = cream_plate(plate_d, ring_width_ratio=0.011)
    target_w = int(plate_d * 0.82)
    ratio = target_w / shield.width
    target_h = int(shield.height * ratio)
    shield_r = shield.resize((target_w, target_h), Image.LANCZOS)

    plate_cy = int(size * 0.475)
    canvas.alpha_composite(plate, (cx - plate_d // 2, plate_cy - plate_d // 2))
    canvas.alpha_composite(shield_r, (cx - target_w // 2, plate_cy - target_h // 2))

    # Big E118
    main_font = find_font(int(size * 0.20), bold=True)
    main = "E118"
    mw, mh, mox, moy = text_size(draw, main, main_font)
    mx = cx - mw // 2 - mox
    my = int(size * 0.88) - mh // 2 - moy
    draw.text((mx + 1, my + 2), main, font=main_font, fill=(0, 0, 0, 80))
    draw.text((mx, my), main, font=main_font, fill=GOLD)

    return canvas


# ── Variant C · Heraldic Banner ──
def variant_c(size=512):
    """Shield + gold ribbon banner with 'EMBA · E118' inline."""
    canvas = Image.new("RGBA", (size, size), WINE)
    draw = ImageDraw.Draw(canvas)

    cx = size // 2

    # Big shield (no cream plate — cleaner heraldic look, shield direct on wine
    # with cream plate behind for legibility)
    shield = crop_shield(SRC_LOGO)
    plate_d = int(size * 0.66)
    plate = cream_plate(plate_d, ring_width_ratio=0.013)
    target_w = int(plate_d * 0.80)
    ratio = target_w / shield.width
    target_h = int(shield.height * ratio)
    shield_r = shield.resize((target_w, target_h), Image.LANCZOS)

    plate_cy = int(size * 0.40)
    canvas.alpha_composite(plate, (cx - plate_d // 2, plate_cy - plate_d // 2))
    canvas.alpha_composite(shield_r, (cx - target_w // 2, plate_cy - target_h // 2))

    # Gold ribbon banner across bottom third
    banner_top = int(size * 0.74)
    banner_bot = int(size * 0.94)
    banner_left = int(size * 0.06)
    banner_right = size - banner_left
    # Main banner body
    draw.rectangle((banner_left, banner_top, banner_right, banner_bot), fill=GOLD)
    # Banner notches (small angular cuts on edges for ribbon feel)
    notch = int(size * 0.025)
    # Inner stroke
    draw.rectangle(
        (banner_left + 3, banner_top + 3, banner_right - 3, banner_bot - 3),
        outline=WINE_DEEP,
        width=1,
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


# ── Variant D · Minimalist Mark (shield XL + crisp text) ──
def variant_d(size=512):
    """Maximum shield real estate + tight typographic E118 with EMBA above."""
    canvas = Image.new("RGBA", (size, size), WINE)
    draw = ImageDraw.Draw(canvas)
    cx = size // 2

    # Top-edge "EMBA" thin label with side rules
    eb_font = find_font(int(size * 0.058), bold=True)
    eb = "EMBA"
    ebw, ebh, ebox, eboy = text_size(draw, eb, eb_font)
    ey = int(size * 0.095) - eboy
    ex = cx - ebw // 2 - ebox
    draw.text((ex, ey), eb, font=eb_font, fill=GOLD)
    # Side rules
    rule_y = int(size * 0.115)
    rule_w = max(1, int(size * 0.006))
    gap = int(size * 0.025)
    rule_len = int(size * 0.16)
    draw.line(
        [(ex - gap - rule_len, rule_y), (ex - gap, rule_y)],
        fill=GOLD,
        width=rule_w,
    )
    draw.line(
        [(ex + ebw + gap, rule_y), (ex + ebw + gap + rule_len, rule_y)],
        fill=GOLD,
        width=rule_w,
    )

    # XL shield (74%)
    shield = crop_shield(SRC_LOGO)
    plate_d = int(size * 0.62)
    plate = cream_plate(plate_d, ring_width_ratio=0.013)
    target_w = int(plate_d * 0.84)
    ratio = target_w / shield.width
    target_h = int(shield.height * ratio)
    shield_r = shield.resize((target_w, target_h), Image.LANCZOS)
    plate_cy = int(size * 0.45)
    canvas.alpha_composite(plate, (cx - plate_d // 2, plate_cy - plate_d // 2))
    canvas.alpha_composite(shield_r, (cx - target_w // 2, plate_cy - target_h // 2))

    # Big E118 below
    main_font = find_font(int(size * 0.21), bold=True)
    main = "E118"
    mw, mh, mox, moy = text_size(draw, main, main_font)
    mx = cx - mw // 2 - mox
    my = int(size * 0.86) - mh // 2 - moy
    draw.text((mx + 1, my + 2), main, font=main_font, fill=(0, 0, 0, 80))
    draw.text((mx, my), main, font=main_font, fill=GOLD)

    return canvas


def main():
    variants = [
        ("variant-A-bracket-frame.png", variant_a),
        ("variant-B-crest-stack.png", variant_b),
        ("variant-C-heraldic-banner.png", variant_c),
        ("variant-D-minimalist-mark.png", variant_d),
    ]
    for name, fn in variants:
        img = fn(512)
        out = OUT / name
        img.save(out, "PNG", optimize=True)
        print(f"  wrote {out.relative_to(ROOT)}")

    # Also generate a combined comparison sheet (2x2)
    sheet_size = 1100
    pad = 30
    cell = (sheet_size - pad * 3) // 2
    sheet = Image.new("RGBA", (sheet_size, sheet_size + 60), CREAM)
    sdraw = ImageDraw.Draw(sheet)
    label_font = find_font(20, bold=True)
    sdraw.text((pad, 18), "E118 PWA Logo — 4 Variants", font=find_font(22, bold=True), fill=INK)
    sdraw.text((pad, 46), "All full-bleed wine · enlarged shield · EMBA + E118 visible", font=find_font(14), fill=(74, 65, 58, 255))

    positions = [(pad, 80 + pad), (pad * 2 + cell, 80 + pad),
                 (pad, 80 + pad * 2 + cell), (pad * 2 + cell, 80 + pad * 2 + cell)]
    labels = ["A · Bracket Frame", "B · Crest Stack", "C · Heraldic Banner", "D · Minimalist Mark"]
    for (name, _), pos, lbl in zip(variants, positions, labels):
        img = Image.open(OUT / name).convert("RGBA")
        img_r = img.resize((cell, cell), Image.LANCZOS)
        sheet.paste(img_r, pos, img_r)
        sdraw.text((pos[0], pos[1] + cell + 8), lbl, font=label_font, fill=INK)

    sheet_path = OUT / "_comparison-sheet.png"
    sheet.convert("RGB").save(sheet_path, "PNG", optimize=True)
    print(f"  wrote {sheet_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
