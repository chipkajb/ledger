#!/usr/bin/env python3
"""Regenerate public/ and app icon PNGs from the source logo at repo root (logo.png).

Crops empty margin, pads to a square on the app theme background, then writes
UI and PWA sizes. Run from repo root: python3 scripts/build_logo_assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SOURCE = REPO / "logo.png"
THEME_BG = (9, 9, 11)  # #09090b — matches globals / manifest theme
BRIGHT_THRESHOLD = 45
MARGIN = 16
MASTER_SIZE = 512


def content_bbox(im: Image.Image, threshold: int) -> tuple[int, int, int, int]:
    """Bounding box of pixels brighter than threshold (assumes dark surround)."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    min_x, min_y = w, h
    max_x, max_y = 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, _a = pixels[x, y]
            if max(r, g, b) > threshold:
                found = True
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if not found:
        return 0, 0, w - 1, h - 1
    return min_x, min_y, max_x, max_y


def clamp_crop(
    left: int, top: int, right: int, bottom: int, w: int, h: int
) -> tuple[int, int, int, int]:
    left = max(0, left)
    top = max(0, top)
    right = min(w - 1, right)
    bottom = min(h - 1, bottom)
    return left, top, right + 1, bottom + 1


def to_square_on_theme(cropped: Image.Image) -> Image.Image:
    w, h = cropped.size
    side = max(w, h)
    out = Image.new("RGBA", (side, side), THEME_BG + (255,))
    ox = (side - w) // 2
    oy = (side - h) // 2
    out.paste(cropped, (ox, oy), cropped if cropped.mode == "RGBA" else None)
    return out


def main() -> int:
    if not SOURCE.is_file():
        print(f"missing source: {SOURCE}", file=sys.stderr)
        return 1

    im = Image.open(SOURCE).convert("RGBA")
    w, h = im.size
    min_x, min_y, max_x, max_y = content_bbox(im, BRIGHT_THRESHOLD)
    left = min_x - MARGIN
    top = min_y - MARGIN
    right = max_x + MARGIN
    bottom = max_y + MARGIN
    box = clamp_crop(left, top, right, bottom, w, h)
    cropped = im.crop(box)
    squared = to_square_on_theme(cropped)
    master = squared.resize((MASTER_SIZE, MASTER_SIZE), Image.Resampling.LANCZOS)

    public = REPO / "public"
    public.mkdir(exist_ok=True)

    def save(path: Path, size: int) -> None:
        img = master if size == MASTER_SIZE else master.resize(
            (size, size), Image.Resampling.LANCZOS
        )
        rgba = img.convert("RGBA")
        flat = Image.new("RGB", rgba.size, THEME_BG)
        flat.paste(rgba, mask=rgba.split()[3])
        flat.save(path, format="PNG", optimize=True)

    save(public / "logo.png", MASTER_SIZE)
    save(public / "logo-dark.png", MASTER_SIZE)
    save(public / "icon-192x192.png", 192)
    save(public / "icon-512x512.png", 512)

    app_dir = REPO / "src" / "app"
    app_dir.mkdir(parents=True, exist_ok=True)
    save(app_dir / "icon.png", 512)

    print("wrote public/logo.png, public/logo-dark.png, icon-*.png, src/app/icon.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
