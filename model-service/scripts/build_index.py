#!/usr/bin/env python3
"""建索引:读 exemplars.jsonl → embed → 写 exemplars.vecs + index.meta.json。

离线步骤(不碰热路径)。无 key 时 build_embedder 用 Hashing 出 dev 索引。
vecs 行序严格对齐 jsonl 行序。
"""
from __future__ import annotations

import argparse
import array
import datetime
import json
import os
import sys

# 允许 `python3 scripts/build_index.py` 直接跑:把仓库根加入 sys.path,
# 否则脚本目录(scripts/)是 sys.path[0],同级的 stylee 包导不到。
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from stylee.embeddings import build_embedder


def write_index(index_dir: str, exemplars: list[dict], embedder) -> dict:
    vecs = embedder.embed([e["text"] for e in exemplars])
    buf = array.array("f")
    for v in vecs:
        if len(v) != embedder.dim:
            raise ValueError(f"向量维度 {len(v)} != embedder.dim {embedder.dim}")
        buf.extend(v)
    with open(os.path.join(index_dir, "exemplars.vecs"), "wb") as f:
        f.write(buf.tobytes())
    meta = {"signature": embedder.signature(), "dim": embedder.dim,
            "count": len(exemplars), "embedder": embedder.name,
            "model": getattr(embedder, "model", ""),
            "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with open(os.path.join(index_dir, "index.meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return meta


def _read_jsonl(path: str) -> list[dict]:
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                out.append(json.loads(line))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="建 Garments2Look 向量索引")
    ap.add_argument("--dir", default="data/garments2look")
    args = ap.parse_args()
    jsonl = os.path.join(args.dir, "exemplars.jsonl")
    exemplars = _read_jsonl(jsonl)
    if not exemplars:
        print(f"[!] {jsonl} 为空,请先跑 build_exemplars.py")
        return
    embedder = build_embedder()
    meta = write_index(args.dir, exemplars, embedder)
    print(f"建好索引: {meta['count']} 条, signature={meta['signature']}")


if __name__ == "__main__":
    main()
