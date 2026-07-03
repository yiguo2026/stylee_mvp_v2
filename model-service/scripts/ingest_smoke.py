#!/usr/bin/env python3
"""触点 A 真模型 smoke:对一张样本衣物照跑 A1 识别 + A2 标准化。

    DASHSCOPE_API_KEY=sk-xxx python3 scripts/ingest_smoke.py <图片路径>

无 key 自动回退 mock。打印识别属性、photo_type、needs_review、标准化结果。
"""
from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from stylee.ingest import recognize_item, standardize_item, to_data_url
from stylee.vision import build_image_standardizer, build_vision_provider


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    if not path or not os.path.exists(path):
        print("用法: python3 scripts/ingest_smoke.py <图片路径>")
        return
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    with open(path, "rb") as f:
        image_url = to_data_url(f.read(), mime)

    vp, std = build_vision_provider(), build_image_standardizer()

    t = time.time()
    res = recognize_item(image_url, vp)
    print(f"[A1 识别 {(time.time()-t)*1000:.0f}ms] provider={vp.name}")
    print(f"  品类={res.item.category.value} 颜色={res.item.colors} 材质={res.item.material} "
          f"warmth={res.item.warmth} 拍摄类型={res.photo_type.value} "
          f"needs_review={res.needs_review} conf={res.confidence}")

    t = time.time()
    si = standardize_item(image_url, res.item, res.photo_type, vp, std)
    print(f"[A2 标准化 {(time.time()-t)*1000:.0f}ms] method={si.method} verified={si.verified}")
    print(f"  image_ref={si.image_ref[:90]}")


if __name__ == "__main__":
    main()
