#!/usr/bin/env python3
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = {
    "bag": ("public/preset-items/black-backpack.png", (0.623, 0.847)),
    "hat": ("public/preset-items/baseball-cap.png", (0.847, 0.821)),
    "scarf": ("public/preset-items/beige-scarf.png", (0.773, 0.847)),
    "shoes": ("public/preset-items/womens-loafers.png", (0.701, 0.246)),
}


for role, (relative, expected) in FIXTURES.items():
    image = Image.open(ROOT / relative).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None, f"{role}: no visible alpha"
    width = (bbox[2] - bbox[0]) / image.width
    height = (bbox[3] - bbox[1]) / image.height
    assert abs(width - expected[0]) <= 0.01, (role, width, expected[0])
    assert abs(height - expected[1]) <= 0.01, (role, height, expected[1])
    print(role, round(width, 3), round(height, 3))
