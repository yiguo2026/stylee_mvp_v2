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
from .outfit_policy import (
    ConstraintPolicy,
    allowed_styles_for_scene,
    build_constraint_policy,
    build_item_facts,
    has_style_conflict,
    normalize_style,
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
@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    retryable: bool = True


@dataclass
class ValidationResult:
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not self.errors

    @property
    def error_codes(self) -> list[str]:
        return [issue.code for issue in self.errors]


def validate_outfit_result(
    outfit: Outfit,
    ctx: RequestContext,
    scene: SceneSpec,
    item_index: dict[str, WardrobeItem],
    policy: ConstraintPolicy | None = None,
) -> ValidationResult:
    """用权威品类和衣橱索引校验整套，返回稳定错误码。"""
    result = ValidationResult()
    policy = policy or build_constraint_policy(ctx, scene)
    band = warmth_band(ctx.weather.temp_c)

    def add(code: str, message: str, retryable: bool = True) -> None:
        if code not in result.error_codes:
            result.errors.append(ValidationIssue(code, message, retryable))

    def warn(code: str) -> None:
        if code not in result.warnings:
            result.warnings.append(code)

    owned_refs: list[str] = []
    categories: list[tuple[object, Category]] = []
    for ref in outfit.items:
        if ref.owned:
            if ref.suggest is not None:
                add("H_GAP_SOURCE_EXPLICIT", "已有单品不能同时携带 gap")
            if not ref.ref or ref.ref not in item_index:
                add("H_OWNED_REF_EXISTS", f"引用了不存在的单品 id: {ref.ref}")
                continue
            owned_refs.append(ref.ref)
            categories.append((ref, item_index[ref.ref].category))
        else:
            if ref.ref or ref.suggest is None:
                add("H_GAP_SOURCE_EXPLICIT", "建议单品必须 owned=false 且提供 gap")
                continue
            categories.append((ref, ref.suggest.category))

    if len(owned_refs) != len(set(owned_refs)):
        add("H_OWNED_REF_UNIQUE", "同一已有单品不能在一套中重复出现")

    def count(category: Category) -> int:
        return sum(1 for _, actual in categories if actual == category)

    n_top = count(Category.TOP)
    n_bottom = count(Category.BOTTOM)
    n_dress = count(Category.DRESS)
    n_feet = count(Category.SHOES)
    n_outer = count(Category.OUTERWEAR)
    n_bag = count(Category.BAG)

    if n_dress:
        if n_dress != 1 or n_top or n_bottom:
            add("H_DRESS_BOTTOM_EXCLUSIVE", "连体装不能再叠上装或普通下装")
    else:
        if n_top < 1:
            add("H_BODY_COVERAGE", f"上身(TORSO)应至少 1 件,实为 {n_top}")
        if n_bottom != 1:
            add("H_BODY_COVERAGE", f"下身(BOTTOM)应恰好 1 件,实为 {n_bottom}")

    if n_feet != 1:
        add("H_FEET_EXACTLY_ONE", f"鞋(FEET)应恰好 1 双,实为 {n_feet}")
    if n_bag > 1:
        add("H_BAG_AT_MOST_ONE", f"包至多 1 个,实为 {n_bag}")

    definite_hats = 0
    for ref, category in categories:
        if category != Category.HAT:
            continue
        if not ref.owned:
            definite_hats += 1
            continue
        facts = build_item_facts(item_index[ref.ref])
        if facts.definite_hat is True:
            definite_hats += 1
        elif facts.definite_hat is None:
            warn("W_HAT_KIND_UNKNOWN")
    if definite_hats > 1:
        add("H_HAT_AT_MOST_ONE", f"帽至多 1 顶,实为 {definite_hats}")

    upper_layers = n_top + n_dress + n_outer
    if not 1 <= upper_layers <= 3:
        add("H_UPPER_LAYER_RANGE", f"上身叠穿应为 1-3 层,实为 {upper_layers}")
    if n_outer > 1:
        add("H_OUTER_AT_MOST_ONE", f"外套(OUTER)至多 1 件,实为 {n_outer}")

    if policy.enforce_weather and policy.enforces("D_WEATHER_COMPAT"):
        if band.outer_required and n_outer == 0:
            add("D_WEATHER_COMPAT", f"{ctx.weather.temp_c}°C 需要外套,但这套没有外套")
        if not band.allow_short_sleeve and n_outer == 0:
            for ref, category in categories:
                if category != Category.TOP or not ref.owned:
                    continue
                item = item_index[ref.ref]
                if item.sleeve in (Sleeve.SHORT, Sleeve.NONE):
                    add("D_WEATHER_COMPAT", "冷天裸穿短/无袖且无外套")
                    break

    facts = [build_item_facts(item_index[ref.ref]) for ref, _ in categories
             if ref.owned and ref.ref in item_index]
    if any(not fact.color_families for fact in facts) or any(not ref.owned for ref, _ in categories):
        warn("W_COLOR_UNKNOWN")
    known_families = frozenset().union(*(fact.color_families for fact in facts)) if facts else frozenset()
    neutral_families = frozenset().union(*(fact.neutral_families for fact in facts)) if facts else frozenset()
    chromatic_families = known_families - neutral_families
    if policy.enforces("D_COLOR_FAMILY_MAX"):
        if len(chromatic_families) > 3 or len(neutral_families) > 2:
            add(
                "D_COLOR_FAMILY_MAX",
                f"彩色家族至多 3 种且中性色家族至多 2 种,实为 {len(chromatic_families)}/{len(neutral_families)}",
            )
    if policy.enforces("D_COLORED_ITEM_MAX"):
        colored_items = sum(bool(fact.color_families - fact.neutral_families) for fact in facts)
        if colored_items > 3:
            add("D_COLORED_ITEM_MAX", f"彩色单品至多 3 件,实为 {colored_items}")
    if policy.enforces("D_FLUORESCENT_MAX"):
        fluorescent_items = sum(fact.fluorescent is True for fact in facts)
        if fluorescent_items > 1:
            add("D_FLUORESCENT_MAX", f"荧光色单品至多 1 件,实为 {fluorescent_items}")

    formalities = [fact.formality_level for fact in facts if fact.formality_level is not None]
    if len(formalities) < len(facts) or any(not ref.owned for ref, _ in categories):
        warn("W_FORMALITY_UNKNOWN")
    if policy.enforces("D_FORMALITY_SPAN") and formalities:
        if max(formalities) - min(formalities) > 1:
            add(
                "D_FORMALITY_SPAN",
                f"单品正式度跨度至多 1 级,实为 L{min(formalities)}-L{max(formalities)}",
            )

    declared_style_list = list(dict.fromkeys(
        normalized for tag in (
            outfit.primary_style,
            outfit.secondary_style,
            *outfit.style_tags,
        )
        if (normalized := normalize_style(tag))
    ))
    declared_styles = frozenset(declared_style_list)
    item_styles = frozenset().union(*(fact.styles for fact in facts)) if facts else frozenset()
    effective_styles = declared_styles or item_styles
    if not effective_styles:
        warn("W_STYLE_UNKNOWN")
    if policy.enforces("D_SCENE_STYLE_POOL") and declared_styles:
        allowed = allowed_styles_for_scene(scene)
        primary = declared_style_list[0]
        if allowed is not None and primary not in allowed:
            add("D_SCENE_STYLE_POOL", f"主风格 {primary} 不在当前场景可用风格池")
    if policy.enforces("D_STYLE_CONFLICT") and has_style_conflict(effective_styles):
        add("D_STYLE_CONFLICT", "同套包含默认互斥风格")

    return result


def validate_outfit(outfit: Outfit, ctx: RequestContext, scene: SceneSpec,
                    item_index: dict[str, WardrobeItem]) -> list[str]:
    """兼容旧调用方：只执行原有绝对守门，返回可读错误字符串。"""
    result = validate_outfit_result(
        outfit, ctx, scene, item_index, policy=ConstraintPolicy.absolute_only()
    )
    return [f"{issue.code}: {issue.message}" for issue in result.errors]
