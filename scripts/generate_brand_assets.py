#!/usr/bin/env python3
"""Render E118's white-base NCKU EMBA PWA and Open Graph assets.

版面是一張白底名牌：上半白區放官方 NCKU EMBA logo，金線分隔，
下半酒紅區放班級識別 E118。

v6（2026-09-21）：改用**官方英文版**方形 logo（校徽＋E·M·B·A＋校名），
並拿掉原本 E118 底下的 CLASS OF 2026。原因是 v5 的中文書法版在手機桌面
60px 下「國立成功大學」整片糊成墨團，英文版校徽的雙獅輪廓在小尺寸反而
站得住。副標拿掉後空間全留給 logo 與 E118，兩者都更清楚。
logo 素材取自雲端硬碟 `EMBA 118 SLC/NCKU LOGO/成大EMBA-Logo英文.png`
（官方原件，未經改造），複製進 repo 為 ncku-emba-logo-en.png。

版面由 PLATE_H / LOGO_W / CLASS_FONT 三個常數推導，其餘位置自動配平：
  • logo 在白名牌內（扣掉金線帶）等比置中
  • E118 在酒紅區內水平垂直皆置中
調大 PLATE_H、調小 CLASS_FONT 就是把空間讓給 logo，反之亦然。

⚠️ 換 VERSION 時必須同步 4 個引用點，否則等於白改——Android WebAPK 靠
manifest 內容變動才會更新圖示，iOS 的 apple-touch-icon 則是加入主畫面
當下就快照，只能移除重加（平台限制）：
  1. public/manifest.json（4 處）
  2. app/layout.tsx 的 icons metadata（3 處）
  3. public/annual/index.html 的 favicon 區塊（3 處）
  4. public/sw.js 的推播 icon / badge（2 處）
舊版檔案一律保留，避免既有安裝請求舊路徑時 404。

og-thumb 版面未隨 icon 改動，仍用中文橫式 logo、維持 v2 檔名。
"""

import base64
import io
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = PUBLIC / "assets"
LOGO_OG = ASSETS / "ncku-emba-logo.png"        # 中文橫式，只給 og-thumb 用
LOGO_ICON = ASSETS / "ncku-emba-logo-en.png"   # 官方英文方形，icon 用

VERSION = "v6"
OG_OUTPUT = "og-thumb-v2.png"

# ── 版面比例：要微調只動這三行 ──────────────────────────────────
PLATE_H = 296         # 白名牌高度（v5 為 273）
LOGO_W = 232          # logo 寬度
CLASS_FONT = 104      # E118 字級（v5 為 96、更早的 v4 為 122）

PLATE_TOP = 50
PLATE_X, PLATE_W = 58, 396
BOTTOM = 462
GOLD_BAND = 22        # 名牌底部留給金線的高度
WINE, GOLD, CREAM = "#8B1F2F", "#C9A961", "#FFF9ED"

ICON_SIZES = ((180, False), (192, False), (512, False), (512, True))


def find_chrome() -> str:
    cached = sorted(Path.home().glob(
        ".cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell"
    ))
    if cached:
        return str(cached[-1])
    for candidate in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
    ):
        if Path(candidate).exists():
            return candidate
    raise RuntimeError("找不到 Chrome 或 chrome-headless-shell")


def logo_data_url(path: Path, trim: bool = False):
    """回傳 (data URL, 尺寸)。trim=True 會先去掉四周透明留白，版面才好算。"""
    if not path.exists():
        raise RuntimeError(f"缺少 Logo 素材：{path}")
    if not trim:
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        with Image.open(path) as im:
            return f"data:image/png;base64,{data}", im.size
    with Image.open(path) as raw:
        image = raw.convert("RGBA")
    box = image.getbbox()
    if box:
        image = image.crop(box)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    data = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{data}", image.size


def wrap(svg: str, width: int, height: int) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}
      svg{{display:block;width:{width}px;height:{height}px}}
    </style></head><body>{svg}</body></html>"""


def icon_svg(maskable: bool, logo: str, logo_size) -> str:
    logo_h = round(LOGO_W * logo_size[1] / logo_size[0], 1)
    plate_bottom = PLATE_TOP + PLATE_H
    red_h = BOTTOM - plate_bottom
    logo_x = round((512 - LOGO_W) / 2)
    logo_y = round(PLATE_TOP + (PLATE_H - GOLD_BAND - logo_h) / 2)
    gold_y = plate_bottom - 20
    text_y = round(plate_bottom + red_h / 2 + CLASS_FONT * 0.7 / 2)
    tracking = round(-8 * CLASS_FONT / 122, 1)   # v4 的 -8 等比縮放

    scale = 0.78 if maskable else 1
    group = f"""
      <g transform="translate(256 256) scale({scale}) translate(-256 -256)">
        <rect width="512" height="512" fill="#FAF7F2"/>
        <rect x="{PLATE_X}" y="{PLATE_TOP}" width="{PLATE_W}" height="{PLATE_H}" rx="5" fill="#FFFFFF"/>
        <image href="{logo}" x="{logo_x}" y="{logo_y}" width="{LOGO_W}" height="{logo_h}" preserveAspectRatio="xMidYMid meet"/>
        <line x1="88" y1="{gold_y}" x2="424" y2="{gold_y}" stroke="{GOLD}" stroke-width="3"/>
        <rect x="{PLATE_X}" y="{plate_bottom}" width="{PLATE_W}" height="{red_h}" fill="{WINE}"/>
        <text x="256" y="{text_y}" fill="{CREAM}" font-family="Georgia,serif" font-size="{CLASS_FONT}" font-weight="600" letter-spacing="{tracking}" text-anchor="middle">E118</text>
      </g>
    """
    return f"""<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#FAF7F2"/>{group}</svg>"""


def og_svg(logo: str) -> str:
    return f"""<svg viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#FAF7F2"/>
      <rect width="1200" height="236" fill="#FFFFFF"/>
      <image href="{logo}" x="76" y="58" width="432" height="130" preserveAspectRatio="xMinYMid meet"/>
      <line x1="76" y1="235" x2="1124" y2="235" stroke="{GOLD}" stroke-width="3"/>
      <text x="76" y="353" fill="{WINE}" font-family="'Noto Serif TC',serif" font-size="51" font-weight="600" letter-spacing="5">E118 班級控制面板</text>
      <text x="82" y="407" fill="#8A7F73" font-family="Arial,sans-serif" font-size="21" letter-spacing="3">NCKU EMBA · CLASS OF 2026</text>
      <text x="74" y="510" fill="{WINE}" font-family="Georgia,serif" font-size="45">課程、研究、活動與班務資源</text>
      <text x="79" y="553" fill="#8A7F73" font-family="Arial,sans-serif" font-size="20" letter-spacing="2">emba.aqualux.dev</text>
      <text x="812" y="585" fill="#E8DECC" font-family="Georgia,serif" font-size="264" letter-spacing="-26">118</text>
    </svg>"""


def render(chrome: str, html: str, width: int, height: int, destination: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "asset.html"
        source.write_text(html, encoding="utf-8")
        command = [
            chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1", f"--window-size={width},{height}",
            f"--screenshot={destination}", f"file://{source}",
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Chrome 無法輸出 PNG")


def main() -> None:
    chrome = find_chrome()
    icon_logo, icon_size = logo_data_url(LOGO_ICON, trim=True)
    for size, maskable in ICON_SIZES:
        stem = f"pwa-icon-maskable-{size}" if maskable else f"pwa-icon-{size}"
        destination = ASSETS / f"{stem}-{VERSION}.png"
        render(chrome, wrap(icon_svg(maskable, icon_logo, icon_size), size, size),
               size, size, destination)
        print(f"wrote {destination.relative_to(ROOT)}")
    og_logo, _ = logo_data_url(LOGO_OG)
    og_destination = PUBLIC / OG_OUTPUT
    render(chrome, wrap(og_svg(og_logo), 1200, 630), 1200, 630, og_destination)
    print(f"wrote {og_destination.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        sys.exit(str(error))
