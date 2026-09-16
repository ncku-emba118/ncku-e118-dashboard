#!/usr/bin/env python3
"""Render E118's white-base NCKU EMBA PWA and Open Graph assets.

The v4 mark uses the official horizontal NCKU EMBA logo unchanged on a white
nameplate. E118 remains the large class identifier, so the icon stays legible
on a phone home screen. Existing versioned assets are intentionally retained.
"""

import base64
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ASSETS = PUBLIC / "assets"
LOGO = ASSETS / "ncku-emba-logo.png"
ICON_OUTPUTS = (
    ("pwa-icon-180-v4.png", 180, False),
    ("pwa-icon-192-v4.png", 192, False),
    ("pwa-icon-512-v4.png", 512, False),
    ("pwa-icon-maskable-512-v4.png", 512, True),
)


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


def logo_data_url() -> str:
    if not LOGO.exists():
        raise RuntimeError(f"缺少正式 NCKU EMBA Logo：{LOGO}")
    data = base64.b64encode(LOGO.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


def wrap(svg: str, width: int, height: int) -> str:
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><style>
      html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}
      svg{{display:block;width:{width}px;height:{height}px}}
    </style></head><body>{svg}</body></html>"""


def icon_svg(size: int, maskable: bool, logo: str) -> str:
    scale = 0.78 if maskable else 1
    group = f"""
      <g transform=\"translate(256 256) scale({scale}) translate(-256 -256)\">
        <rect width=\"512\" height=\"512\" fill=\"#FAF7F2\"/>
        <rect x=\"58\" y=\"50\" width=\"396\" height=\"232\" rx=\"5\" fill=\"#FFFFFF\"/>
        <image href=\"{logo}\" x=\"92\" y=\"91\" width=\"328\" height=\"99\" preserveAspectRatio=\"xMidYMid meet\"/>
        <line x1=\"88\" y1=\"244\" x2=\"424\" y2=\"244\" stroke=\"#C9A961\" stroke-width=\"3\"/>
        <rect x=\"58\" y=\"282\" width=\"396\" height=\"180\" rx=\"0\" fill=\"#8B1F2F\"/>
        <text x=\"84\" y=\"395\" fill=\"#FFF9ED\" font-family=\"Georgia,serif\" font-size=\"122\" font-weight=\"600\" letter-spacing=\"-8\">E118</text>
        <text x=\"92\" y=\"426\" fill=\"#E6CD99\" font-family=\"Arial,sans-serif\" font-size=\"15\" font-weight=\"700\" letter-spacing=\"4\">CLASS OF 2026</text>
      </g>
    """
    return f"""<svg viewBox=\"0 0 512 512\" xmlns=\"http://www.w3.org/2000/svg\">
      <rect width=\"512\" height=\"512\" fill=\"#FAF7F2\"/>{group}</svg>"""


def og_svg(logo: str) -> str:
    return f"""<svg viewBox=\"0 0 1200 630\" xmlns=\"http://www.w3.org/2000/svg\">
      <rect width=\"1200\" height=\"630\" fill=\"#FAF7F2\"/>
      <rect width=\"1200\" height=\"236\" fill=\"#FFFFFF\"/>
      <image href=\"{logo}\" x=\"76\" y=\"58\" width=\"432\" height=\"130\" preserveAspectRatio=\"xMinYMid meet\"/>
      <line x1=\"76\" y1=\"235\" x2=\"1124\" y2=\"235\" stroke=\"#C9A961\" stroke-width=\"3\"/>
      <text x=\"76\" y=\"353\" fill=\"#8B1F2F\" font-family=\"'Noto Serif TC',serif\" font-size=\"51\" font-weight=\"600\" letter-spacing=\"5\">E118 班級控制面板</text>
      <text x=\"82\" y=\"407\" fill=\"#8A7F73\" font-family=\"Arial,sans-serif\" font-size=\"21\" letter-spacing=\"3\">NCKU EMBA · CLASS OF 2026</text>
      <text x=\"74\" y=\"510\" fill=\"#8B1F2F\" font-family=\"Georgia,serif\" font-size=\"45\">課程、研究、活動與班務資源</text>
      <text x=\"79\" y=\"553\" fill=\"#8A7F73\" font-family=\"Arial,sans-serif\" font-size=\"20\" letter-spacing=\"2\">emba.aqualux.dev</text>
      <text x=\"812\" y=\"585\" fill=\"#E8DECC\" font-family=\"Georgia,serif\" font-size=\"264\" letter-spacing=\"-26\">118</text>
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
    logo = logo_data_url()
    for filename, size, maskable in ICON_OUTPUTS:
        destination = ASSETS / filename
        render(chrome, wrap(icon_svg(size, maskable, logo), size, size), size, size, destination)
        print(f"wrote {destination.relative_to(ROOT)}")
    og_destination = PUBLIC / "og-thumb-v2.png"
    render(chrome, wrap(og_svg(logo), 1200, 630), 1200, 630, og_destination)
    print(f"wrote {og_destination.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        sys.exit(str(error))
