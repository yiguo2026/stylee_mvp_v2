"""向量库 —— 纯 stdlib,在线余弦 top-k。

向量已 L2 归一化 → 余弦 = 点积。curated 子集(数千套)规模下纯 Python 足够快。
"""
from __future__ import annotations

import array
import heapq
import json
import os


class VectorIndex:
    def __init__(self, vectors: list[list[float]], metas: list[dict],
                 signature: str, dim: int):
        self.vectors = vectors
        self.metas = metas
        self.signature = signature
        self.dim = dim

    def search(self, qvec: list[float], k: int) -> list[tuple[float, dict]]:
        scored = ((sum(a * b for a, b in zip(qvec, v)), m)
                  for v, m in zip(self.vectors, self.metas))
        return heapq.nlargest(k, scored, key=lambda x: x[0])


def load_index(index_dir: str) -> VectorIndex:
    with open(os.path.join(index_dir, "index.meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    dim, count, sig = meta["dim"], meta["count"], meta["signature"]
    metas: list[dict] = []
    with open(os.path.join(index_dir, "exemplars.jsonl"), encoding="utf-8") as f:
        for line in f:
            if line.strip():
                metas.append(json.loads(line))
    buf = array.array("f")
    with open(os.path.join(index_dir, "exemplars.vecs"), "rb") as f:
        buf.frombytes(f.read())
    if len(buf) != dim * count or len(metas) != count:
        raise ValueError(
            f"索引不一致: vecs={len(buf)} 期望={dim * count}, metas={len(metas)} count={count}")
    vectors = [list(buf[i * dim:(i + 1) * dim]) for i in range(count)]
    return VectorIndex(vectors, metas, sig, dim)
