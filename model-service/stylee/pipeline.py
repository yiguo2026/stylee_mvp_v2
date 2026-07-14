"""B0–B6 编排 —— 推荐生成的主链路。

  B0 解析意图(模型,仅 NL) → B1 约束过滤(code) → B2 取范例(检索)
  → B3 生成 K 套(模型) → B4 硬校验+四维打分(code) → B5 多样性+排序(code)
  → B6 理由+信心分

模型只在 B0/B3 出现,其余全 code,且 code 把模型夹在前后(B1 前置缩可行域、B4 后置挡非法)。
预生成 K(>n)套:top-n 发用户,其余进 result.pool 供"换一套"零成本取用。
"""
from __future__ import annotations

from .constraints import build_candidate_pool, validate_outfit
from .contracts import (
    Outfit,
    RecommendationResult,
    RequestContext,
    WardrobeItem,
)
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


def recommend(
    ctx: RequestContext,
    provider: LLMProvider,
    retriever: ExemplarRetriever | None = None,
    overgen: int = 2,
) -> RecommendationResult:
    retriever = retriever or default_retriever()
    idx = _item_index(ctx.wardrobe)
    k = max(ctx.n * overgen, ctx.n + 2)   # 预生成 K 套

    # B0 意图 → 场景规格(NL 走模型;标签走 code,均封装在 provider 内)
    scene = provider.parse_intent(ctx)

    # B1 约束过滤 → 可行候选池(纯 code)
    pool = build_candidate_pool(ctx, scene)

    # B2 取审美范例(检索)
    exemplars = retriever.retrieve(scene, k=3, season=pool.season)

    # B3 生成 K 套(模型,受约束于 pool 的真实 id)
    drafts = provider.generate_outfits(ctx, scene, pool, exemplars, k)

    # B4 硬校验 + 四维打分(纯 code,挡掉非法)
    valid: list[Outfit] = []
    n_rejected = 0
    n_clash = 0
    n_gap = 0
    for o in drafts:
        errs = validate_outfit(o, ctx, scene, idx)
        if errs:
            n_rejected += 1
            continue
        o.scores = score_outfit(o, ctx, scene, idx)
        # B6 信心分:code 四维加权为主,缺口略降(真模型时再叠品味自评)
        conf = o.scores.weighted(PRIORITY_WEIGHTS)
        if o.has_gap():
            conf *= 0.85
            n_gap += 1
        o.confidence = round(conf, 3)
        if has_style_clash(o, idx):
            n_clash += 1
        valid.append(o)

    # 去重:同一组真实/推荐单品只留信心最高的一份,备用池才有意义
    best_by_sig: dict[frozenset[str], Outfit] = {}
    for o in valid:
        sig = _signature(o)
        if sig not in best_by_sig or o.confidence > best_by_sig[sig].confidence:
            best_by_sig[sig] = o
    deduped = list(best_by_sig.values())

    # B5 排序 + 多样性
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
            "rag_mode": getattr(retriever, "mode", "keyword"),
            "candidate_pool_size": pool.total(),
            "gap_slots": [s.value for s in pool.gap_slots],
            "drafts": len(drafts),
            "rejected_illegal": n_rejected,
            "valid": len(valid),
            "distinct": len(deduped),
            "with_gap": n_gap,
            "with_clash": n_clash,
            "served": len(top),
            "in_reserve": len(rest),
        },
    )
