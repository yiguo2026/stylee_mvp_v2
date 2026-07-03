"""Stylee 模型/推理层(M2 推荐引擎原型)。

对照设计稿 ~/.claude/plans/quirky-swinging-stonebraker.md。
入口:stylee.pipeline.recommend(ctx, provider)。
"""
from .pipeline import recommend
from .providers import MockProvider
from .rag import ExemplarRetriever

__all__ = ["recommend", "MockProvider", "ExemplarRetriever"]
