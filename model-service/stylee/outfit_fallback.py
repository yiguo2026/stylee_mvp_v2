"""两轮模型输出均非法时的确定性安全搭配。"""
from __future__ import annotations

from .constraints import CandidatePool
from .contracts import (
    Category,
    GapSuggestion,
    LayerRole,
    Outfit,
    OutfitItemRef,
    RequestContext,
    SceneSpec,
    Slot,
    WardrobeItem,
)


_GAP_COPY: dict[Category, tuple[str, str]] = {
    Category.TOP: ("百搭基础上衣", "衣橱缺少可用上装"),
    Category.BOTTOM: ("基础直筒下装", "衣橱缺少可用下装"),
    Category.SHOES: ("简洁百搭鞋", "衣橱缺少可用鞋履"),
    Category.OUTERWEAR: ("基础保暖外套", "当前温度需要外套"),
}


def _owned(item: WardrobeItem, layer_role: LayerRole | None = None) -> OutfitItemRef:
    return OutfitItemRef(
        role=item.slot,
        ref=item.id,
        owned=True,
        layer_role=layer_role,
    )


def _gap(category: Category, layer_role: LayerRole | None = None) -> OutfitItemRef:
    desc, reason = _GAP_COPY[category]
    return OutfitItemRef(
        role={
            Category.TOP: Slot.TORSO,
            Category.BOTTOM: Slot.BOTTOM,
            Category.SHOES: Slot.FEET,
            Category.OUTERWEAR: Slot.OUTER,
        }[category],
        owned=False,
        suggest=GapSuggestion(category=category, desc=desc, reason=reason),
        layer_role=layer_role,
    )


def build_safe_fallback(
    ctx: RequestContext,
    scene: SceneSpec,
    pool: CandidatePool,
    item_index: dict[str, WardrobeItem],
) -> Outfit:
    """只构造结构必需项；真实候选不足时用显式 gap 补齐。"""
    available_torsos = [item for item in pool.get(Slot.TORSO) if item.id in item_index]
    dresses = [item for item in available_torsos if item.category == Category.DRESS]
    tops = [item for item in available_torsos if item.category == Category.TOP]
    bottoms = [item for item in pool.get(Slot.BOTTOM) if item.id in item_index]
    shoes = [item for item in pool.get(Slot.FEET) if item.id in item_index]
    outers = [item for item in pool.get(Slot.OUTER) if item.id in item_index]

    items: list[OutfitItemRef] = []
    if dresses:
        items.append(_owned(dresses[0], LayerRole.BASE))
    else:
        items.append(_owned(tops[0], LayerRole.BASE) if tops else _gap(Category.TOP, LayerRole.BASE))
        items.append(_owned(bottoms[0]) if bottoms else _gap(Category.BOTTOM))

    items.append(_owned(shoes[0]) if shoes else _gap(Category.SHOES))

    if pool.band.outer_required:
        items.append(
            _owned(outers[0], LayerRole.OUTER)
            if outers else _gap(Category.OUTERWEAR, LayerRole.OUTER)
        )

    return Outfit(
        items=items,
        occasion=scene.occasions[0] if scene.occasions else "日常",
        reasoning="安全结构保底：优先使用已有单品，缺失槽位以推荐单品补齐。",
    )
