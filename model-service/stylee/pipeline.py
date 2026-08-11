"""B0–B6 编排 —— 推荐生成的主链路。

  B0 解析意图(模型,仅 NL) → B1 约束过滤(code) → B2 取范例(检索)
  → B3 生成 K 套(模型) → B4 硬校验+四维打分(code) → B5 多样性+排序(code)
  → B6 理由+信心分

模型只在 B0/B3 出现,其余全 code,且 code 把模型夹在前后(B1 前置缩可行域、B4 后置挡非法)。
预生成 K(>n)套:top-n 发用户,其余进 result.pool 供"换一套"零成本取用。
"""
from __future__ import annotations

from collections import Counter
from contextlib import nullcontext
import time
from typing import Callable, ContextManager

from .constraints import build_candidate_pool, validate_outfit_result
from .contracts import (
    Outfit,
    RecommendationResult,
    RequestContext,
    WardrobeItem,
)
from .outfit_fallback import build_safe_fallback
from .outfit_policy import ConstraintPolicy, build_constraint_policy
from .providers.base import LLMProvider
from .rag import default_retriever, ExemplarRetriever
from .scoring import PRIORITY_WEIGHTS, has_style_clash, score_outfit


def _item_index(wardrobe: list[WardrobeItem]) -> dict[str, WardrobeItem]:
    return {it.id: it for it in wardrobe}


def _signature(outfit: Outfit) -> frozenset[str]:
    """整套的稳定签名，覆盖已有单品和推荐补位单品。

    旧实现只使用 owned id。空/稀疏衣橱下所有方案的 owned id 都为空，
    导致模型生成的多套全推荐方案被错误折叠成一套，“换一套”只能再次请求模型。
    """
    parts: list[str] = []
    for item in outfit.items:
        if item.owned and item.ref:
            parts.append(f"owned:{item.ref}")
        elif item.suggest:
            desc = "".join(item.suggest.desc.lower().split())
            parts.append(f"gap:{item.suggest.category.value}:{desc}")
        else:
            parts.append(f"role:{item.role.value}")
    return frozenset(parts)


def _jaccard(a: frozenset, b: frozenset) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))


def _select_diverse(ranked: list[Outfit], n: int, max_overlap: float = 0.6) -> list[Outfit]:
    """B5:贪心挑既高分又互相有差异的 n 套。"""
    chosen: list[Outfit] = []
    for o in ranked:
        sig = _signature(o)
        if all(_jaccard(sig, _signature(c)) <= max_overlap for c in chosen):
            chosen.append(o)
        if len(chosen) >= n:
            break
    # 不足 n 则按分数补齐(允许相似)
    if len(chosen) < n:
        for o in ranked:
            if o not in chosen:
                chosen.append(o)
            if len(chosen) >= n:
                break
    return chosen


def _validate_and_score(
    drafts: list[Outfit],
    ctx: RequestContext,
    scene,
    item_index: dict[str, WardrobeItem],
    policy: ConstraintPolicy,
) -> tuple[list[Outfit], Counter[str], int, int, int]:
    """对任一轮候选执行同一套 code 校验、评分和错误码聚合。"""
    valid: list[Outfit] = []
    rejected_by_rule: Counter[str] = Counter()
    rejected_count = 0
    gap_count = 0
    clash_count = 0
    for outfit in drafts:
        checked = validate_outfit_result(outfit, ctx, scene, item_index, policy=policy)
        if not checked.valid:
            rejected_count += 1
            rejected_by_rule.update(checked.error_codes)
            continue
        outfit.scores = score_outfit(outfit, ctx, scene, item_index)
        confidence = outfit.scores.weighted(PRIORITY_WEIGHTS)
        if outfit.has_gap():
            confidence *= 0.85
            gap_count += 1
        outfit.confidence = round(confidence, 3)
        if has_style_clash(outfit, item_index):
            clash_count += 1
        valid.append(outfit)
    return valid, rejected_by_rule, rejected_count, gap_count, clash_count


def recommend(
    ctx: RequestContext,
    provider: LLMProvider,
    retriever: ExemplarRetriever | None = None,
    overgen: int = 2,
    stage_timer: Callable[[str], ContextManager[None]] | None = None,
) -> RecommendationResult:
    retriever = retriever or default_retriever()
    idx = _item_index(ctx.wardrobe)
    first_k = max(ctx.n * overgen, ctx.n + 2)   # n=3 时首轮生成 6 套

    def timed(name: str) -> ContextManager[None]:
        return stage_timer(name) if stage_timer else nullcontext()

    # B0 意图 → 场景规格(NL 走模型;标签走 code,均封装在 provider 内)
    with timed("B0.parse_intent"):
        scene = provider.parse_intent(ctx)
    policy = build_constraint_policy(ctx, scene)

    # B1 约束过滤 → 可行候选池(纯 code)
    with timed("B1.build_candidate_pool"):
        pool = build_candidate_pool(ctx, scene)

    # B2 取审美范例(检索)
    with timed("B2.retrieve_exemplars"):
        exemplars = retriever.retrieve(scene, k=3, season=pool.season)

    # B3 生成 K 套(模型,受约束于 pool 的真实 id)
    with timed("B3.generate_outfits"):
        first_drafts = provider.generate_outfits(ctx, scene, pool, exemplars, first_k)

    # B4 硬校验 + 四维打分(纯 code,挡掉非法)
    with timed("B4.validate_and_score"):
        valid, rejected_by_rule, n_rejected, n_gap, n_clash = _validate_and_score(
            first_drafts, ctx, scene, idx, policy
        )
    first_pass_valid = len(valid)

    retry_triggered = False
    retry_drafts: list[Outfit] = []
    retry_duration_ms = 0
    fallback_type = "none"

    # 首轮有任意合法结果就直接少量返回；只有 0 套时才额外调用一次 B3。
    if not valid:
        retry_triggered = True
        retry_started = time.monotonic()
        with timed("B3.regenerate_outfits"):
            retry_drafts = provider.regenerate_outfits(
                ctx,
                scene,
                pool,
                exemplars,
                ctx.n + 1,
                sorted(rejected_by_rule),
            )
        retry_duration_ms = round((time.monotonic() - retry_started) * 1000)
        with timed("B4.validate_retry"):
            (valid, retry_rejections, retry_rejected, retry_gaps,
             retry_clashes) = _validate_and_score(retry_drafts, ctx, scene, idx, policy)
        rejected_by_rule.update(retry_rejections)
        n_rejected += retry_rejected
        n_gap += retry_gaps
        n_clash += retry_clashes

    # 第二轮仍为 0 时只返回经过绝对规则复检的确定性结构保底。
    if not valid:
        with timed("B4.safe_fallback"):
            fallback = build_safe_fallback(ctx, scene, pool, idx)
            (fallbacks, _, _, fallback_gaps,
             fallback_clashes) = _validate_and_score(
                [fallback], ctx, scene, idx, ConstraintPolicy.absolute_only()
            )
        valid = fallbacks
        n_gap += fallback_gaps
        n_clash += fallback_clashes
        fallback_type = "deterministic" if valid else "failed"

    with timed("B5.rank_and_diversify"):
        # 去重:同一组真实/推荐单品只留信心最高的一份,备用池才有意义
        best_by_sig: dict[frozenset[str], Outfit] = {}
        for o in valid:
            sig = _signature(o)
            if sig not in best_by_sig or o.confidence > best_by_sig[sig].confidence:
                best_by_sig[sig] = o
        deduped = list(best_by_sig.values())

        ranked = sorted(deduped, key=lambda x: x.confidence, reverse=True)
        top = _select_diverse(ranked, ctx.n)
        top_sigs = {_signature(o) for o in top}
        rest = [o for o in ranked if _signature(o) not in top_sigs]

    return RecommendationResult(
        outfits=top,
        pool=rest,
        model_version=f"m2-mock/{provider.name}",
        trace={
            "scene": {
                "occasions": scene.occasions,
                "formality": scene.formality.value,
                "style": scene.style_keywords,
            },
            "rag_mode": getattr(retriever, "last_mode", getattr(retriever, "mode", "keyword")),
            "rag_fallback": getattr(retriever, "last_fallback", None),
            "candidate_pool_size": pool.total(),
            "gap_slots": [s.value for s in pool.gap_slots],
            "drafts": len(first_drafts) + len(retry_drafts),
            "rejected_illegal": n_rejected,
            "valid": len(valid),
            "distinct": len(deduped),
            "with_gap": n_gap,
            "with_clash": n_clash,
            "served": len(top),
            "in_reserve": len(rest),
            "first_pass_valid": first_pass_valid,
            "rejected_by_rule": dict(sorted(rejected_by_rule.items())),
            "query_overridden_rules": sorted(policy.overridden_rules),
            "retry_triggered": retry_triggered,
            "retry_candidate_count": len(retry_drafts),
            "retry_duration_ms": retry_duration_ms,
            "recommended_gap_count": sum(
                1 for outfit in top for item in outfit.items if not item.owned
            ),
            "fallback_type": fallback_type,
        },
    )
