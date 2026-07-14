"""code 脊柱:硬约束(B1 前置过滤 + B4 后置校验)。

设计原则:硬约束 0 容忍,绝不交给模型。
- B1 `build_candidate_pool`:把整个衣橱筛成"按槽位分桶的可行候选池",模型只在可行域里动。
- B4 `validate_outfit`:对模型生成的整套做硬校验,非法即拒(触发重试)。

对照设计稿"约束 = code(三层)":这里实现 硬·环境(温度/季节/场合)与 硬·槽位逻辑。
软·审美在 scoring.py。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .contracts import (
    CATEGORY_SLOT,
    Category,
    Outfit,
    RequestContext,
    SceneSpec,
    Season,
    Sleeve,
    Slot,
    WardrobeItem,
    Weather,
)


# ---------------------------------------------------------------------------
# 温度 → 保暖档(一张定义一次的映射表,见设计稿"硬·环境")
# 返回 (min_warmth, max_warmth, outer_required, allow_bare_short_sleeve)
# warmth: 0 最薄(背心) → 4 最厚(羽绒)
# ---------------------------------------------------------------------------
@dataclass
class WarmthBand:
    min_warmth: int
    max_warmth: int
    outer_required: bool
    allow_short_sleeve: bool   # 是否允许"裸露"的短/无袖(没有外套盖着)


def warmth_band(temp_c: float) -> WarmthBand:
    if temp_c >= 25:
        return WarmthBand(0, 1, outer_required=False, allow_short_sleeve=True)
    if temp_c >= 18:
        return WarmthBand(0, 2, outer_required=False, allow_short_sleeve=True)
    if temp_c >= 12:
        return WarmthBand(1, 3, outer_required=False, allow_short_sleeve=False)
    if temp_c >= 5:
        return WarmthBand(2, 4, outer_required=True, allow_short_sleeve=False)
    return WarmthBand(3, 4, outer_required=True, allow_short_sleeve=False)


def current_season(weather: Weather) -> Season:
    """没有日历就用温度近似季节(够 demo 用;真实可换成月份+地域)。"""
    t = weather.temp_c
    if t >= 24:
        return Season.SUMMER
    if t >= 15:
        return Season.AUTUMN if weather.time_of_day == "evening" else Season.SPRING
    if t >= 8:
        return Season.AUTUMN
    return Season.WINTER


def covers_bottom(item: WardrobeItem) -> bool:
    """连衣裙同时覆盖 TORSO + BOTTOM。"""
    return item.category == Category.DRESS


# ---------------------------------------------------------------------------
# B1:前置过滤 → 可行候选池(按槽位分桶)
# ---------------------------------------------------------------------------
@dataclass
class CandidatePool:
    by_slot: dict[Slot, list[WardrobeItem]] = field(default_factory=dict)
    season: Season = Season.SPRING
    band: WarmthBand = field(default_factory=lambda: WarmthBand(0, 4, False, True))
    # 哪些"必需槽位"在衣橱里凑不齐 → 交给 B3 做缺口生成
    gap_slots: list[Slot] = field(default_factory=list)

    def get(self, slot: Slot) -> list[WardrobeItem]:
        return self.by_slot.get(slot, [])

    def total(self) -> int:
        return sum(len(v) for v in self.by_slot.values())


# 一套搭配"必须有"的槽位(配饰可选,外套视温度而定)
REQUIRED_SLOTS = [Slot.TORSO, Slot.BOTTOM, Slot.FEET]


def _item_passes(item: WardrobeItem, scene: SceneSpec, season: Season,
                 band: WarmthBand) -> bool:
    # 季节有效(空季节视为四季皆可)
    if item.seasons and season not in item.seasons:
        return False
    # 保暖档:内层单品只排"太厚"(如夏天的羽绒);"太薄"靠叠外套补,不在此排。外套不限。
    if item.slot != Slot.OUTER and item.warmth > band.max_warmth:
        return False
    # 裸露短/无袖:冷天先保守排掉(B4 再对"有外套盖"的情况放宽)
    if item.slot == Slot.TORSO and not band.allow_short_sleeve:
        if item.sleeve in (Sleeve.SHORT, Sleeve.NONE):
            return False
    # 场合硬避让(明确要避开的品类/风格/色)
    if scene.hard_avoids:
        if any(a in item.style_tags or a in item.occasion_tags or a in item.colors
               for a in scene.hard_avoids):
            return False
    # 注:场合/正式度不在 B1 硬筛(否则"白衬衫无'约会'标签"会被误删),改为 scoring 的软分。
    return True


def build_candidate_pool(ctx: RequestContext, scene: SceneSpec) -> CandidatePool:
    """B1:把 ~50 件衣橱硬筛成按槽位分桶的可行候选池。纯 code,确定性。"""
    season = current_season(ctx.weather)
    band = warmth_band(ctx.weather.temp_c)
    pool = CandidatePool(season=season, band=band)

    for item in ctx.wardrobe:
        if not _item_passes(item, scene, season, band):
            continue
        pool.by_slot.setdefault(item.slot, []).append(item)

    # 判定缺口:TORSO 可由 上装 或 连衣裙 满足;有连衣裙则 BOTTOM 可省
    has_torso = bool(pool.get(Slot.TORSO))
    has_dress = any(covers_bottom(i) for i in pool.get(Slot.TORSO))
    has_bottom = bool(pool.get(Slot.BOTTOM)) or has_dress
    has_feet = bool(pool.get(Slot.FEET))

    if not has_torso:
        pool.gap_slots.append(Slot.TORSO)
    if not has_bottom:
        pool.gap_slots.append(Slot.BOTTOM)
    if not has_feet:
        pool.gap_slots.append(Slot.FEET)

    return pool


# ---------------------------------------------------------------------------
# B4:后置硬校验(对模型生成的整套)
# ---------------------------------------------------------------------------
def validate_outfit(outfit: Outfit, ctx: RequestContext, scene: SceneSpec,
                    item_index: dict[str, WardrobeItem]) -> list[str]:
    """返回违规原因列表;空列表 = 合法。这是"模型出错也兜得住"的最后一道关。"""
    errors: list[str] = []
    band = warmth_band(ctx.weather.temp_c)

    owned = [it for it in outfit.items if it.owned]
    # 1) 引用的 id 必须真实存在(防模型幻觉出不存在的衣服)
    for it in owned:
        if not it.ref or it.ref not in item_index:
            errors.append(f"引用了不存在的单品 id: {it.ref}")

    # 槽位计数：已有单品信任衣橱里的真实品类；缺口建议必须由 category
    # 推导槽位，不能信任模型同时生成的 role。否则模型把第二条短裤误标成
    # accessory 时，会绕过“下装恰好一件”的硬约束。
    def slot_of(it) -> Slot:
        if it.owned:
            return item_index[it.ref].slot if it.ref in item_index else it.role
        if it.suggest:
            return CATEGORY_SLOT[it.suggest.category]
        return it.role

    items_by_slot: dict[Slot, list] = {}
    for it in outfit.items:
        items_by_slot.setdefault(slot_of(it), []).append(it)

    has_dress = any(
        (it.owned and it.ref in item_index and covers_bottom(item_index[it.ref]))
        or (not it.owned and it.suggest and it.suggest.category == Category.DRESS)
        for it in outfit.items
    )

    # 2) 槽位逻辑
    n_torso = len(items_by_slot.get(Slot.TORSO, []))
    n_bottom = len(items_by_slot.get(Slot.BOTTOM, []))
    n_feet = len(items_by_slot.get(Slot.FEET, []))
    n_outer = len(items_by_slot.get(Slot.OUTER, []))

    if n_torso != 1:
        errors.append(f"上身(TORSO)应恰好 1 件,实为 {n_torso}")
    if has_dress and n_bottom > 0:
        errors.append("连衣裙不能再叠下装(两件下身冲突)")
    if not has_dress and n_bottom != 1:
        errors.append(f"下身(BOTTOM)应恰好 1 件,实为 {n_bottom}")
    if n_feet != 1:
        errors.append(f"鞋(FEET)应恰好 1 双,实为 {n_feet}")
    if n_outer > 1:
        errors.append(f"外套(OUTER)至多 1 件,实为 {n_outer}")

    # 3) 环境:需要外套的天气却没穿外套
    if band.outer_required and n_outer == 0:
        errors.append(f"{ctx.weather.temp_c}°C 需要外套,但这套没有外套")

    # 4) 环境:裸露短/无袖且无外套盖 + 冷天
    if not band.allow_short_sleeve and n_outer == 0:
        for it in items_by_slot.get(Slot.TORSO, []):
            if it.owned and it.ref in item_index:
                if item_index[it.ref].sleeve in (Sleeve.SHORT, Sleeve.NONE):
                    errors.append("冷天裸穿短/无袖且无外套")

    return errors
