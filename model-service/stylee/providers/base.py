"""LLMProvider 接口 —— 唯一打模型的地方。

整条链路里只有 B0(parse_intent)和 B3(generate_outfits)真正调用模型。
把这两个动作收在一个接口后面,DeepSeek V4-Flash/Pro、Qwen、Claude 都能直接热替换 ——
key 到了只要实现一个新 Provider,pipeline 一行不用改。
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..contracts import Outfit, RequestContext, SceneSpec


class LLMProvider(ABC):
    name: str = "base"

    @abstractmethod
    def parse_intent(self, ctx: RequestContext) -> SceneSpec:
        """B0:自然语言/标签 → 结构化场景规格。便宜模型(Flash)。"""
        raise NotImplementedError

    @abstractmethod
    def generate_outfits(
        self,
        ctx: RequestContext,
        scene: SceneSpec,
        pool: "CandidatePool",          # noqa: F821 - 运行时由 pipeline 传入
        exemplars: list[dict],
        k: int,
    ) -> list[Outfit]:
        """B3:在受约束的候选池里直接生成整套(引用真实 id + 缺口建议)。强模型(Pro)。

        约束:owned 单品只能引用 pool 里存在的 id;凑不齐的必需槽位走缺口建议。
        """
        raise NotImplementedError
