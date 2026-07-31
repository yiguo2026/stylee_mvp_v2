#!/usr/bin/env python3
"""Crop per-item thumbnails from the inspiration source images.

Each crop is a normalized (l, t, r, b) box over the source photo. The result is
saved as a square-ish thumbnail under public/inspirations/items/ so the outfit
"单品拆解" on the inspiration detail page shows pieces from the real look.
"""
from PIL import Image
import os

SRC = "public/inspirations"
OUT = "public/inspirations/items"
os.makedirs(OUT, exist_ok=True)

# key -> (source file, [ (item_slug, (l,t,r,b) normalized) ... ])
JOBS = {
    "insp-1": [
        ("hat",   (0.33, 0.06, 0.62, 0.21)),
        ("jacket",(0.24, 0.22, 0.74, 0.54)),
        ("pants", (0.12, 0.55, 0.62, 0.90)),
        ("shoes", (0.06, 0.85, 0.44, 1.00)),
        ("bag",   (0.58, 0.55, 0.90, 0.88)),
    ],
    "insp-2": [
        ("scarf", (0.24, 0.20, 0.62, 0.46)),
        ("shirt", (0.18, 0.28, 0.80, 0.62)),
        ("jeans", (0.26, 0.60, 0.74, 0.98)),
    ],
    "insp-3": [
        ("sunglass",(0.36, 0.11, 0.62, 0.21)),
        ("top",     (0.28, 0.36, 0.64, 0.55)),
        ("skirt",   (0.28, 0.58, 0.74, 0.88)),
        ("bag",     (0.60, 0.48, 0.86, 0.74)),
    ],
    "insp-4": [
        ("cap",    (0.34, 0.06, 0.60, 0.20)),
        ("top",    (0.32, 0.22, 0.64, 0.46)),
        ("pants",  (0.32, 0.48, 0.60, 0.88)),
        ("shoes",  (0.34, 0.90, 0.60, 1.00)),
    ],
    "insp-5": [
        ("hat",    (0.36, 0.04, 0.64, 0.19)),
        ("shirt",  (0.28, 0.22, 0.64, 0.56)),
        ("pants",  (0.32, 0.56, 0.62, 0.88)),
        ("bag",    (0.56, 0.46, 0.80, 0.74)),
        ("shoes",  (0.32, 0.90, 0.60, 1.00)),
    ],
}

for key, items in JOBS.items():
    img = Image.open(f"{SRC}/{key}.png").convert("RGB")
    W, H = img.size
    for slug, (l, t, r, b) in items:
        box = (int(l * W), int(t * H), int(r * W), int(b * H))
        crop = img.crop(box)
        # center-crop to square, then resize to 400x400 thumbnail
        cw, ch = crop.size
        s = min(cw, ch)
        crop = crop.crop(((cw - s) // 2, (ch - s) // 2, (cw - s) // 2 + s, (ch - s) // 2 + s))
        crop = crop.resize((400, 400), Image.LANCZOS)
        out_path = f"{OUT}/{key}-{slug}.png"
        crop.save(out_path, "PNG")
        print("saved", out_path)

print("done")
