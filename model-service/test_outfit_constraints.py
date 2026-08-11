#!/usr/bin/env python3
"""Outfit policy and validation regression tests.

Each test names a user-visible break that the deterministic B4 guard must catch.
Run directly with ``python3 test_outfit_constraints.py``.
"""
from __future__ import annotations

from stylee.constraints import validate_outfit_result
from stylee.contracts import (
    Category,
    Formality,
    GapSuggestion,
    InputMode,
    LayerRole,
    Outfit,
    OutfitItemRef,
    RequestContext,
    SceneSpec,
    Slot,
    WardrobeItem,
    Weather,
)
from stylee.outfit_policy import build_constraint_policy


def _item(item_id: str, category: Category, name: str, color: str = "黑色",
          *, styles: list[str] | None = None,
          occasions: list[str] | None = None) -> WardrobeItem:
    return WardrobeItem(
        id=item_id,
        category=category,
        subcategory=name,
        colors=[color] if color else [],
        style_tags=styles or [],
        occasion_tags=occasions or [],
    )


def _wardrobe() -> list[WardrobeItem]:
    return [
        _item("top-1", Category.TOP, "白色衬衫", "白色", styles=["法式慵懒"]),
        _item("top-2", Category.TOP, "灰色针织背心", "灰色", styles=["法式慵懒"]),
        _item("top-3", Category.TOP, "黑色T恤", "黑色", styles=["街头潮流"]),
        _item("top-4", Category.TOP, "蓝色卫衣", "蓝色", styles=["运动机能"]),
        _item("bottom-1", Category.BOTTOM, "黑色长裤", "黑色", styles=["法式慵懒"]),
        _item("shoe-1", Category.SHOES, "白色乐福鞋", "白色", occasions=["通勤"]),
        _item("shoe-2", Category.SHOES, "红色运动鞋", "红色", styles=["运动机能"]),
        _item("outer-1", Category.OUTERWEAR, "灰色风衣", "灰色", styles=["法式慵懒"]),
        _item("outer-2", Category.OUTERWEAR, "棕色夹克", "棕色", styles=["工装实用"]),
        _item("bag-1", Category.BAG, "黑色托特包", "黑色"),
        _item("bag-2", Category.BAG, "米色斜挎包", "米色"),
        _item("hat-1", Category.HAT, "黑色棒球帽", "黑色"),
        _item("hat-2", Category.HAT, "白色针织帽", "白色"),
        _item("legacy-accessory", Category.HAT, "珍珠耳饰", "白色"),
        _item("dress-1", Category.DRESS, "蓝色连衣裙", "蓝色", styles=["法式慵懒"]),
    ]


def _context(query: str = "", *, temp_c: float = 22.0,
             wardrobe: list[WardrobeItem] | None = None) -> tuple[RequestContext, SceneSpec, dict[str, WardrobeItem]]:
    items = list(_wardrobe() if wardrobe is None else wardrobe)
    ctx = RequestContext(
        input_mode=InputMode.NL,
        wardrobe=items,
        weather=Weather(temp_c=temp_c),
        query_text=query,
        n=3,
    )
    scene = SceneSpec(
        occasions=["约会"],
        formality=Formality.SMART_CASUAL,
        style_keywords=["法式慵懒"],
    )
    return ctx, scene, {item.id: item for item in items}


def _owned(role: Slot, ref: str, layer: LayerRole | None = None) -> OutfitItemRef:
    return OutfitItemRef(role=role, ref=ref, owned=True, layer_role=layer)


def _gap(role: Slot, category: Category, desc: str = "建议单品") -> OutfitItemRef:
    return OutfitItemRef(
        role=role,
        owned=False,
        suggest=GapSuggestion(category=category, desc=desc, reason="补齐必要槽位"),
    )


def _base_outfit() -> Outfit:
    return Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ], style_tags=["法式慵懒"])


def _codes(outfit: Outfit, query: str = "", *, temp_c: float = 22.0,
           wardrobe: list[WardrobeItem] | None = None) -> list[str]:
    ctx, scene, index = _context(query, temp_c=temp_c, wardrobe=wardrobe)
    return validate_outfit_result(
        outfit, ctx, scene, index,
        policy=build_constraint_policy(ctx, scene),
    ).error_codes


def test_unknown_and_duplicate_owned_refs_are_rejected() -> None:
    unknown = _base_outfit()
    unknown.items[0] = _owned(Slot.TORSO, "not-in-wardrobe", LayerRole.BASE)
    assert "H_OWNED_REF_EXISTS" in _codes(unknown)

    duplicate = _base_outfit()
    duplicate.items.append(_owned(Slot.ACCESSORY, "top-1"))
    assert "H_OWNED_REF_UNIQUE" in _codes(duplicate)


def test_shoe_bag_and_hat_counts_use_authoritative_categories() -> None:
    two_shoes = _base_outfit()
    two_shoes.items.append(_owned(Slot.ACCESSORY, "shoe-2"))
    assert "H_FEET_EXACTLY_ONE" in _codes(two_shoes)

    two_bags = _base_outfit()
    two_bags.items.extend([
        _owned(Slot.ACCESSORY, "bag-1"),
        _owned(Slot.ACCESSORY, "bag-2"),
    ])
    assert "H_BAG_AT_MOST_ONE" in _codes(two_bags)

    two_hats = _base_outfit()
    two_hats.items.extend([
        _owned(Slot.ACCESSORY, "hat-1"),
        _owned(Slot.ACCESSORY, "hat-2"),
    ])
    assert "H_HAT_AT_MOST_ONE" in _codes(two_hats)

    legacy_accessory = _base_outfit()
    legacy_accessory.items.extend([
        _owned(Slot.ACCESSORY, "hat-1"),
        _owned(Slot.ACCESSORY, "legacy-accessory"),
    ])
    assert "H_HAT_AT_MOST_ONE" not in _codes(legacy_accessory)


def test_body_coverage_and_dress_exclusivity_are_enforced() -> None:
    missing_bottom = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.FEET, "shoe-1"),
    ])
    assert "H_BODY_COVERAGE" in _codes(missing_bottom)

    dress_and_bottom = Outfit(items=[
        _owned(Slot.TORSO, "dress-1", LayerRole.BASE),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])
    assert "H_DRESS_BOTTOM_EXCLUSIVE" in _codes(dress_and_bottom)


def test_three_upper_layers_pass_and_four_fail() -> None:
    legal = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.TORSO, "top-2", LayerRole.MID),
        _owned(Slot.OUTER, "outer-1", LayerRole.OUTER),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ], style_tags=["法式慵懒"])
    assert "H_UPPER_LAYER_RANGE" not in _codes(legal)

    illegal = Outfit(items=legal.items + [
        _owned(Slot.TORSO, "top-3", LayerRole.MID),
    ], style_tags=["法式慵懒"])
    assert "H_UPPER_LAYER_RANGE" in _codes(illegal)

    two_outers = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.OUTER, "outer-1", LayerRole.OUTER),
        _owned(Slot.OUTER, "outer-2", LayerRole.OUTER),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])
    assert "H_OUTER_AT_MOST_ONE" in _codes(two_outers)


def test_non_owned_item_requires_an_explicit_gap() -> None:
    malformed = _base_outfit()
    malformed.items.append(OutfitItemRef(role=Slot.ACCESSORY, owned=False))
    assert "H_GAP_SOURCE_EXPLICIT" in _codes(malformed)

    complete_gap = Outfit(items=[
        _gap(Slot.TORSO, Category.TOP, "白色衬衫"),
        _gap(Slot.BOTTOM, Category.BOTTOM, "黑色长裤"),
        _gap(Slot.FEET, Category.SHOES, "白色乐福鞋"),
    ])
    assert not [code for code in _codes(complete_gap) if code.startswith("H_")]


def _custom_outfit(items: list[WardrobeItem], *, styles: list[str] | None = None) -> tuple[Outfit, list[WardrobeItem]]:
    refs: list[OutfitItemRef] = []
    for item in items:
        layer = None
        if item.category == Category.TOP:
            layer = LayerRole.BASE
        elif item.category == Category.OUTERWEAR:
            layer = LayerRole.OUTER
        refs.append(_owned(item.slot, item.id, layer))
    return Outfit(items=refs, style_tags=styles or []), items


def test_color_complexity_and_fluorescent_defaults_are_query_overridable() -> None:
    items = [
        _item("color-top", Category.TOP, "荧光黄T恤", "荧光黄"),
        _item("color-bottom", Category.BOTTOM, "荧光绿长裤", "荧光绿"),
        _item("color-shoe", Category.SHOES, "蓝色运动鞋", "蓝色"),
        _item("color-bag", Category.BAG, "紫色手提包", "紫色"),
    ]
    outfit, wardrobe = _custom_outfit(items)
    blocked = _codes(outfit, wardrobe=wardrobe)
    assert "D_COLOR_FAMILY_MAX" in blocked
    assert "D_COLORED_ITEM_MAX" in blocked
    assert "D_FLUORESCENT_MAX" in blocked

    allowed = _codes(outfit, query="我要多彩荧光撞色", wardrobe=wardrobe)
    assert "D_COLOR_FAMILY_MAX" not in allowed
    assert "D_COLORED_ITEM_MAX" not in allowed
    assert "D_FLUORESCENT_MAX" not in allowed


def test_formality_span_is_query_overridable() -> None:
    items = [
        _item("formal-top", Category.TOP, "黑色西装上衣", "黑色", styles=["通勤职场"]),
        _item("sport-bottom", Category.BOTTOM, "灰色运动裤", "灰色", styles=["运动机能"]),
        _item("sport-shoe", Category.SHOES, "白色运动鞋", "白色", styles=["运动机能"]),
    ]
    outfit, wardrobe = _custom_outfit(items, styles=["通勤职场", "运动机能"])
    assert "D_FORMALITY_SPAN" in _codes(outfit, wardrobe=wardrobe)
    assert "D_FORMALITY_SPAN" not in _codes(
        outfit, query="我要西装配运动鞋", wardrobe=wardrobe,
    )


def test_scene_style_pool_and_conflict_pair_require_explicit_query_evidence() -> None:
    outfit = _base_outfit()
    outfit.style_tags = ["街头潮流", "静奢/老钱"]
    ctx, scene, index = _context()
    scene.occasions = ["通勤"]
    blocked = validate_outfit_result(
        outfit, ctx, scene, index,
        policy=build_constraint_policy(ctx, scene),
    ).error_codes
    assert "D_SCENE_STYLE_POOL" in blocked
    assert "D_STYLE_CONFLICT" in blocked

    ctx, scene, index = _context("通勤穿静奢老钱和街头潮流混搭")
    scene.occasions = ["通勤"]
    allowed = validate_outfit_result(
        outfit, ctx, scene, index,
        policy=build_constraint_policy(ctx, scene),
    ).error_codes
    assert "D_SCENE_STYLE_POOL" not in allowed
    assert "D_STYLE_CONFLICT" not in allowed


def test_weather_default_is_disabled_only_by_explicit_query() -> None:
    outfit = _base_outfit()
    assert "D_WEATHER_COMPAT" in _codes(outfit, temp_c=5.0)
    assert "D_WEATHER_COMPAT" not in _codes(
        outfit, query="室内有暖气，不用外套", temp_c=5.0,
    )


def test_unknown_default_facts_warn_instead_of_rejecting() -> None:
    items = [
        _item("unknown-top", Category.TOP, "", ""),
        _item("unknown-bottom", Category.BOTTOM, "", ""),
        _item("unknown-shoe", Category.SHOES, "", ""),
    ]
    outfit, wardrobe = _custom_outfit(items)
    ctx, scene, index = _context(wardrobe=wardrobe)
    result = validate_outfit_result(
        outfit, ctx, scene, index,
        policy=build_constraint_policy(ctx, scene),
    )
    assert not [code for code in result.error_codes if code.startswith("D_")]
    assert "W_COLOR_UNKNOWN" in result.warnings
    assert "W_FORMALITY_UNKNOWN" in result.warnings
    assert "W_STYLE_UNKNOWN" in result.warnings


def main() -> None:
    test_unknown_and_duplicate_owned_refs_are_rejected()
    test_shoe_bag_and_hat_counts_use_authoritative_categories()
    test_body_coverage_and_dress_exclusivity_are_enforced()
    test_three_upper_layers_pass_and_four_fail()
    test_non_owned_item_requires_an_explicit_gap()
    test_color_complexity_and_fluorescent_defaults_are_query_overridable()
    test_formality_span_is_query_overridable()
    test_scene_style_pool_and_conflict_pair_require_explicit_query_evidence()
    test_weather_default_is_disabled_only_by_explicit_query()
    test_unknown_default_facts_warn_instead_of_rejecting()
    print("ok")


if __name__ == "__main__":
    main()
