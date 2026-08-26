#!/usr/bin/env python3
"""约束推荐管线：首轮、定向重试和确定性保底。"""
from __future__ import annotations

from stylee.constraints import build_candidate_pool, validate_outfit_result
from stylee.contracts import (
    Category,
    Formality,
    InputMode,
    LayerRole,
    Outfit,
    OutfitItemRef,
    RequestContext,
    SceneSpec,
    Season,
    Slot,
    WardrobeItem,
    Weather,
)
from stylee.outfit_fallback import build_safe_fallback
from stylee.outfit_policy import ConstraintPolicy
from stylee.pipeline import _item_index, recommend
from stylee.providers.base import LLMProvider
from stylee.providers.mock import MockProvider
from stylee.sampledata import scenarios


class FixedRetriever:
    mode = "fixed"
    last_mode = "fixed"
    last_fallback = None

    def retrieve(self, scene, k, season):
        return []


class SequentialProvider(LLMProvider):
    name = "sequential"

    def __init__(self, first: list[Outfit], retry: list[Outfit]):
        self.first = first
        self.retry = retry
        self.parse_calls = 0
        self.first_calls = 0
        self.retry_calls = 0
        self.first_k = None
        self.retry_k = None
        self.retry_violations: list[str] = []

    def parse_intent(self, ctx):
        self.parse_calls += 1
        return SceneSpec(occasions=["休闲"], formality=Formality.CASUAL, vibe="日常")

    def generate_outfits(self, ctx, scene, pool, exemplars, k):
        self.first_calls += 1
        self.first_k = k
        return list(self.first)

    def regenerate_outfits(self, ctx, scene, pool, exemplars, k, violations):
        self.retry_calls += 1
        self.retry_k = k
        self.retry_violations = list(violations)
        return list(self.retry)


def wardrobe() -> list[WardrobeItem]:
    all_seasons = list(Season)
    return [
        WardrobeItem("t1", Category.TOP, "白色T恤", ["白色"], seasons=all_seasons),
        WardrobeItem("t2", Category.TOP, "白色针织", ["白色"], seasons=all_seasons),
        WardrobeItem("turtle", Category.TOP, "厚高领毛衣", ["黑色"], seasons=all_seasons),
        WardrobeItem("shirt", Category.TOP, "普通白衬衫", ["白色"], seasons=all_seasons),
        WardrobeItem("b1", Category.BOTTOM, "黑色长裤", ["黑色"], seasons=all_seasons),
        WardrobeItem("b2", Category.BOTTOM, "黑色半裙", ["黑色"], seasons=all_seasons),
        WardrobeItem("s1", Category.SHOES, "白色球鞋", ["白色"], seasons=all_seasons),
        WardrobeItem("s2", Category.SHOES, "黑色乐福鞋", ["黑色"], seasons=all_seasons),
        WardrobeItem("bag", Category.BAG, "黑色手袋", ["黑色"], seasons=all_seasons),
        WardrobeItem("hat", Category.HAT, "黑色帽子", ["黑色"], seasons=all_seasons),
    ]


def context(items: list[WardrobeItem] | None = None) -> RequestContext:
    return RequestContext(
        input_mode=InputMode.NL,
        wardrobe=wardrobe() if items is None else items,
        query_text="日常休闲",
        weather=Weather(22, "晴"),
        n=3,
    )


def valid(top: str = "t1", bottom: str = "b1", shoe: str = "s1") -> Outfit:
    return Outfit(items=[
        OutfitItemRef(Slot.TORSO, top, layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.BOTTOM, bottom),
        OutfitItemRef(Slot.FEET, shoe),
    ])


def invalid_missing_shoe() -> Outfit:
    return Outfit(items=[
        OutfitItemRef(Slot.TORSO, "t1", layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.BOTTOM, "b1"),
    ])


def invalid_layer_pair() -> Outfit:
    return Outfit(items=[
        OutfitItemRef(Slot.TORSO, "turtle", layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.TORSO, "shirt", layer_role=LayerRole.MID),
        OutfitItemRef(Slot.BOTTOM, "b1"),
        OutfitItemRef(Slot.FEET, "s1"),
    ])


def test_zero_first_pass_retries_four_without_repeating_intent():
    retry = [
        valid("t1", "b1", "s1"),
        valid("t1", "b2", "s2"),
        valid("t2", "b1", "s2"),
        valid("t2", "b2", "s1"),
    ]
    provider = SequentialProvider([invalid_missing_shoe() for _ in range(6)], retry)
    result = recommend(context(), provider, retriever=FixedRetriever())

    assert provider.parse_calls == 1
    assert provider.first_calls == 1 and provider.first_k == 6
    assert provider.retry_calls == 1 and provider.retry_k == 4
    assert provider.retry_violations == ["H_FEET_EXACTLY_ONE"]
    assert len(result.outfits) == 3
    assert result.trace["first_pass_valid"] == 0
    assert result.trace["retry_triggered"] is True
    assert result.trace["retry_candidate_count"] == 4
    assert result.trace["fallback_type"] == "none"


def test_one_valid_first_pass_returns_without_retry():
    provider = SequentialProvider(
        [valid()] + [invalid_missing_shoe() for _ in range(5)],
        [],
    )
    result = recommend(context(), provider, retriever=FixedRetriever())

    assert len(result.outfits) == 1
    assert provider.retry_calls == 0
    assert result.trace["first_pass_valid"] == 1
    assert result.trace["retry_triggered"] is False
    assert result.trace["retry_candidate_count"] == 0


def test_layer_conflict_triggers_one_targeted_retry() -> None:
    provider = SequentialProvider(
        [invalid_layer_pair() for _ in range(6)],
        [valid()],
    )
    result = recommend(context(), provider, retriever=FixedRetriever())

    assert provider.retry_calls == 1
    assert provider.retry_violations == ["D_LAYER_COMPAT"]
    assert result.trace["first_pass_valid"] == 0
    assert len(result.outfits) == 1
    assert len(result.outfits[0].items) == 3


def test_repeated_invalid_output_uses_absolute_valid_fallback():
    provider = SequentialProvider(
        [invalid_missing_shoe() for _ in range(6)],
        [invalid_missing_shoe() for _ in range(4)],
    )
    ctx = context()
    result = recommend(ctx, provider, retriever=FixedRetriever())

    assert len(result.outfits) == 1
    fallback = result.outfits[0]
    checked = validate_outfit_result(
        fallback,
        ctx,
        SceneSpec(occasions=["休闲"]),
        _item_index(ctx.wardrobe),
        policy=ConstraintPolicy.absolute_only(),
    )
    assert checked.valid, checked.error_codes
    assert result.trace["fallback_type"] == "deterministic"
    assert result.trace["rejected_by_rule"] == {"H_FEET_EXACTLY_ONE": 10}
    assert all(
        (not item.owned) or _item_index(ctx.wardrobe)[item.ref].category not in {
            Category.BAG, Category.HAT, Category.SCARF,
        }
        for item in fallback.items
    )


def test_empty_wardrobe_fallback_uses_only_required_gaps():
    ctx = context([])
    scene = SceneSpec(occasions=["休闲"])
    pool = build_candidate_pool(ctx, scene)
    fallback = build_safe_fallback(ctx, scene, pool, {})

    assert fallback.items
    assert all(not item.owned for item in fallback.items)
    assert [item.suggest.category for item in fallback.items] == [
        Category.TOP,
        Category.BOTTOM,
        Category.SHOES,
    ]
    assert validate_outfit_result(
        fallback, ctx, scene, {}, policy=ConstraintPolicy.absolute_only()
    ).valid

    provider = SequentialProvider([], [])
    result = recommend(ctx, provider, retriever=FixedRetriever())
    assert result.trace["recommended_gap_count"] == 3
    assert result.trace["query_overridden_rules"] == []


def test_mock_provider_stays_legal_under_the_production_policy():
    for name, ctx in scenarios():
        result = recommend(ctx, MockProvider(), retriever=FixedRetriever())
        assert result.trace["rejected_illegal"] == 0, (name, result.trace["rejected_by_rule"])
        assert result.trace["retry_triggered"] is False, name


def main():
    test_zero_first_pass_retries_four_without_repeating_intent()
    test_one_valid_first_pass_returns_without_retry()
    test_layer_conflict_triggers_one_targeted_retry()
    test_repeated_invalid_output_uses_absolute_valid_fallback()
    test_empty_wardrobe_fallback_uses_only_required_gaps()
    test_mock_provider_stays_legal_under_the_production_policy()
    print("ok")


if __name__ == "__main__":
    main()
