#!/usr/bin/env python3
"""
Mock an iPhone home screen with the 4 logo variants placed as app icons,
to preview how each looks at actual iOS scale and with iOS squircle corner.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "assets"
VARIANTS = ASSETS / "_variants"
OUT = VARIANTS

# iPhone 14 Pro screen ratio (1179x2556 native, scale down)
# Use 2x retina canvas
SCREEN_W = 780
SCREEN_H = 1688
ICON_RADIUS_RATIO = 0.225  # iOS squircle approx


def find_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Helvetica Neue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def ios_round_mask(size, radius_ratio=ICON_RADIUS_RATIO):
    r = int(size * radius_ratio)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    return mask


def make_wallpaper(w, h):
    """Subtle gradient wallpaper (light beige to dusty rose, EMBA-friendly)."""
    img = Image.new("RGB", (w, h), (40, 35, 55))
    px = img.load()
    for y in range(h):
        t = y / h
        # Top: deep navy → bottom: soft burgundy
        r = int(28 + (76 - 28) * t)
        g = int(30 + (40 - 30) * t)
        b = int(48 + (52 - 48) * t)
        for x in range(w):
            # Add subtle horizontal vignette
            xt = abs(x - w / 2) / (w / 2)
            shade = 1 - xt * 0.10
            px[x, y] = (int(r * shade), int(g * shade), int(b * shade))
    img = img.filter(ImageFilter.GaussianBlur(2))
    return img


def draw_status_bar(canvas, draw, w):
    """iOS status bar — time left, signal/wifi/battery right."""
    font = find_font(28, bold=True)
    time_text = "9:41"
    draw.text((38, 32), time_text, font=font, fill=(255, 255, 255, 255))
    # Right side icons (simple shapes)
    # Signal bars
    bx = w - 220
    by = 38
    for i, h in enumerate([10, 14, 18, 22]):
        draw.rounded_rectangle((bx + i * 8, by + (22 - h), bx + i * 8 + 5, by + 22),
                               radius=1, fill=(255, 255, 255, 255))
    # 5G label
    draw.text((bx + 50, 32), "5G", font=find_font(22, bold=True), fill=(255, 255, 255, 255))
    # Battery
    bat_x = w - 88
    draw.rounded_rectangle((bat_x, 36, bat_x + 50, 56), radius=4,
                           outline=(255, 255, 255, 255), width=2)
    draw.rectangle((bat_x + 52, 42, bat_x + 56, 50), fill=(255, 255, 255, 255))
    draw.rounded_rectangle((bat_x + 3, 39, bat_x + 44, 53), radius=2, fill=(255, 255, 255, 255))


def place_app_icon(canvas, icon_path, x, y, size, label, label_font, badge=None):
    """Place an icon with iOS squircle rounding + label below."""
    icon = Image.open(icon_path).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = ios_round_mask(size)
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(icon, (0, 0), mask)
    # Drop shadow
    shadow = Image.new("RGBA", (size + 20, size + 20), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    r = int(size * ICON_RADIUS_RATIO)
    sd.rounded_rectangle((10, 12, size + 10, size + 12), radius=r, fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    canvas.alpha_composite(shadow, (x - 10, y - 10))
    canvas.alpha_composite(rounded, (x, y))

    # Optional badge label above icon
    if badge:
        bf = find_font(18, bold=True)
        bw = bf.getbbox(badge)[2]
        bx = x + size // 2 - bw // 2
        by = y - 30
        canvas_draw = ImageDraw.Draw(canvas)
        canvas_draw.text((bx, by), badge, font=bf, fill=(220, 200, 130, 255))

    # Label below
    draw = ImageDraw.Draw(canvas)
    label_w = label_font.getbbox(label)[2]
    lx = x + size // 2 - label_w // 2
    ly = y + size + 14
    # Subtle text shadow for legibility
    draw.text((lx + 1, ly + 1), label, font=label_font, fill=(0, 0, 0, 160))
    draw.text((lx, ly), label, font=label_font, fill=(255, 255, 255, 240))


def make_homescreen(variant_files, output_path, title):
    """Create one home screen with 4 variant icons in a row, labelled A/B/C/D."""
    bg = make_wallpaper(SCREEN_W, SCREEN_H).convert("RGBA")
    canvas = bg.copy()
    draw = ImageDraw.Draw(canvas)

    # Status bar
    draw_status_bar(canvas, draw, SCREEN_W)

    # Title at top
    title_font = find_font(36, bold=True)
    tw = title_font.getbbox(title)[2]
    draw.text((SCREEN_W // 2 - tw // 2 + 1, 130), title, font=title_font, fill=(0, 0, 0, 150))
    draw.text((SCREEN_W // 2 - tw // 2, 130), title, font=title_font, fill=(255, 255, 255, 255))

    sub_font = find_font(22)
    sub = "iOS Home Screen Preview · 120px @ retina"
    sw = sub_font.getbbox(sub)[2]
    draw.text((SCREEN_W // 2 - sw // 2, 180), sub, font=sub_font, fill=(255, 255, 255, 180))

    # Row 1: 4 E118 variants
    icon_size = 144  # ~ iOS app icon at 2x
    cols = 4
    gap = (SCREEN_W - icon_size * cols) // (cols + 1)
    y1 = 280
    label_font = find_font(22)
    badges = ["A", "B", "C", "D"]
    for i, (vfile, lbl) in enumerate(variant_files):
        x = gap + i * (icon_size + gap)
        place_app_icon(canvas, vfile, x, y1, icon_size, lbl, label_font, badge=badges[i])

    # Row 2-4: realistic app placeholders (small generic apps for context)
    placeholder_colors = [
        (45, 130, 245),   # blue
        (255, 105, 70),    # orange
        (90, 200, 140),    # green
        (180, 90, 200),    # purple
        (50, 50, 70),      # grey
        (240, 200, 90),    # yellow
        (220, 70, 100),    # pink
        (60, 180, 220),    # cyan
    ]
    placeholder_names = [
        "Messages", "Mail", "Safari", "Photos",
        "Calendar", "Notes", "Music", "Maps",
        "Settings", "App Store", "Camera", "Maps",
    ]
    y2_rows = [y1 + icon_size + 100, y1 + 2 * (icon_size + 100), y1 + 3 * (icon_size + 100)]
    idx = 0
    for ry in y2_rows:
        for i in range(cols):
            x = gap + i * (icon_size + gap)
            color = placeholder_colors[idx % len(placeholder_colors)]
            # Rounded rect icon
            ph = Image.new("RGBA", (icon_size, icon_size), color + (255,))
            ph_mask = ios_round_mask(icon_size)
            ph_rounded = Image.new("RGBA", (icon_size, icon_size), (0, 0, 0, 0))
            ph_rounded.paste(ph, (0, 0), ph_mask)
            canvas.alpha_composite(ph_rounded, (x, ry))
            # Label
            label = placeholder_names[idx % len(placeholder_names)]
            label_w = label_font.getbbox(label)[2]
            draw.text((x + icon_size // 2 - label_w // 2 + 1, ry + icon_size + 15),
                      label, font=label_font, fill=(0, 0, 0, 160))
            draw.text((x + icon_size // 2 - label_w // 2, ry + icon_size + 14),
                      label, font=label_font, fill=(255, 255, 255, 240))
            idx += 1

    # iOS dock at bottom (semi-transparent rounded rect)
    dock_h = 200
    dock_top = SCREEN_H - dock_h - 60
    dock_pad = 24
    dock_overlay = Image.new("RGBA", (SCREEN_W - dock_pad * 2, dock_h), (255, 255, 255, 30))
    dock_mask = Image.new("L", (SCREEN_W - dock_pad * 2, dock_h), 0)
    ImageDraw.Draw(dock_mask).rounded_rectangle(
        (0, 0, SCREEN_W - dock_pad * 2 - 1, dock_h - 1), radius=44, fill=255
    )
    dock_rounded = Image.new("RGBA", (SCREEN_W - dock_pad * 2, dock_h), (0, 0, 0, 0))
    dock_rounded.paste(dock_overlay, (0, 0), dock_mask)
    canvas.alpha_composite(dock_rounded, (dock_pad, dock_top))

    # 4 dock icons (placeholders for context)
    dock_icon_size = 130
    dock_cols = 4
    dock_gap = (SCREEN_W - dock_pad * 2 - dock_icon_size * dock_cols) // (dock_cols + 1)
    dock_y = dock_top + (dock_h - dock_icon_size) // 2
    dock_colors = [(80, 110, 240), (60, 200, 90), (240, 140, 60), (200, 80, 140)]
    for i in range(dock_cols):
        x = dock_pad + dock_gap + i * (dock_icon_size + dock_gap)
        ph = Image.new("RGBA", (dock_icon_size, dock_icon_size), dock_colors[i] + (255,))
        ph_mask = ios_round_mask(dock_icon_size)
        ph_rounded = Image.new("RGBA", (dock_icon_size, dock_icon_size), (0, 0, 0, 0))
        ph_rounded.paste(ph, (0, 0), ph_mask)
        canvas.alpha_composite(ph_rounded, (x, dock_y))

    # Page indicator dots
    pi_y = dock_top - 24
    for i, active in enumerate([True, False, False]):
        cx = SCREEN_W // 2 - 16 + i * 16
        color = (255, 255, 255, 230) if active else (255, 255, 255, 100)
        draw.ellipse((cx, pi_y, cx + 8, pi_y + 8), fill=color)

    # Round the screen corners (apply to canvas itself)
    bezel_radius = 60
    bezel_pad = 12
    screen_mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(screen_mask).rounded_rectangle(
        (0, 0, canvas.size[0] - 1, canvas.size[1] - 1),
        radius=bezel_radius, fill=255
    )
    rounded_canvas = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    rounded_canvas.paste(canvas, (0, 0), screen_mask)

    # Build iPhone bezel
    frame_w = canvas.size[0] + bezel_pad * 2
    frame_h = canvas.size[1] + bezel_pad * 2
    base = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    base_draw = ImageDraw.Draw(base)
    base_draw.rounded_rectangle(
        (0, 0, frame_w - 1, frame_h - 1),
        radius=bezel_radius + bezel_pad, fill=(20, 20, 20, 255)
    )
    base.alpha_composite(rounded_canvas, (bezel_pad, bezel_pad))

    # Dynamic island
    island_w = 220
    island_h = 56
    island_x = (frame_w - island_w) // 2
    island_y = bezel_pad + 20
    ImageDraw.Draw(base).rounded_rectangle(
        (island_x, island_y, island_x + island_w, island_y + island_h),
        radius=island_h // 2, fill=(0, 0, 0, 255)
    )

    base.convert("RGB").save(output_path, "PNG", optimize=True)
    print(f"  wrote {output_path.relative_to(ROOT)}")


def main():
    variants = [
        (VARIANTS / "variant-A-bracket-frame.png", "E118"),
        (VARIANTS / "variant-B-crest-stack.png", "E118"),
        (VARIANTS / "variant-C-heraldic-banner.png", "E118"),
        (VARIANTS / "variant-D-minimalist-mark.png", "E118"),
    ]
    make_homescreen(variants, VARIANTS / "_iphone-homescreen-mock.png",
                    "E118 PWA Icon · iOS Mockup")


if __name__ == "__main__":
    main()
