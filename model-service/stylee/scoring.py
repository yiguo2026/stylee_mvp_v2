"""软·审美打分(四维),对照设计稿"约束三层"的第三层。

四维:body_fit / occasion / style_coherence / color_harmony,各 0-1。
加权按你的决策优先级:身材修饰 > 场景适配 > 风格塑造 > 色彩适配。

这些是"倾向"不是"禁止"(硬约束在 constraints.py)。能 code 算的都 code 算,
模型只在 confidence 那层兜品味(见 pipeline B6)。
"""
from __future__ import annotations

from .contracts import (
    BodyShape,
    Category,
    Fit,
    Formality,
    Outfit,
    OutfitScores,
    RequestContext,
    SceneSpec,
    Slot,
    WardrobeItem,
)

# 优先级权重(和为 1)
PRIORITY_WEIGHTS = {
    "body_fit": 0.35,
    "occasion": 0.30,
    "style_coherence": 0.20,
    "color_harmony": 0.15,
}


# ---------------------------------------------------------------------------
# 颜色:名 → HSL(h:0-360, s:0-1, l:0-1)+ 中性判定
# ---------------------------------------------------------------------------
_NEUTRALS = {"白色", "米白", "米色", "黑色", "灰色", "深灰", "浅灰", "驼色",
             "卡其", "棕色", "藏青", "海军蓝", "牛仔蓝", "丹宁"}

_COLOR_HSL: dict[str, tuple[float, float, float]] = {
    "白色": (0, 0, 0.98), "米白": (40, 0.15, 0.92), "米色": (40, 0.25, 0.85),
    "黑色": (0, 0, 0.05), "灰色": (0, 0, 0.5), "深灰": (0, 0, 0.3), "浅灰": (0, 0, 0.75),
    "驼色": (33, 0.45, 0.6), "卡其": (45, 0.35, 0.55), "棕色": (25, 0.5, 0.35),
    "藏青": (220, 0.6, 0.25), "海军蓝": (220, 0.6, 0.3), "牛仔蓝": (210, 0.45, 0.5),
    "丹宁": (210, 0.45, 0.5), "蓝色": (210, 0.7, 0.5), "天蓝": (200, 0.6, 0.7),
    "红色": (0, 0.75, 0.5), "酒红": (345, 0.6, 0.3), "粉色": (340, 0.6, 0.8),
    "绿色": (130, 0.6, 0.45), "墨绿": (150, 0.5, 0.25), "黄色": (50, 0.85, 0.6),
    "荧光黄": (60, 1.0, 0.6), "荧光绿": (110, 1.0, 0.6), "橙色": (28, 0.85, 0.55),
    "紫色": (275, 0.5, 0.5),
}

# 黄黑皮近脸要避的色(荧光、亮黄绿、明橙)——简化避雷表
_SKIN_AVOID = {
    "黄黑皮": {"荧光黄", "荧光绿", "黄色", "橙色"},
}


def _hsl(color: str) -> tuple[float, float, float] | None:
    return _COLOR_HSL.get(color)


def _hue_dist(h1: float, h2: float) -> float:
    d = abs(h1 - h2) % 360
    return min(d, 360 - d)


def _pair_harmony(c1: str, c2: str) -> float:
    """两色和谐度 0-1。中性配任何色都和谐。"""
    if c1 in _NEUTRALS or c2 in _NEUTRALS:
        return 1.0
    a, b = _hsl(c1), _hsl(c2)
    if a is None or b is None:
        return 0.7  # 未知色给中性偏好分
    d = _hue_dist(a[0], b[0])
    if d <= 35:            # 邻近色
        return 0.95
    if 150 <= d <= 210:    # 互补色
        return 0.85
    if 90 <= d < 150 or 210 < d <= 270:  # 三角/分裂互补,尚可
        return 0.6
    return 0.35            # 其余视为撞色


def score_color_harmony(items: list[WardrobeItem], skin_tone: str) -> float:
    colors: list[str] = []
    for it in items:
        colors.extend(it.colors[:1])  # 每件取主色
    colors = [c for c in colors if c]
    if len(colors) < 2:
        base = 1.0
    else:
        pairs = [(colors[i], colors[j])
                 for i in range(len(colors)) for j in range(i + 1, len(colors))]
        base = sum(_pair_harmony(a, b) for a, b in pairs) / len(pairs)

    # 肤色避雷:近脸(上身/外套)出现避雷色则扣分
    avoid = _SKIN_AVOID.get(skin_tone, set())
    if avoid:
        for it in items:
            if it.slot in (Slot.TORSO, Slot.OUTER):
                if set(it.colors) & avoid:
                    base *= 0.6
                    break
    return round(base, 3)


# ---------------------------------------------------------------------------
# 风格一致性:撞车扣分
# ---------------------------------------------------------------------------
_STYLE_CLASH = [
    {"运动休闲", "正式"}, {"运动休闲", "商务"}, {"运动休闲", "法式"},
    {"甜美", "商务"}, {"学院风", "性感"}, {"新中式", "运动休闲"},
]


def score_style_coherence(items: list[WardrobeItem]) -> float:
    tags: list[set[str]] = [set(it.style_tags) for it in items if it.style_tags]
    if len(tags) < 2:
        return 1.0
    penalty = 0.0
    comparisons = 0
    for i in range(len(tags)):
        for j in range(i + 1, len(tags)):
            comparisons += 1
            for clash in _STYLE_CLASH:
                if (tags[i] & clash) and (tags[j] & clash) and not (tags[i] & tags[j]):
                    penalty += 1
                    break
    if comparisons == 0:
        return 1.0
    return round(max(0.0, 1.0 - penalty / comparisons), 3)


# ---------------------------------------------------------------------------
# 场合适配:单品场合标签与场景重合 + 正式度对齐
# ---------------------------------------------------------------------------
_FORMALITY_RANK = {Formality.CASUAL: 0, Formality.SMART_CASUAL: 1, Formality.FORMAL: 2}

# 正式度信号(标签)
_FORMAL_SIG = {"正式", "商务", "晚宴"}                          # → 可达正式(2)
_SMART_SIG = {"通勤", "约会", "聚会", "法式", "学院风", "英伦"}   # → 可达半正式(1)
_CASUAL_SIG = {"运动", "运动休闲", "居家"}                      # → 仅休闲(0,强信号)
# 正装潜力品类:子类含这些词,即使没打正式标签也能往上够
_FORMAL_SUBCAT = ("西装", "西服")                              # → 2
_SMART_SUBCAT = ("衬衫", "风衣", "连衣裙", "乐福", "针织")        # → 1


def _item_formality_ceiling(it: WardrobeItem) -> int:
    """单品"能撑到多正式"的上限:0 休闲 / 1 半正式 / 2 正式。"""
    tags = set(it.style_tags) | set(it.occasion_tags)
    sc = it.subcategory or ""
    # 强休闲信号(运动/居家):压死在休闲,品类潜力也救不回来
    if tags & _CASUAL_SIG:
        return 0
    if (tags & _FORMAL_SIG) or any(k in sc for k in _FORMAL_SUBCAT):
        return 2
    if (tags & _SMART_SIG) or any(k in sc for k in _SMART_SUBCAT):
        return 1
    return 0


def _formality_fit(ceiling: int, target: int) -> float:
    """非对称:撑不起场合(太休闲)重罚;过于正式只轻罚。"""
    gap = target - ceiling
    if gap == 0:
        return 1.0
    if gap == 1:          # 差一档撑不起
        return 0.55
    if gap >= 2:          # 明显太休闲(如运动裤配正式)
        return 0.2
    if gap == -1:         # 略偏正式
        return 0.9
    return 0.75           # 过于正式较多


def score_occasion(items: list[WardrobeItem], scene: SceneSpec) -> float:
    """正式度匹配为主(非对称),explicit 场合标签命中只作小幅加分,不再当硬门槛。"""
    if not items:
        return 1.0
    target = _FORMALITY_RANK[scene.formality]
    fits = [_formality_fit(_item_formality_ceiling(it), target) for it in items]
    form = sum(fits) / len(fits)
    # 锦上添花:explicit occasion 命中给小幅加成
    if scene.occasions:
        hit = sum(1 for it in items if set(it.occasion_tags) & set(scene.occasions))
        form += 0.1 * (hit / len(items))
    return round(min(1.0, form), 3)


# ---------------------------------------------------------------------------
# 身材修饰:版型 vs 体型规则
# ---------------------------------------------------------------------------
def score_body_fit(items: list[WardrobeItem], body: BodyShape | None) -> float:
    if body is None:
        return 0.8  # 无体型信息给中性偏好分
    scores = []
    for it in items:
        s = 0.8
        fit = it.fit
        if body == BodyShape.PEAR:  # 梨形:下宽上合身
            if it.slot == Slot.BOTTOM:
                s = 0.95 if fit in (Fit.LOOSE, Fit.STANDARD) else 0.45 if fit == Fit.TIGHT else 0.7
            elif it.category == Category.DRESS:
                s = 0.9 if fit in (Fit.STANDARD, Fit.LOOSE) else 0.6
            elif it.slot == Slot.TORSO:
                s = 0.9 if fit in (Fit.SLIM, Fit.STANDARD) else 0.65
        elif body == BodyShape.APPLE:  # 苹果形:上身飘逸避免勒腰
            if it.slot == Slot.TORSO:
                s = 0.9 if fit in (Fit.LOOSE, Fit.STANDARD) else 0.45 if fit == Fit.TIGHT else 0.7
        elif body == BodyShape.INVERTED:  # 倒三角:下身加量平衡肩
            if it.slot == Slot.BOTTOM:
                s = 0.9 if fit in (Fit.LOOSE, Fit.STANDARD) else 0.6
        elif body == BodyShape.RECTANGLE:  # 矩形:制造曲线,修身略加分
            if fit in (Fit.SLIM, Fit.STANDARD):
                s = 0.85
        elif body == BodyShape.HOURGLASS:  # 沙漏:修身展现曲线
            s = 0.9 if fit in (Fit.SLIM, Fit.STANDARD) else 0.7
        scores.append(s)
    return round(sum(scores) / len(scores), 3) if scores else 0.8


# ---------------------------------------------------------------------------
# 汇总
# ---------------------------------------------------------------------------
def score_outfit(outfit: Outfit, ctx: RequestContext, scene: SceneSpec,
                 item_index: dict[str, WardrobeItem]) -> OutfitScores:
    items = [item_index[it.ref] for it in outfit.items
             if it.owned and it.ref in item_index]
    return OutfitScores(
        body_fit=score_body_fit(items, ctx.user_profile.body_shape),
        occasion=score_occasion(items, scene),
        style_coherence=score_style_coherence(items),
        color_harmony=score_color_harmony(items, ctx.user_profile.skin_tone),
    )


def has_style_clash(outfit: Outfit, item_index: dict[str, WardrobeItem]) -> bool:
    """评测用:这套是否存在风格撞车。"""
    items = [item_index[it.ref] for it in outfit.items
             if it.owned and it.ref in item_index]
    return score_style_coherence(items) < 1.0
