"""B2:审美范例检索(RAG)。

Garments2LookRetriever:对 Garments2Look 语料做向量检索,返回 few-shot 整套范例。
索引/key 缺失或签名不匹配 → 回退 KeywordExemplarRetriever(原内置 stub)。
retrieve 签名向后兼容:仅新增可选 season(由 pipeline 传 pool.season)。
"""
from __future__ import annotations

from .contracts import SceneSpec
from .embeddings import EmbeddingError, build_embedder
from .vectorstore import load_index


# 内置范例(stub / 回退用,模拟从 Garments2Look 检索回的整套穿搭)
_EXEMPLARS: list[dict] = [
    {"style_keywords": ["法式", "约会"], "occasions": ["约会"],
     "recipe": "针织上衣 + A字半裙 + 玛丽珍鞋", "note": "上紧下松,显腿长"},
    {"style_keywords": ["通勤", "都市"], "occasions": ["通勤"],
     "recipe": "西装外套 + 直筒长裤 + 乐福鞋", "note": "中性色,利落"},
    {"style_keywords": ["运动休闲", "美式"], "occasions": ["休闲"],
     "recipe": "卫衣 + 直筒牛仔 + 运动鞋", "note": "宽松层次"},
    {"style_keywords": ["学院风", "日系"], "occasions": ["休闲", "通勤"],
     "recipe": "衬衫 + 针织背心 + 百褶裙", "note": "叠穿有层次"},
    {"style_keywords": ["新中式", "文艺"], "occasions": ["聚会"],
     "recipe": "盘扣上衣 + 阔腿裤 + 单鞋", "note": "含蓄端庄"},
    {"style_keywords": ["甜美", "韩系"], "occasions": ["约会", "逛街"],
     "recipe": "泡泡袖上衣 + 半裙 + 平底鞋", "note": "柔和配色"},
]


class KeywordExemplarRetriever:
    """关键词打分检索(原 stub);作为向量检索不可用时的回退。"""

    def __init__(self, exemplars: list[dict] | None = None):
        self.exemplars = exemplars or _EXEMPLARS

    def retrieve(self, scene: SceneSpec, k: int = 3, season=None) -> list[dict]:
        want_styles = set(scene.style_keywords)
        want_occ = set(scene.occasions)

        def score(ex: dict) -> int:
            s = len(want_styles & set(ex["style_keywords"])) * 2
            s += len(want_occ & set(ex["occasions"]))
            return s

        ranked = sorted(self.exemplars, key=score, reverse=True)
        return ranked[:k]


# 兼容旧引用
ExemplarRetriever = KeywordExemplarRetriever


class Garments2LookRetriever:
    """对 Garments2Look 向量索引检索;不可用则回退 KeywordExemplarRetriever。"""

    def __init__(self, index_dir: str = "data/garments2look",
                 embedder=None, fallback=None):
        self._fallback = fallback or KeywordExemplarRetriever()
        self._index = None
        self._embedder = None
        self.mode = "fallback"
        try:
            idx = load_index(index_dir)
            emb = embedder or build_embedder()
            if idx.signature != emb.signature():
                print(f"[rag] 签名不匹配 {idx.signature} != {emb.signature()}"
                      f" → 回退关键词 stub")
            else:
                self._index, self._embedder, self.mode = idx, emb, "vector"
        except (FileNotFoundError, ValueError, OSError, KeyError) as e:
            print(f"[rag] 索引不可用({e}) → 回退关键词 stub")

    @staticmethod
    def _query_text(scene: SceneSpec, season) -> str:
        parts = [f"场合:{','.join(scene.occasions)}",
                 f"风格:{','.join(scene.style_keywords)}"]
        if season is not None:
            parts.append(f"季节:{getattr(season, 'value', season)}")
        if scene.vibe:
            parts.append(scene.vibe)
        return " ".join(parts)

    def retrieve(self, scene: SceneSpec, k: int = 3, season=None) -> list[dict]:
        if self.mode != "vector":
            return self._fallback.retrieve(scene, k, season)
        try:
            qvec = self._embedder.embed([self._query_text(scene, season)])[0]
        except EmbeddingError as e:
            # 设计稿 §6.2 设想此处可先做 lexical-over-loaded-metadata 再回退;
            # as-built 简化为直接回退关键词 stub(在线 embed 失败是稀有窗口,stub 安全)。
            print(f"[rag] 在线 embed 失败({e}) → 本次回退 stub")
            return self._fallback.retrieve(scene, k, season)
        return [m for _, m in self._index.search(qvec, k)]


def default_retriever(index_dir: str = "data/garments2look"):
    """pipeline 默认检索器:向量可用就用,否则关键词 stub。"""
    return Garments2LookRetriever(index_dir=index_dir)
