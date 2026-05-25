#!/usr/bin/env python3
"""
Generate PWA icons for E118 Dashboard.

Style: Academic badge — wine-red circular background + NCKU lion shield
(cropped from existing logo) centered upper + gold "E118" text lower
+ fine gold inner ring.

Output sizes:
  - assets/pwa-icon-192.png        (Android, favicon high-DPI)
  - assets/pwa-icon-512.png        (Android splash, PWA install)
  - assets/pwa-icon-180.png        (iOS apple-touch-icon)
  - assets/pwa-icon-maskable-512.png  (Android adaptive icon)
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
SRC_LOGO = ASSETS / "ncku-emba-logo.png"

WINE = (139, 31, 47, 255)        # --ncku-wine
WINE_DEEP = (107, 22, 34, 255)   # --ncku-wine-deep
GOLD = (201, 169, 97, 255)       # --ncku-gold
GOLD_SOFT = (224, 200, 150, 255) # --ncku-gold-soft
CREAM = (250, 247, 242, 255)


def find_font(size):
    """Find a serif TC font, fallback to system default."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/Library/Fonts/Songti.ttc",
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
    """Crop the left-side NCKU shield from the horizontal logo.

    The logo is 718x216 with the shield (lions + NCKU crest) occupying
    approximately the first 230px. We crop a square that captures it,
    then trim to non-transparent bounding box for tight framing.
    """
    logo = Image.open(logo_path).convert("RGBA")
    w, h = logo.size  # 718 x 216
    # Crop the left square region — shield is roughly within first ~230px
    shield = logo.crop((0, 0, min(h + 30, w), h))
    # Trim transparent borders
    bbox = shield.getbbox()
    if bbox:
        shield = shield.crop(bbox)
    return shield


def make_circle_mask(size):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def make_icon(size, *, maskable=False):
    """Compose an academic badge icon at the given square size.

    maskable=True: extend wine background to full canvas (no rounding),
    keep safe zone inner 80% for the shield + text per Android maskable spec.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    if maskable:
        # Full bleed wine background — safe zone is inner 80%
        draw.rectangle((0, 0, size, size), fill=WINE)
        # Subtle radial darkening at edges via a vignette ring (drawn as deeper wine)
        # Skipped to keep maskable clean; Android adds its own shape mask.
        safe = int(size * 0.10)  # margin per side = 10% (inner 80%)
    else:
        # Circular badge
        # Outer wine circle
        draw.ellipse((0, 0, size - 1, size - 1), fill=WINE)
        # Fine gold inner ring
        ring_inset = max(2, int(size * 0.04))
        ring_width = max(1, int(size * 0.008))
        draw.ellipse(
            (ring_inset, ring_inset, size - 1 - ring_inset, size - 1 - ring_inset),
            outline=GOLD,
            width=ring_width,
        )
        # Inner wine deep area (subtle layered look)
        inner_inset = ring_inset + ring_width + max(2, int(size * 0.015))
        # We keep inner same wine — no need to refill; just leave the ring.
        safe = int(size * 0.14)

    # Composite shield ── upper-center, ~52% of icon width
    shield = crop_shield(SRC_LOGO)
    target_w = int((size - safe * 2) * 0.62)
    ratio = target_w / shield.width
    target_h = int(shield.height * ratio)
    shield_resized = shield.resize((target_w, target_h), Image.LANCZOS)

    # Color-replace black/dark shield strokes to gold-soft so they read on wine
    # (Actually NCKU shield is already wine-red; we leave it but add a cream
    # circular plate behind it for contrast.)
    plate_diameter = int(max(target_w, target_h) * 1.18)
    plate = Image.new("RGBA", (plate_diameter, plate_diameter), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(plate)
    pdraw.ellipse((0, 0, plate_diameter - 1, plate_diameter - 1), fill=CREAM)
    # Gold ring around the cream plate
    plate_ring = max(1, int(plate_diameter * 0.012))
    pdraw.ellipse(
        (0, 0, plate_diameter - 1, plate_diameter - 1),
        outline=GOLD,
        width=plate_ring,
    )

    # Position: vertically biased upward to leave room for E118 text
    cx = size // 2
    plate_cy = int(size * 0.38)
    plate_x = cx - plate_diameter // 2
    plate_y = plate_cy - plate_diameter // 2
    canvas.alpha_composite(plate, (plate_x, plate_y))

    # Center shield on plate
    shield_x = cx - target_w // 2
    shield_y = plate_cy - target_h // 2
    canvas.alpha_composite(shield_resized, (shield_x, shield_y))

    # Gold "E118" text below — large, centered, no competing subtitle
    font_size = int(size * 0.26)
    font = find_font(font_size)
    text = "E118"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = cx - tw // 2 - bbox[0]
    ty = int(size * 0.78) - th // 2 - bbox[1]
    # Slight shadow for depth
    draw.text((tx + 1, ty + 2), text, font=font, fill=(0, 0, 0, 80))
    draw.text((tx, ty), text, font=font, fill=GOLD)

    # Tiny "CLASS OF 2026" eyebrow under E118 (large icons only)
    if size >= 192 and not maskable:
        eyebrow_size = max(9, int(size * 0.038))
        eyebrow_font = find_font(eyebrow_size)
        ebr = "CLASS  OF  2026"
        ebr_bbox = draw.textbbox((0, 0), ebr, font=eyebrow_font)
        ebw = ebr_bbox[2] - ebr_bbox[0]
        ebh = ebr_bbox[3] - ebr_bbox[1]
        ex = cx - ebw // 2 - ebr_bbox[0]
        ey = int(size * 0.91) - ebh // 2 - ebr_bbox[1]
        draw.text((ex, ey), ebr, font=eyebrow_font, fill=GOLD_SOFT)

    # For non-maskable: apply circle mask to ensure clean edges
    if not maskable:
        mask = make_circle_mask(size)
        masked = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        masked.paste(canvas, (0, 0), mask)
        return masked

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
