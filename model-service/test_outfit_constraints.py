#!/usr/bin/env python3
"""Outfit policy and validation regression tests.

Each test names a user-visible break that the deterministic B4 guard must catch.
Run directly with ``python3 test_outfit_constraints.py``.
"""
from __future__ import annotations

from stylee.constraints import authoritative_item_or_gap, validate_outfit_result
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
    Season,
    Slot,
    WardrobeItem,
    Weather,
)
from stylee.outfit_policy import (
    accessory_is_coherent,
    ClosureMode,
    GarmentKind,
    ThicknessBand,
    ItemFacts,
    build_constraint_policy,
    build_item_facts,
    layer_pair_compatible,
)


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
        _item("accessory-1", Category.ACCESSORY, "法式珍珠耳饰", "白色", styles=["法式慵懒"]),
        _item("accessory-2", Category.ACCESSORY, "法式细项链", "白色", styles=["法式慵懒"]),
        _item("accessory-3", Category.ACCESSORY, "法式手链", "白色", styles=["法式慵懒"]),
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

    hat_and_jewelry = _base_outfit()
    hat_and_jewelry.items.extend([
        _owned(Slot.ACCESSORY, "hat-1"),
        _owned(Slot.ACCESSORY, "accessory-1"),
    ])
    hat_and_jewelry_codes = _codes(hat_and_jewelry, query="戴这顶帽子")
    assert "H_HAT_AT_MOST_ONE" not in hat_and_jewelry_codes
    assert "D_ACCESSORY_COUNT_MAX_TWO" not in hat_and_jewelry_codes

    three_generic = _base_outfit()
    three_generic.items.extend([
        _owned(Slot.ACCESSORY, "accessory-1"),
        _owned(Slot.ACCESSORY, "accessory-2"),
        _owned(Slot.ACCESSORY, "accessory-3"),
    ])
    assert "D_ACCESSORY_COUNT_MAX_TWO" in _codes(three_generic)


def test_accessories_are_optional_and_default_to_at_most_two() -> None:
    assert "D_ACCESSORY_COUNT_MAX_TWO" not in _codes(_base_outfit())
    three = _base_outfit()
    three.items.extend([
        _owned(Slot.ACCESSORY, "bag-1"),
        _owned(Slot.ACCESSORY, "hat-1"),
        _owned(Slot.ACCESSORY, "legacy-accessory"),
    ])
    assert "D_ACCESSORY_COUNT_MAX_TWO" in _codes(three)
    assert "D_ACCESSORY_COUNT_MAX_TWO" not in _codes(
        three, query="我要丰富配饰和多配饰叠搭",
    )


def test_baseball_cap_does_not_pass_formal_outfit_by_color_alone() -> None:
    outfit = _base_outfit()
    outfit.items.append(_owned(Slot.ACCESSORY, "hat-1"))
    assert "D_ACCESSORY_COHERENCE" in _codes(outfit)
    assert "D_ACCESSORY_COHERENCE" not in _codes(
        outfit, query="戴这顶帽子，做明确混搭",
    )


def test_cold_weather_scarf_has_a_functional_positive_signal() -> None:
    wardrobe = _wardrobe() + [
        _item("scarf-1", Category.SCARF, "羊绒围巾", "米色"),
    ]
    outfit = _base_outfit()
    outfit.items.append(_owned(Slot.ACCESSORY, "scarf-1"))
    assert "D_ACCESSORY_COHERENCE" not in _codes(
        outfit, temp_c=8.0, wardrobe=wardrobe,
    )


def test_unknown_accessory_without_evidence_is_rejected_for_owned_and_gap_paths() -> None:
    wardrobe = [
        _item("plain-top", Category.TOP, "白色T恤", "白色"),
        _item("plain-bottom", Category.BOTTOM, "黑色长裤", "黑色"),
        _item("plain-shoes", Category.SHOES, "普通鞋", "黑色"),
        _item("mystery-accessory", Category.ACCESSORY, "神秘配饰", "黑色"),
    ]
    owned = Outfit(items=[
        _owned(Slot.TORSO, "plain-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "plain-bottom"),
        _owned(Slot.FEET, "plain-shoes"),
        _owned(Slot.ACCESSORY, "mystery-accessory"),
    ])
    gap = Outfit(items=[
        _owned(Slot.TORSO, "plain-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "plain-bottom"),
        _owned(Slot.FEET, "plain-shoes"),
        _gap(Slot.ACCESSORY, Category.ACCESSORY, "神秘配饰"),
    ])

    assert "D_ACCESSORY_COHERENCE" in _codes(owned, wardrobe=wardrobe)
    assert "D_ACCESSORY_COHERENCE" in _codes(gap, wardrobe=wardrobe)


def test_known_formality_tokens_allow_owned_and_gap_accessories() -> None:
    wardrobe = [
        _item("formal-top", Category.TOP, "白色西装上衣", "白色"),
        _item("formal-bottom", Category.BOTTOM, "黑色西装长裤", "黑色"),
        _item("formal-shoes", Category.SHOES, "黑色西装皮鞋", "黑色"),
        _item("formal-accessory", Category.ACCESSORY, "西装胸针", "黑色"),
    ]
    owned = Outfit(items=[
        _owned(Slot.TORSO, "formal-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "formal-bottom"),
        _owned(Slot.FEET, "formal-shoes"),
        _owned(Slot.ACCESSORY, "formal-accessory"),
    ])
    gap = Outfit(items=[
        _owned(Slot.TORSO, "formal-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "formal-bottom"),
        _owned(Slot.FEET, "formal-shoes"),
        _gap(Slot.ACCESSORY, Category.ACCESSORY, "西装胸针"),
    ])

    assert "D_ACCESSORY_COHERENCE" not in _codes(owned, wardrobe=wardrobe)
    assert "D_ACCESSORY_COHERENCE" not in _codes(gap, wardrobe=wardrobe)


def test_seasonal_accessory_has_a_reliable_positive_signal() -> None:
    wardrobe = [
        _item("plain-top", Category.TOP, "白色T恤", "白色"),
        _item("plain-bottom", Category.BOTTOM, "黑色长裤", "黑色"),
        _item("plain-shoes", Category.SHOES, "普通鞋", "黑色"),
        WardrobeItem(
            id="spring-accessory",
            category=Category.ACCESSORY,
            subcategory="神秘配饰",
            colors=["黑色"],
            seasons=[Season.SPRING],
        ),
    ]
    outfit = Outfit(items=[
        _owned(Slot.TORSO, "plain-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "plain-bottom"),
        _owned(Slot.FEET, "plain-shoes"),
        _owned(Slot.ACCESSORY, "spring-accessory"),
    ])

    assert "D_ACCESSORY_COHERENCE" not in _codes(outfit, wardrobe=wardrobe)


def test_known_formality_conflict_rejects_functional_scarf_gap() -> None:
    wardrobe = [
        _item("formal-top", Category.TOP, "黑色西装上衣"),
        _item("formal-bottom", Category.BOTTOM, "黑色西装长裤"),
        _item("formal-shoes", Category.SHOES, "黑色西装皮鞋"),
        _item("formal-outer", Category.OUTERWEAR, "黑色西装外套"),
    ]
    outfit = Outfit(items=[
        _owned(Slot.TORSO, "formal-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "formal-bottom"),
        _owned(Slot.FEET, "formal-shoes"),
        _owned(Slot.OUTER, "formal-outer", LayerRole.OUTER),
        _gap(Slot.ACCESSORY, Category.SCARF, "运动机能围巾"),
    ])
    ctx = RequestContext(
        input_mode=InputMode.NL,
        wardrobe=wardrobe,
        weather=Weather(temp_c=8.0),
        query_text="正式典礼",
        n=1,
    )
    scene = SceneSpec(
        occasions=[],
        formality=Formality.FORMAL,
    )
    result = validate_outfit_result(
        outfit,
        ctx,
        scene,
        {item.id: item for item in wardrobe},
        policy=build_constraint_policy(ctx, scene),
    )

    assert "D_ACCESSORY_COHERENCE" in result.error_codes


def test_scene_style_exclusion_beats_accessory_style_match() -> None:
    core = [_item("minimal-top", Category.TOP, "白色T恤", styles=["极简"])]
    accessory = _item(
        "mixed-hat",
        Category.HAT,
        "极简学院风贝雷帽",
        styles=["极简", "学院风"],
    )
    formal_scene = SceneSpec(occasions=["正式"], formality=Formality.FORMAL)

    assert accessory_is_coherent(
        accessory,
        core,
        formal_scene,
        Weather(temp_c=22.0),
    ) is False


def test_gap_accessory_uses_description_style_facts_like_equivalent_owned_item() -> None:
    wardrobe = [
        _item("minimal-top", Category.TOP, "白色极简衬衫", styles=["极简"]),
        _item("minimal-bottom", Category.BOTTOM, "黑色极简长裤", styles=["极简"]),
        _item("formal-shoes", Category.SHOES, "黑色乐福鞋"),
        _item("preppy-beret", Category.HAT, "学院风贝雷帽"),
    ]
    owned = Outfit(items=[
        _owned(Slot.TORSO, "minimal-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "minimal-bottom"),
        _owned(Slot.FEET, "formal-shoes"),
        _owned(Slot.ACCESSORY, "preppy-beret"),
    ])
    gap = Outfit(items=[
        _owned(Slot.TORSO, "minimal-top", LayerRole.BASE),
        _owned(Slot.BOTTOM, "minimal-bottom"),
        _owned(Slot.FEET, "formal-shoes"),
        _gap(Slot.ACCESSORY, Category.HAT, "学院风贝雷帽"),
    ])
    ctx = RequestContext(
        input_mode=InputMode.NL,
        wardrobe=wardrobe,
        weather=Weather(temp_c=22.0),
        query_text="正式典礼",
        n=1,
    )
    scene = SceneSpec(
        occasions=["正式"],
        formality=Formality.FORMAL,
        style_keywords=["极简"],
    )
    policy = build_constraint_policy(ctx, scene)
    index = {item.id: item for item in wardrobe}
    owned_facts = build_item_facts(index["preppy-beret"])
    gap_facts = build_item_facts(authoritative_item_or_gap(
        gap.items[-1], Category.HAT, index,
    ))
    assert owned_facts.styles == gap_facts.styles == frozenset({"学院风"})

    owned_codes = validate_outfit_result(
        owned, ctx, scene, index, policy=policy,
    ).error_codes
    gap_codes = validate_outfit_result(
        gap, ctx, scene, index, policy=policy,
    ).error_codes
    assert ("D_ACCESSORY_COHERENCE" in owned_codes) is True
    assert ("D_ACCESSORY_COHERENCE" in owned_codes) == (
        "D_ACCESSORY_COHERENCE" in gap_codes
    )


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


def test_three_layers_require_explicit_query_and_four_always_fail() -> None:
    three = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.TORSO, "top-2", LayerRole.MID),
        _owned(Slot.OUTER, "outer-1", LayerRole.OUTER),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ], style_tags=["法式慵懒"])
    assert "D_UPPER_LAYER_MAX_TWO" in _codes(three)
    assert "D_UPPER_LAYER_MAX_TWO" not in _codes(three, query="我要三层叠穿")
    assert "H_UPPER_LAYER_RANGE" not in _codes(three, query="我要三层叠穿")

    four = Outfit(items=three.items + [
        _owned(Slot.TORSO, "top-3", LayerRole.MID),
    ], style_tags=["法式慵懒"])
    assert "H_UPPER_LAYER_RANGE" in _codes(four, query="我要多层叠穿")

    two_outers = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.OUTER, "outer-1", LayerRole.OUTER),
        _owned(Slot.OUTER, "outer-2", LayerRole.OUTER),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])
    assert "H_OUTER_AT_MOST_ONE" in _codes(two_outers)


def test_layer_role_structure_is_absolute() -> None:
    duplicate_base = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.TORSO, "top-2", LayerRole.BASE),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])
    assert "H_LAYER_ROLE_STRUCTURE" in _codes(duplicate_base, query="我要特殊叠穿")


def test_unknown_or_conflicting_second_top_is_rejected() -> None:
    wardrobe = [
        _item("turtle", Category.TOP, "厚高领毛衣"),
        _item("shirt", Category.TOP, "普通白衬衫"),
        _item("bottom", Category.BOTTOM, "黑色长裤"),
        _item("shoe", Category.SHOES, "黑色乐福鞋"),
    ]
    outfit = Outfit(items=[
        _owned(Slot.TORSO, "turtle", LayerRole.BASE),
        _owned(Slot.TORSO, "shirt", LayerRole.MID),
        _owned(Slot.BOTTOM, "bottom"),
        _owned(Slot.FEET, "shoe"),
    ])
    assert "D_LAYER_COMPAT" in _codes(outfit, wardrobe=wardrobe)
    assert "D_LAYER_COMPAT" not in _codes(
        outfit, query="高领配衬衫，衬衫敞开穿", wardrobe=wardrobe,
    )


def test_legacy_single_top_and_outer_without_layer_roles_remain_valid() -> None:
    outfit = Outfit(items=[
        _owned(Slot.TORSO, "top-1"),
        _owned(Slot.OUTER, "outer-1"),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])

    codes = _codes(outfit)
    assert "H_LAYER_ROLE_STRUCTURE" not in codes
    assert "D_LAYER_COMPAT" not in codes


def test_gap_top_description_participates_in_layer_compatibility() -> None:
    compatible_gap = Outfit(items=[
        _owned(Slot.TORSO, "top-3", LayerRole.BASE),
        OutfitItemRef(
            role=Slot.TORSO,
            owned=False,
            suggest=GapSuggestion(Category.TOP, "牛仔衬衫外套", "补充中间层"),
            layer_role=LayerRole.MID,
        ),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])
    unknown_gap = Outfit(items=[
        _owned(Slot.TORSO, "top-3", LayerRole.BASE),
        OutfitItemRef(
            role=Slot.TORSO,
            owned=False,
            suggest=GapSuggestion(Category.TOP, "神秘上装", "补充中间层"),
            layer_role=LayerRole.MID,
        ),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])

    assert "D_LAYER_COMPAT" not in _codes(compatible_gap)
    assert "D_LAYER_COMPAT" in _codes(unknown_gap)


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


def test_layer_facts_are_conservative_and_directional() -> None:
    tee = build_item_facts(_item("tee", Category.TOP, "白色T恤"))
    shirt = build_item_facts(_item("shirt", Category.TOP, "白色衬衫"))
    overshirt = build_item_facts(_item("overshirt", Category.TOP, "牛仔衬衫外套"))
    cardigan = build_item_facts(_item("cardigan", Category.TOP, "羊毛开衫"))
    turtleneck = build_item_facts(_item("turtle", Category.TOP, "厚高领毛衣"))

    assert tee.garment_kind is GarmentKind.TEE
    assert shirt.garment_kind is GarmentKind.SHIRT
    assert overshirt.garment_kind is GarmentKind.OVERSHIRT
    assert cardigan.closure_mode is ClosureMode.OPENABLE
    assert turtleneck.thickness_band is ThicknessBand.THICK
    assert layer_pair_compatible(tee, cardigan) is True
    assert layer_pair_compatible(turtleneck, shirt) is False


def test_only_affirmative_explicit_queries_override_new_default_rules() -> None:
    ordinary_ctx, scene, _ = _context("日常通勤")
    ordinary = build_constraint_policy(ordinary_ctx, scene)
    assert ordinary.enforces("D_UPPER_LAYER_MAX_TWO")
    assert ordinary.enforces("D_LAYER_COMPAT")
    assert ordinary.enforces("D_ACCESSORY_COUNT_MAX_TWO")
    assert ordinary.enforces("D_ACCESSORY_COHERENCE")

    three_layers_ctx, scene, _ = _context("我要三层叠穿")
    three_layers = build_constraint_policy(three_layers_ctx, scene)
    assert not three_layers.enforces("D_UPPER_LAYER_MAX_TWO")
    assert three_layers.enforces("D_LAYER_COMPAT")

    open_shirt_ctx, scene, _ = _context("高领配衬衫，衬衫敞开穿")
    open_shirt = build_constraint_policy(open_shirt_ctx, scene)
    assert open_shirt.enforces("D_UPPER_LAYER_MAX_TWO")
    assert not open_shirt.enforces("D_LAYER_COMPAT")

    rich_ctx, scene, _ = _context("我要丰富配饰")
    rich = build_constraint_policy(rich_ctx, scene)
    assert not rich.enforces("D_ACCESSORY_COUNT_MAX_TWO")
    assert rich.enforces("D_ACCESSORY_COHERENCE")

    named_ctx, scene, _ = _context("戴这顶帽子")
    named = build_constraint_policy(named_ctx, scene)
    assert named.enforces("D_ACCESSORY_COUNT_MAX_TWO")
    assert not named.enforces("D_ACCESSORY_COHERENCE")


def test_each_exact_affirmative_term_overrides_only_its_rule() -> None:
    cases = (
        ("我要三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("我要三层穿搭", "D_UPPER_LAYER_MAX_TWO"),
        ("我要三件叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("我要衬衫敞开", "D_LAYER_COMPAT"),
        ("我要敞穿衬衫", "D_LAYER_COMPAT"),
        ("我要丰富配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("我要多配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("我要配饰叠搭", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("我要多件配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("我要戴这顶帽", "D_ACCESSORY_COHERENCE"),
        ("我要加围巾", "D_ACCESSORY_COHERENCE"),
        ("我要搭这个包", "D_ACCESSORY_COHERENCE"),
        ("我要用这件配饰", "D_ACCESSORY_COHERENCE"),
    )
    guarded_rules = (
        "D_UPPER_LAYER_MAX_TWO",
        "D_LAYER_COMPAT",
        "D_ACCESSORY_COUNT_MAX_TWO",
        "D_ACCESSORY_COHERENCE",
    )
    for query, overridden_rule in cases:
        ctx, scene, _ = _context(query)
        policy = build_constraint_policy(ctx, scene)
        assert not policy.enforces(overridden_rule), (query, overridden_rule)
        assert all(
            policy.enforces(rule)
            for rule in guarded_rules
            if rule != overridden_rule
        ), query


def test_bare_exact_terms_remain_authorized() -> None:
    cases = (
        ("三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("衬衫敞开", "D_LAYER_COMPAT"),
        ("丰富配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("加围巾", "D_ACCESSORY_COHERENCE"),
    )
    for query, overridden_rule in cases:
        ctx, scene, _ = _context(query)
        assert not build_constraint_policy(ctx, scene).enforces(overridden_rule), query


def test_negated_or_ambiguous_queries_keep_new_default_rules_enabled() -> None:
    cases = (
        ("不要三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("不想三层穿搭", "D_UPPER_LAYER_MAX_TWO"),
        ("请勿三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("只要多层叠穿的感觉", "D_UPPER_LAYER_MAX_TWO"),
        ("不要衬衫敞开", "D_LAYER_COMPAT"),
        ("不可以衬衫敞开", "D_LAYER_COMPAT"),
        ("高领配衬衫", "D_LAYER_COMPAT"),
        ("不要丰富配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("不要戴这顶帽子", "D_ACCESSORY_COHERENCE"),
        ("不要加围巾", "D_ACCESSORY_COHERENCE"),
        ("勿加围巾", "D_ACCESSORY_COHERENCE"),
        ("不建议三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("不要考虑三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("别再加围巾", "D_ACCESSORY_COHERENCE"),
        ("不要太多配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("取消三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("不是不要三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("不要oversize三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("不要normal丰富配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("不要modern加围巾", "D_ACCESSORY_COHERENCE"),
        ("先别论三层叠穿是否好看", "D_UPPER_LAYER_MAX_TWO"),
        ("别扭头看三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("三层叠穿就不要了", "D_UPPER_LAYER_MAX_TWO"),
        ("丰富配饰并不需要", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("加围巾就算了", "D_ACCESSORY_COHERENCE"),
        ("衬衫敞开不要", "D_LAYER_COMPAT"),
        ("我想告别三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
    )
    for query, code in cases:
        ctx, scene, _ = _context(query)
        assert build_constraint_policy(ctx, scene).enforces(code), (query, code)


def test_tebie_is_not_treated_as_the_negation_bie() -> None:
    cases = (
        ("我特别想要三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("我特别想要衬衫敞开", "D_LAYER_COMPAT"),
        ("我特别想要丰富配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
        ("我特别想加围巾", "D_ACCESSORY_COHERENCE"),
    )
    for query, overridden_rule in cases:
        ctx, scene, _ = _context(query)
        assert not build_constraint_policy(ctx, scene).enforces(overridden_rule), query


def test_independent_bie_in_clause_prefix_is_negation() -> None:
    for query in ("最好别加围巾", "先别加围巾", "还是别加围巾", "能别加围巾吗"):
        ctx, scene, _ = _context(query)
        assert build_constraint_policy(ctx, scene).enforces("D_ACCESSORY_COHERENCE"), query


def test_non_negating_bie_words_preserve_affirmative_override() -> None:
    queries = (
        "我特别想要三层叠穿",
        "我想区别三层叠穿",
        "我想分别三层叠穿",
        "我想填写性别三层叠穿",
        "我想填写级别三层叠穿",
        "我想填写类别三层叠穿",
        "我想识别三层叠穿",
        "我想个别三层叠穿",
        "我想别致三层叠穿",
        "我想别样三层叠穿",
    )
    for query in queries:
        ctx, scene, _ = _context(query)
        assert not build_constraint_policy(ctx, scene).enforces("D_UPPER_LAYER_MAX_TWO"), query


def test_extended_bie_lexical_forms_preserve_affirmative_overrides() -> None:
    reviewer_probes = (
        ("我想要有差别的三层叠穿", "D_UPPER_LAYER_MAX_TWO"),
        ("我想辨别后再加围巾", "D_ACCESSORY_COHERENCE"),
        ("我想甄别后再丰富配饰", "D_ACCESSORY_COUNT_MAX_TWO"),
    )
    for query, overridden_rule in reviewer_probes:
        ctx, scene, _ = _context(query)
        assert not build_constraint_policy(ctx, scene).enforces(overridden_rule), query

    compounds = ("永别", "道别", "派别", "鉴别", "判别")
    for compound in compounds:
        ctx, scene, _ = _context(f"我想{compound}三层叠穿")
        assert not build_constraint_policy(ctx, scene).enforces("D_UPPER_LAYER_MAX_TWO"), compound

    for follower in ("的", "人", "处", "名", "国", "家", "类", "致", "样"):
        ctx, scene, _ = _context(f"我想别{follower}三层叠穿")
        assert not build_constraint_policy(ctx, scene).enforces("D_UPPER_LAYER_MAX_TWO"), follower

    for query in (
        "我想另当别论后再三层叠穿",
        "我觉得衣服很别扭但想要三层叠穿",
    ):
        ctx, scene, _ = _context(query)
        assert not build_constraint_policy(ctx, scene).enforces("D_UPPER_LAYER_MAX_TWO"), query


def test_newline_and_carriage_return_start_a_new_override_clause() -> None:
    for query in ("不要加围巾\n我要加围巾", "不要加围巾\r我要加围巾"):
        ctx, scene, _ = _context(query)
        assert not build_constraint_policy(ctx, scene).enforces("D_ACCESSORY_COHERENCE"), query

    for query in ("不要加围巾\n不要加围巾", "不要加围巾\r不要加围巾"):
        ctx, scene, _ = _context(query)
        assert build_constraint_policy(ctx, scene).enforces("D_ACCESSORY_COHERENCE"), query


def test_item_facts_preserves_legacy_positional_constructor_order() -> None:
    facts = ItemFacts(
        frozenset({LayerRole.BASE}),
        frozenset({"red"}),
        frozenset({"black"}),
        True,
        2,
        frozenset({"极简"}),
        False,
    )
    assert facts.layer_capabilities == frozenset({LayerRole.BASE})
    assert facts.color_families == frozenset({"red"})
    assert facts.neutral_families == frozenset({"black"})
    assert facts.fluorescent is True
    assert facts.formality_level == 2
    assert facts.styles == frozenset({"极简"})
    assert facts.definite_hat is False


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
    test_accessories_are_optional_and_default_to_at_most_two()
    test_baseball_cap_does_not_pass_formal_outfit_by_color_alone()
    test_cold_weather_scarf_has_a_functional_positive_signal()
    test_unknown_accessory_without_evidence_is_rejected_for_owned_and_gap_paths()
    test_known_formality_tokens_allow_owned_and_gap_accessories()
    test_seasonal_accessory_has_a_reliable_positive_signal()
    test_known_formality_conflict_rejects_functional_scarf_gap()
    test_scene_style_exclusion_beats_accessory_style_match()
    test_gap_accessory_uses_description_style_facts_like_equivalent_owned_item()
    test_body_coverage_and_dress_exclusivity_are_enforced()
    test_three_layers_require_explicit_query_and_four_always_fail()
    test_layer_role_structure_is_absolute()
    test_unknown_or_conflicting_second_top_is_rejected()
    test_legacy_single_top_and_outer_without_layer_roles_remain_valid()
    test_gap_top_description_participates_in_layer_compatibility()
    test_non_owned_item_requires_an_explicit_gap()
    test_color_complexity_and_fluorescent_defaults_are_query_overridable()
    test_formality_span_is_query_overridable()
    test_scene_style_pool_and_conflict_pair_require_explicit_query_evidence()
    test_weather_default_is_disabled_only_by_explicit_query()
    test_layer_facts_are_conservative_and_directional()
    test_only_affirmative_explicit_queries_override_new_default_rules()
    test_each_exact_affirmative_term_overrides_only_its_rule()
    test_bare_exact_terms_remain_authorized()
    test_negated_or_ambiguous_queries_keep_new_default_rules_enabled()
    test_tebie_is_not_treated_as_the_negation_bie()
    test_independent_bie_in_clause_prefix_is_negation()
    test_non_negating_bie_words_preserve_affirmative_override()
    test_extended_bie_lexical_forms_preserve_affirmative_overrides()
    test_newline_and_carriage_return_start_a_new_override_clause()
    test_item_facts_preserves_legacy_positional_constructor_order()
    test_unknown_default_facts_warn_instead_of_rejecting()
    print("ok")


if __name__ == "__main__":
    main()
