#!/usr/bin/env python3
"""Regenerate Android launcher icons from public/icon.png.

Single source of truth: public/icon.png (512x512 RGBA brand mark).
Outputs every density of ic_launcher.png, ic_launcher_round.png and
ic_launcher_foreground.png under android/app/src/main/res/mipmap-*.

Usage:  python scripts/generate-android-icons.py
"""
from __future__ import annotations
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "icon.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# Brand background (matches values/ic_launcher_background.xml -> #1e3a5f)
BG = (0x1e, 0x3a, 0x5f, 0xff)

# Legacy launcher sizes per density
LEGACY = {
    "mdpi":    48,
    "hdpi":    72,
    "xhdpi":   96,
    "xxhdpi":  144,
    "xxxhdpi": 192,
}
# Adaptive foreground full-canvas size = legacy * 2.25 (108dp at mdpi)
FG = {k: int(v * 2.25) for k, v in LEGACY.items()}
# Logo occupies inner 66% safe-zone of foreground canvas
SAFE_ZONE = 0.66

def fit_logo(logo: Image.Image, box: int) -> Image.Image:
    """Fit logo into a square of `box` px keeping aspect ratio."""
    w, h = logo.size
    scale = box / max(w, h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    return logo.resize((nw, nh), Image.LANCZOS)

def square_legacy(logo: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    inner = int(size * 0.78)  # small padding around logo
    fitted = fit_logo(logo, inner)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas

def round_legacy(logo: Image.Image, size: int) -> Image.Image:
    base = square_legacy(logo, size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out

def adaptive_foreground(logo: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * SAFE_ZONE)
    fitted = fit_logo(logo, inner)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas

def main() -> int:
    if not os.path.isfile(SRC):
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        return 1
    logo = Image.open(SRC).convert("RGBA")
    print(f"Source: {SRC}  size={logo.size}")

    written = []
    for density, sz in LEGACY.items():
        out_dir = os.path.join(RES, f"mipmap-{density}")
        os.makedirs(out_dir, exist_ok=True)
        sq = square_legacy(logo, sz)
        rd = round_legacy(logo, sz)
        fg = adaptive_foreground(logo, FG[density])
        for name, im in (("ic_launcher.png", sq),
                         ("ic_launcher_round.png", rd),
                         ("ic_launcher_foreground.png", fg)):
            p = os.path.join(out_dir, name)
            im.save(p, format="PNG", optimize=True)
            written.append(p)
            print(f"  wrote {p}  {im.size}")

    # QA contact sheet (temp)
    sheet_w = sum(LEGACY.values()) * 3 + 80
    sheet_h = max(LEGACY.values()) + 40
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (32, 32, 32, 255))
    x = 10
    for density, sz in LEGACY.items():
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            im = Image.open(os.path.join(RES, f"mipmap-{density}", name))
            sheet.paste(im, (x, 20), im)
            x += im.width + 6
        x += 10
    qa = "/tmp/android-icons-qa.png"
    sheet.save(qa)
    print(f"QA sheet: {qa}")
    print(f"Done. Wrote {len(written)} files.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
