#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from stylee.contracts import (
    Category, GapSuggestion, InputMode, LayerRole, Outfit, OutfitItemRef,
    RecommendationResult, RequestContext, Slot, WardrobeItem,
)
from stylee.outfit_policy import build_item_facts
from stylee.service.adapter import outfits_to_app, wardrobe_item


ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT / "fixtures/release-smoke/outfit-quality-requests.json"


def _context_with_items() -> RequestContext:
    return RequestContext(
        input_mode=InputMode.NL,
        wardrobe=[
            WardrobeItem("top", Category.TOP, "白色T恤"),
            WardrobeItem("bottom", Category.BOTTOM, "黑色长裤"),
            WardrobeItem("shoes", Category.SHOES, "白色乐福鞋"),
        ],
        query_text="日常",
        n=1,
    )


def test_outfits_to_app_emits_complete_layout_mapping() -> None:
    ctx = _context_with_items()
    outfit = Outfit(items=[
        OutfitItemRef(Slot.TORSO, "top", layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.BOTTOM, "bottom"),
        OutfitItemRef(Slot.FEET, "shoes"),
        OutfitItemRef(
            Slot.ACCESSORY,
            owned=False,
            suggest=GapSuggestion(Category.SCARF, "米色围巾", "保暖"),
        ),
    ])
    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)
    value = body["outfits"][0]
    assert value["owned_item_ids"] == ["top", "bottom", "shoes"]
    assert len(value["recommended_items"]) == 1
    assert value["layout_items"] == [
        {"source": "owned", "item_id": "top", "layout_role": "base"},
        {"source": "owned", "item_id": "bottom", "layout_role": "bottom"},
        {"source": "owned", "item_id": "shoes", "layout_role": "shoes"},
        {"source": "recommended", "recommended_index": 0, "layout_role": "scarf"},
    ]
    assert body["trace"]["layout_items_emitted"] == 1
    assert body["trace"]["layout_contract_build_error_count"] == 0


def test_wardrobe_item_distinguishes_hat_scarf_and_legacy_accessory() -> None:
    hat = wardrobe_item({"item_id": "h", "category": "帽巾", "name": "白色棒球帽"})
    scarf = wardrobe_item({"item_id": "s", "category": "帽巾", "name": "羊绒围巾"})
    legacy = wardrobe_item({"item_id": "a", "category": "配饰", "name": "珍珠耳饰"})
    assert hat.category is Category.HAT
    assert scarf.category is Category.SCARF
    assert legacy.category is Category.HAT
    assert build_item_facts(legacy).definite_hat is None


def test_wardrobe_item_classifies_null_name_without_crashing() -> None:
    item = wardrobe_item({"item_id": "n", "category": "帽巾", "name": None})

    assert item.category is Category.SCARF
    assert item.subcategory == ""


def test_incomplete_layout_mapping_keeps_old_fields_and_omits_new_field() -> None:
    ctx = _context_with_items()
    outfit = Outfit(items=[
        OutfitItemRef(Slot.TORSO, "top", layer_role=LayerRole.OUTER),
        OutfitItemRef(Slot.BOTTOM, "bottom"),
        OutfitItemRef(Slot.FEET, "shoes"),
    ])
    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)
    value = body["outfits"][0]
    assert value["owned_item_ids"] == ["top", "bottom", "shoes"]
    assert value["recommended_items"] == []
    assert "layout_items" not in value
    assert body["trace"]["layout_items_emitted"] == 0
    assert body["trace"]["layout_contract_build_error_count"] == 1


def test_missing_single_top_layer_role_defaults_to_base() -> None:
    ctx = _context_with_items()
    outfit = Outfit(items=[OutfitItemRef(Slot.TORSO, "top")])

    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)

    assert body["outfits"][0]["layout_items"] == [
        {"source": "owned", "item_id": "top", "layout_role": "base"},
    ]


def test_legacy_non_hat_accessory_maps_to_accessory_role() -> None:
    ctx = RequestContext(
        input_mode=InputMode.NL,
        wardrobe=[WardrobeItem("earring", Category.HAT, "珍珠耳饰")],
    )
    outfit = Outfit(items=[OutfitItemRef(Slot.ACCESSORY, "earring")])

    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)

    assert body["outfits"][0]["layout_items"] == [
        {"source": "owned", "item_id": "earring", "layout_role": "accessory"},
    ]


def test_duplicate_owned_layout_key_omits_layout_mapping() -> None:
    ctx = _context_with_items()
    outfit = Outfit(items=[
        OutfitItemRef(Slot.TORSO, "top", layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.TORSO, "top", layer_role=LayerRole.BASE),
    ])

    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)

    assert body["outfits"][0]["owned_item_ids"] == ["top", "top"]
    assert "layout_items" not in body["outfits"][0]
    assert body["trace"]["layout_contract_build_error_count"] == 1


def test_release_smoke_fixture_has_unique_items_and_name_aware_hat_scarf() -> None:
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    items = [wardrobe_item(value) for value in source["base"]["wardrobe"]]
    by_id = {item.id: item for item in items}
    assert len(by_id) == len(items)
    assert by_id["hat"].category is Category.HAT
    assert by_id["scarf"].category is Category.SCARF


def main() -> None:
    test_outfits_to_app_emits_complete_layout_mapping()
    test_wardrobe_item_distinguishes_hat_scarf_and_legacy_accessory()
    test_wardrobe_item_classifies_null_name_without_crashing()
    test_incomplete_layout_mapping_keeps_old_fields_and_omits_new_field()
    test_missing_single_top_layer_role_defaults_to_base()
    test_legacy_non_hat_accessory_maps_to_accessory_role()
    test_duplicate_owned_layout_key_omits_layout_mapping()
    test_release_smoke_fixture_has_unique_items_and_name_aware_hat_scarf()
    print("ok")


if __name__ == "__main__":
    main()
