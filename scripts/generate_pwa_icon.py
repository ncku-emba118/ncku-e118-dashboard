#!/usr/bin/env python3
"""Generate PWA icons for E118 EMBA Dashboard — 勳章版（2026-07-31 改版）。

設計：深酒紅底 ＋ 48 齒金屬外環 ＋ 浮雕奶油圓盤 ＋ NCKU 校徽原色
      ＋ 上弧「NCKU · EMBA」＋ 底部立體緞帶「E118」。

為什麼改版（前一版是 PIL 畫的 Variant C heraldic banner）：
  1. 兩站（EMBA / SLC）的舊 icon 在手機桌面 60px 下幾乎無法分辨——共同輪廓
     「酒紅方塊＋淺色圓＋金條」壓過所有細節差異，校徽雙獅與橫幅小字全糊掉。
     → 改用底色區分：EMBA 酒紅、SLC 學院藍（見 e118-slc 的同名腳本）。
  2. 舊 maskable 版的橫幅兩端超出 Android 安全區（中心 80% 圓）：橫幅橫跨到
     距中心 ±184px，該高度上安全圓只剩約 ±90px，圓形遮罩會切掉字。
     → 本版 maskable 整組 scale(0.78) 收進安全圓。

實作改走 SVG + headless Chrome：PIL 畫不出齒紋環、金屬漸層與浮雕陰影。
校徽自 assets/ncku-emba-logo.png 即時裁切，不另存素材檔。

⚠️ 兩個必須知道的點：
  • 輸出檔名帶 -v2。manifest.json 內容因此改變，Android 的 WebAPK 會偵測到並
    自動更新圖示，既有安裝不必移除重加；iOS 的 apple-touch-icon 在加入主畫面
    當下就快照了，只能移除重加，屬平台限制。舊檔一律保留，避免既有安裝請求
    舊路徑時 404。
  • 改檔名時要同步 3 個地方：public/manifest.json、app/layout.tsx 的 icons
    metadata、public/annual/index.html。

輸出（public/assets/）：
  pwa-icon-192-v2.png / pwa-icon-512-v2.png
  pwa-icon-180-v2.png / pwa-icon-maskable-512-v2.png
"""

import base64
import io
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = ROOT / "public" / "assets"   # ← 舊版誤寫成 ROOT/"assets"，在本 repo 跑不起來
SRC_LOGO = ASSETS / "ncku-emba-logo.png"

# ── 本站識別（SLC 站的同名腳本只有這兩行不同）────────────────────────
BG_ID = "wineBg"
BANNER_TEXT = "E118"

VB = 512
C = VB // 2
MASK_SCALE = 0.78
SUFFIX = "-v2"

OUTPUTS = [
    ("pwa-icon-192", 192, False),
    ("pwa-icon-512", 512, False),
    ("pwa-icon-180", 180, False),
    ("pwa-icon-maskable-512", 512, True),
]


def find_chrome():
    """chrome-headless-shell（puppeteer 快取）優先，退回 Chrome 本體。"""
    cands = sorted(Path.home().glob(
        ".cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell"))
    if cands:
        return str(cands[-1])
    for p in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/usr/bin/chromium", "/usr/bin/google-chrome"):
        if Path(p).exists():
            return p
    sys.exit("找不到 chrome-headless-shell 或 Chrome，無法把 SVG 轉成 PNG")


def shield_b64():
    """從橫式 logo 裁出左側校徽（含雙獅），回傳 (base64 PNG, 尺寸)。"""
    logo = Image.open(SRC_LOGO).convert("RGBA")
    w, h = logo.size
    sh = logo.crop((0, 0, min(h + 40, w), h))
    bbox = sh.getbbox()
    if bbox:
        sh = sh.crop(bbox)
    buf = io.BytesIO()
    sh.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode(), sh.size


def build_svg(px, maskable, b64, shield_size):
    sw, sh_ = shield_size
    shield_w = 180
    shield_h = round(shield_w * sh_ / sw, 1)

    teeth = "".join(
        f'<rect x="{C-3}" y="10" width="6" height="17" rx="2" fill="url(#metal)" '
        f'transform="rotate({i*7.5} {C} {C})"/>' for i in range(48))

    # 底部緞帶刻意用「水平文字」而非下弧 textPath：實測在完整勳章結構下，
    # 下半弧的 textPath 文字會上下顛倒，但把同一條 path 與同一個 text 抽出來
    # 單獨渲染卻完全正常（齒紋環／校徽圖／濾鏡群組／雙弧字逐項二分測試都
    # 無法重現），根因未明。勳章掛銘牌本來也比下弧字合理，故不再追。
    # ⚠️ 上弧字（arcUp）沒有這個問題，維持 textPath。
    by, bh, half = 372, 62, 134
    x0, x1 = C - half, C + half
    banner = f"""
<g filter="url(#softShadow)">
  <path d="M{x0-42} {by+4} L{x0} {by-8} V{by+bh+8} L{x0-42} {by+bh+20} Z" fill="#8F7135"/>
  <path d="M{x1+42} {by+4} L{x1} {by-8} V{by+bh+8} L{x1+42} {by+bh+20} Z" fill="#8F7135"/>
  <rect x="{x0}" y="{by}" width="{half*2}" height="{bh}" rx="4" fill="url(#metal)"/>
  <rect x="{x0+7}" y="{by+7}" width="{half*2-14}" height="{bh-14}" rx="2" fill="none"
        stroke="#6B4E18" stroke-width="1.5" opacity=".5"/>
</g>
<text x="{C+5}" y="{by + bh - 17}" text-anchor="middle" font-family="Georgia,serif"
      font-weight="bold" font-size="40" fill="#4E0E18" letter-spacing="10">{BANNER_TEXT}</text>"""

    figure = f"""
<use href="#teeth"/>
<circle cx="{C}" cy="{C}" r="228" fill="none" stroke="url(#metal)" stroke-width="15"/>
<circle cx="{C}" cy="{C}" r="215" fill="none" stroke="#6B4E18" stroke-width="1.5" opacity=".55"/>
<circle cx="{C}" cy="{C}" r="240" fill="none" stroke="#6B4E18" stroke-width="1.5" opacity=".4"/>
<g filter="url(#emboss)">
  <circle cx="{C}" cy="{C}" r="140" fill="url(#plate)"/>
  <circle cx="{C}" cy="{C}" r="140" fill="none" stroke="url(#metal)" stroke-width="7"/>
</g>
<image href="data:image/png;base64,{b64}" x="{C-shield_w//2}" y="{232-shield_h/2}"
       width="{shield_w}" height="{shield_h}"/>
<text font-family="Georgia,serif" font-weight="bold" font-size="38"
      fill="url(#metalSoft)" letter-spacing="9">
  <textPath href="#arcUp" startOffset="50%" text-anchor="middle">NCKU · EMBA</textPath></text>
{banner}"""

    if maskable:
        figure = (f'<g transform="translate({C},{C}) scale({MASK_SCALE}) '
                  f'translate({-C},{-C})">{figure}</g>')

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;padding:0}}svg{{display:block;width:{px}px;height:{px}px}}
</style></head><body>
<svg viewBox="0 0 {VB} {VB}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F7E9C4"/><stop offset=".22" stop-color="#D8B872"/>
    <stop offset=".44" stop-color="#93762F"/><stop offset=".62" stop-color="#EBD49A"/>
    <stop offset=".82" stop-color="#B4934C"/><stop offset="1" stop-color="#E3CB92"/>
  </linearGradient>
  <linearGradient id="metalSoft" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F2DFAE"/><stop offset="1" stop-color="#B08F4A"/>
  </linearGradient>
  <radialGradient id="wineBg" cx="36%" cy="24%" r="92%">
    <stop offset="0" stop-color="#A62B3D"/><stop offset="1" stop-color="#4E0E18"/>
  </radialGradient>
  <radialGradient id="navyBg" cx="36%" cy="24%" r="92%">
    <stop offset="0" stop-color="#1F3A5F"/><stop offset="1" stop-color="#0C1A2E"/>
  </radialGradient>
  <radialGradient id="plate" cx="42%" cy="34%" r="80%">
    <stop offset="0" stop-color="#FFFDF9"/><stop offset="1" stop-color="#EDE4D6"/>
  </radialGradient>
  <filter id="emboss" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#160508" flood-opacity=".45"/>
  </filter>
  <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".3"/>
  </filter>
  <path id="arcUp" d="M 74 256 A 182 182 0 0 1 438 256" fill="none"/>
  <g id="teeth">{teeth}</g>
</defs>
<rect width="{VB}" height="{VB}" fill="url(#{BG_ID})"/>
{figure}
</svg></body></html>"""


def main():
    if not SRC_LOGO.exists():
        raise SystemExit(f"缺少來源標誌：{SRC_LOGO}")
    ASSETS.mkdir(parents=True, exist_ok=True)
    chrome = find_chrome()
    b64, size = shield_b64()

    with tempfile.TemporaryDirectory() as td:
        for stem, px, maskable in OUTPUTS:
            html = Path(td) / f"{stem}.html"
            html.write_text(build_svg(px, maskable, b64, size), encoding="utf-8")
            dest = ASSETS / f"{stem}{SUFFIX}.png"
            subprocess.run([chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
                            "--force-device-scale-factor=1", f"--window-size={px},{px}",
                            f"--screenshot={dest}", f"file://{html}"], capture_output=True)
            print(f"  wrote {dest.relative_to(ROOT)}  ({px}x{px}"
                  f"{', maskable' if maskable else ''})")


if __name__ == "__main__":
    main()
