"""搭配约束策略与可确定的单品事实。

本模块只做纯 code 归一化，不调用模型。事实不确定时返回 ``None``，让依赖
该事实的默认规则降级，而不是用猜测误杀搭配。
"""
from __future__ import annotations

from dataclasses import dataclass

from .contracts import Category, LayerRole, RequestContext, SceneSpec, WardrobeItem


ALL_DEFAULT_RULES = frozenset({
    "D_COLOR_FAMILY_MAX",
    "D_COLORED_ITEM_MAX",
    "D_FLUORESCENT_MAX",
    "D_FORMALITY_SPAN",
    "D_SCENE_STYLE_POOL",
    "D_STYLE_CONFLICT",
    "D_WEATHER_COMPAT",
})


STYLE_ALIASES: dict[str, tuple[str, ...]] = {
    "静奢/老钱": ("静奢/老钱", "静奢老钱", "静奢", "老钱", "quiet_luxury"),
    "极简": ("极简", "minimalist"),
    "通勤职场": ("通勤职场", "职场通勤", "商务", "commute_style"),
    "法式慵懒": ("法式慵懒", "法式", "french"),
    "学院风": ("学院风", "学院", "preppy"),
    "猎装风": ("猎装风", "猎装", "safari"),
    "复古年代": ("复古年代", "复古", "vintage"),
    "街头潮流": ("街头潮流", "街头", "street"),
    "运动机能": ("运动机能", "运动休闲", "sporty_casual"),
    "摇滚机车": ("摇滚机车", "摇滚", "机车", "rock"),
    "哥特暗黑": ("哥特暗黑", "哥特", "暗黑", "goth"),
    "甜美少女": ("甜美少女", "甜美", "sweet"),
    "浪漫田园": ("浪漫田园", "田园", "romantic"),
    "波西米亚/度假": ("波西米亚/度假", "波西米亚", "度假", "bohemian"),
    "西部牛仔": ("西部牛仔", "西部", "western"),
    "工装实用": ("工装实用", "工装", "utility"),
    "日系侘寂": ("日系侘寂", "侘寂", "wabi_sabi"),
    "先锋设计师": ("先锋设计师", "先锋", "avantgarde"),
    "都市酷感": ("都市酷感", "都市", "urban_cool"),
}


STYLE_CONFLICTS = (
    frozenset({"静奢/老钱", "街头潮流"}),
    frozenset({"静奢/老钱", "哥特暗黑"}),
    frozenset({"静奢/老钱", "摇滚机车"}),
    frozenset({"通勤职场", "甜美少女"}),
    frozenset({"通勤职场", "波西米亚/度假"}),
    frozenset({"通勤职场", "运动机能"}),
    frozenset({"日系侘寂", "摇滚机车"}),
    frozenset({"日系侘寂", "哥特暗黑"}),
    frozenset({"法式慵懒", "工装实用"}),
    frozenset({"法式慵懒", "运动机能"}),
    frozenset({"甜美少女", "哥特暗黑"}),
    frozenset({"甜美少女", "摇滚机车"}),
)


SCENE_STYLE_POOLS: dict[str, frozenset[str]] = {
    "通勤": frozenset({"通勤职场", "静奢/老钱", "极简", "都市酷感"}),
    "商务": frozenset({"通勤职场", "静奢/老钱", "极简", "都市酷感"}),
    "约会": frozenset({"法式慵懒", "甜美少女", "都市酷感", "浪漫田园",
                       "日系侘寂", "先锋设计师", "静奢/老钱"}),
    "旅行": frozenset({"波西米亚/度假", "浪漫田园", "法式慵懒", "运动机能",
                       "工装实用", "街头潮流"}),
    "度假": frozenset({"波西米亚/度假", "浪漫田园", "法式慵懒", "运动机能",
                       "工装实用", "街头潮流"}),
    "运动": frozenset({"运动机能", "工装实用", "街头潮流"}),
    "户外": frozenset({"运动机能", "工装实用", "街头潮流"}),
    "正式": frozenset({"静奢/老钱", "极简", "通勤职场", "法式慵懒", "先锋设计师"}),
    "典礼": frozenset({"静奢/老钱", "极简", "通勤职场", "法式慵懒", "先锋设计师"}),
    "面试": frozenset({"静奢/老钱", "极简", "通勤职场", "都市酷感"}),
    "休闲": frozenset({"学院风", "街头潮流", "日系侘寂", "都市酷感", "复古年代",
                       "法式慵懒", "极简", "浪漫田园", "波西米亚/度假"}),
    "居家": frozenset({"学院风", "街头潮流", "日系侘寂", "都市酷感", "复古年代",
                       "法式慵懒", "极简", "浪漫田园", "波西米亚/度假"}),
    "派对": frozenset({"摇滚机车", "哥特暗黑", "街头潮流", "先锋设计师",
                       "都市酷感", "静奢/老钱"}),
}


_NEUTRAL_COLOR_TOKENS: tuple[tuple[str, str], ...] = (
    ("藏青", "navy"), ("海军蓝", "navy"),
    ("米白", "white"), ("白", "white"),
    ("黑", "black"), ("深灰", "gray"), ("浅灰", "gray"), ("灰", "gray"),
    ("裸", "nude"), ("米色", "nude"), ("驼", "nude"), ("卡其", "nude"),
    ("棕", "nude"),
)

_COLOR_TOKENS: tuple[tuple[str, str], ...] = (
    ("荧光黄", "yellow"), ("荧光绿", "green"), ("荧光粉", "pink"),
    ("酒红", "red"), ("红", "red"), ("粉", "pink"),
    ("橙", "orange"), ("黄", "yellow"), ("绿", "green"),
    ("牛仔蓝", "blue"), ("丹宁", "blue"), ("天蓝", "blue"), ("蓝", "blue"),
    ("紫", "purple"),
)


@dataclass(frozen=True)
class ConstraintPolicy:
    overridden_rules: frozenset[str] = frozenset()
    enforce_weather: bool = True
    explicit_styles: frozenset[str] = frozenset()

    def enforces(self, code: str) -> bool:
        return code not in self.overridden_rules

    @classmethod
    def absolute_only(cls) -> "ConstraintPolicy":
        return cls(overridden_rules=ALL_DEFAULT_RULES, enforce_weather=False)


@dataclass(frozen=True)
class ItemFacts:
    layer_capabilities: frozenset[LayerRole]
    color_families: frozenset[str] = frozenset()
    neutral_families: frozenset[str] = frozenset()
    fluorescent: bool | None = None
    formality_level: int | None = None
    styles: frozenset[str] = frozenset()
    definite_hat: bool | None = None


def build_constraint_policy(ctx: RequestContext, scene: SceneSpec) -> ConstraintPolicy:
    """从用户明确文本中提取规则级 override，不接受模型自报的全局放宽。"""
    text = (ctx.query_text or "").lower()
    explicit_styles = set(styles_in_text(text))
    if ctx.filter_tags.style:
        normalized = normalize_style(ctx.filter_tags.style)
        if normalized:
            explicit_styles.add(normalized)

    overridden: set[str] = set()
    if any(term in text for term in ("多彩", "撞色", "彩虹", "全身彩色", "三种以上颜色")):
        overridden.update({"D_COLOR_FAMILY_MAX", "D_COLORED_ITEM_MAX"})
    if "荧光" in text:
        overridden.add("D_FLUORESCENT_MAX")

    formal_signal = any(term in text for term in ("西装", "正装", "正式", "通勤"))
    casual_signal = any(term in text for term in ("运动", "街头", "休闲", "球鞋"))
    if formal_signal and casual_signal:
        overridden.add("D_FORMALITY_SPAN")

    if explicit_styles:
        overridden.add("D_SCENE_STYLE_POOL")
    if any(pair.issubset(explicit_styles) for pair in STYLE_CONFLICTS):
        overridden.add("D_STYLE_CONFLICT")

    ignore_weather = any(term in text for term in (
        "不考虑天气", "不考虑温度", "不用外套", "不怕冷", "室内", "有暖气", "有空调",
    ))
    if ignore_weather:
        overridden.add("D_WEATHER_COMPAT")

    return ConstraintPolicy(
        overridden_rules=frozenset(overridden),
        enforce_weather=not ignore_weather,
        explicit_styles=frozenset(explicit_styles),
    )


def build_item_facts(item: WardrobeItem) -> ItemFacts:
    if item.category == Category.OUTERWEAR:
        layers = frozenset({LayerRole.OUTER})
    elif item.category in (Category.TOP, Category.DRESS):
        layers = frozenset({LayerRole.BASE, LayerRole.MID})
    else:
        layers = frozenset()

    definite_hat: bool | None = False
    if item.category == Category.HAT:
        name = item.subcategory.lower()
        definite_hat = True if any(k in name for k in ("帽", "cap", "beanie")) else None

    color_families: set[str] = set()
    neutral_families: set[str] = set()
    recognized_color = False
    fluorescent = False
    for raw in item.colors:
        color = raw.lower()
        if "荧光" in color:
            fluorescent = True
        for token, family in _NEUTRAL_COLOR_TOKENS:
            if token in color:
                color_families.add(family)
                neutral_families.add(family)
                recognized_color = True
        for token, family in _COLOR_TOKENS:
            if token in color:
                color_families.add(family)
                recognized_color = True

    styles = frozenset(
        normalized for tag in item.style_tags
        if (normalized := normalize_style(tag))
    )
    formality = _formality_level(item, styles)
    fluorescent_fact: bool | None = fluorescent if recognized_color else None

    return ItemFacts(
        layer_capabilities=layers,
        color_families=frozenset(color_families),
        neutral_families=frozenset(neutral_families),
        fluorescent=fluorescent_fact,
        formality_level=formality,
        styles=styles,
        definite_hat=definite_hat,
    )


def normalize_style(value: str) -> str | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    for canonical, aliases in STYLE_ALIASES.items():
        if text == canonical.lower() or any(text == alias.lower() for alias in aliases):
            return canonical
    return None


def styles_in_text(text: str) -> frozenset[str]:
    lowered = (text or "").lower()
    found = {
        canonical
        for canonical, aliases in STYLE_ALIASES.items()
        if any(alias.lower() in lowered for alias in aliases)
    }
    return frozenset(found)


def allowed_styles_for_scene(scene: SceneSpec) -> frozenset[str] | None:
    pools = [SCENE_STYLE_POOLS[occasion] for occasion in scene.occasions
             if occasion in SCENE_STYLE_POOLS]
    if not pools:
        return None
    return frozenset().union(*pools)


def has_style_conflict(styles: frozenset[str]) -> bool:
    return any(pair.issubset(styles) for pair in STYLE_CONFLICTS)


def _formality_level(item: WardrobeItem, styles: frozenset[str]) -> int | None:
    raw_tags = set(item.style_tags) | set(item.occasion_tags)
    name = item.subcategory or ""
    if not name and not raw_tags:
        return None
    if styles & {"街头潮流", "运动机能", "摇滚机车", "哥特暗黑"}:
        return 4
    if any(token in name for token in ("运动鞋", "卫衣", "运动裤")):
        return 4
    if styles & {"静奢/老钱", "通勤职场"} or raw_tags & {"正式", "商务", "晚宴"}:
        return 1
    if any(token in name for token in ("西装", "西服", "礼服")):
        return 1
    if styles & {"极简", "法式慵懒", "日系侘寂", "先锋设计师", "都市酷感", "猎装风"}:
        return 2
    if any(token in name for token in ("衬衫", "风衣", "连衣裙", "乐福", "针织")):
        return 2
    return 3
