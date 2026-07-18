#!/usr/bin/env python3
"""Regenerate Android splash screens from public/icon.png.

Single source of truth: public/icon.png (brand mark).
Produces every density (mdpi → xxxhdpi) for portrait and landscape, plus
the default drawable/splash.png, all on the brand background #1e3a5f.

Usage:  python scripts/generate-android-splash.py
"""
from __future__ import annotations
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "icon.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

BG = (0x1e, 0x3a, 0x5f, 0xff)  # matches ic_launcher_background

# (width, height) per density — Capacitor / Cordova canonical sizes
PORT = {
    "mdpi":    (320, 480),
    "hdpi":    (480, 800),
    "xhdpi":   (720, 1280),
    "xxhdpi":  (960, 1600),
    "xxxhdpi": (1280, 1920),
}
LAND = {k: (h, w) for k, (w, h) in PORT.items()}
DEFAULT = (480, 320)  # drawable/splash.png (legacy default)

# Logo occupies inner 40% of the shorter side
LOGO_FRACTION = 0.40

def fit_logo(logo: Image.Image, box: int) -> Image.Image:
    w, h = logo.size
    scale = box / max(w, h)
    return logo.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

def make_splash(logo: Image.Image, size: tuple[int, int]) -> Image.Image:
    w, h = size
    canvas = Image.new("RGBA", (w, h), BG)
    box = int(min(w, h) * LOGO_FRACTION)
    fitted = fit_logo(logo, box)
    canvas.paste(fitted, ((w - fitted.width) // 2, (h - fitted.height) // 2), fitted)
    return canvas

def main() -> int:
    if not os.path.isfile(SRC):
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        return 1
    logo = Image.open(SRC).convert("RGBA")
    print(f"Source: {SRC}  size={logo.size}")

    written = []
    def emit(path: str, size: tuple[int, int]):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im = make_splash(logo, size)
        im.save(path, format="PNG", optimize=True)
        written.append(path)
        print(f"  wrote {path}  {size}")

    for density, size in PORT.items():
        emit(os.path.join(RES, f"drawable-port-{density}", "splash.png"), size)
    for density, size in LAND.items():
        emit(os.path.join(RES, f"drawable-land-{density}", "splash.png"), size)
    emit(os.path.join(RES, "drawable", "splash.png"), DEFAULT)

    # QA contact sheet (temp)
    thumbs = []
    for density in PORT:
        for orient, table in (("port", PORT), ("land", LAND)):
            p = os.path.join(RES, f"drawable-{orient}-{density}", "splash.png")
            im = Image.open(p)
            im.thumbnail((180, 180))
            thumbs.append((f"{orient} {density}", im))
    cell_w = 200
    cell_h = 220
    cols = 4
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGBA", (cell_w * cols, cell_h * rows), (24, 24, 24, 255))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(thumbs):
        cx = (i % cols) * cell_w
        cy = (i // cols) * cell_h
        sheet.paste(im, (cx + (cell_w - im.width) // 2, cy + 10), im)
        draw.text((cx + 8, cy + cell_h - 18), label, fill=(220, 220, 220, 255))
    qa = "/tmp/android-splash-qa.png"
    sheet.save(qa)
    print(f"QA sheet: {qa}")
    print(f"Done. Wrote {len(written)} files.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
