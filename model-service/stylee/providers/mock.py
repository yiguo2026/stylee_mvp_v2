"""MockProvider —— 不打真模型的占位实现。

输出"结构真实但内容是规则拼的"搭配,目的是把 B0–B6 整条链路 + 评测今天就跑通。
key 到位后,换成 DeepseekProvider / QwenProvider 即出真审美结果,pipeline 不动。

刻意保持"哑":B0 用关键词映射,B3 从候选池按槽位轮转拼装(尊重槽位逻辑),
真正的审美质量留给真模型;这里只验证管线、约束、打分、评测是否成立。
"""
from __future__ import annotations

from copy import deepcopy
from itertools import product

from ..contracts import (
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
)
from ..constraints import CandidatePool, covers_bottom, validate_outfit_result
from ..outfit_policy import build_constraint_policy
from .base import LLMProvider


# 关键词 → 场景属性(模拟 B0 模型的意图理解)
_OCCASION_KW = {
    "通勤": ["通勤"], "上班": ["通勤"], "约会": ["约会"], "聚会": ["聚会"],
    "面试": ["正式"], "差旅": ["差旅"], "运动": ["运动"], "居家": ["居家"],
    "旅行": ["差旅"], "逛街": ["休闲"], "周末": ["休闲"],
}
_STYLE_KW = ["韩系", "甜美", "新中式", "学院风", "都市", "文艺", "运动休闲",
             "通勤", "法式", "美拉德", "日系", "商务", "美式", "英伦"]
_FORMAL_KW = {
    Formality.FORMAL: ["正式", "面试", "商务", "晚宴"],
    Formality.SMART_CASUAL: ["通勤", "约会", "聚会"],
}


def _gap_desc(slot: Slot) -> tuple[Category, str]:
    return {
        Slot.TORSO: (Category.TOP, "百搭基础上衣"),
        Slot.BOTTOM: (Category.BOTTOM, "直筒长裤"),
        Slot.FEET: (Category.SHOES, "小白鞋"),
        Slot.OUTER: (Category.OUTERWEAR, "基础保暖外套"),
    }.get(slot, (Category.TOP, "基础单品"))


class MockProvider(LLMProvider):
    name = "mock"

    # ----- B0 -----
    def parse_intent(self, ctx: RequestContext) -> SceneSpec:
        if ctx.input_mode == InputMode.TAGS:
            # 标签路径:code 直接映射,无需"模型"
            ft = ctx.filter_tags
            occasions = _OCCASION_KW.get(ft.occasion or "", [ft.occasion] if ft.occasion else [])
            styles = [ft.style] if ft.style else []
            avoids = []
            formality = Formality.CASUAL
            for f, kws in _FORMAL_KW.items():
                if ft.occasion in kws:
                    formality = f
            return SceneSpec(
                occasions=[o for o in occasions if o],
                formality=formality,
                style_keywords=styles,
                hard_avoids=avoids,
                vibe=f"标签:{ft.occasion or ''} {ft.style or ''} {ft.color or ''}".strip(),
            )

        # NL 路径:关键词抽取(模拟模型解析)
        text = ctx.query_text
        occasions: list[str] = []
        for kw, occ in _OCCASION_KW.items():
            if kw in text:
                occasions.extend(occ)
        styles = [s for s in _STYLE_KW if s in text]
        formality = Formality.CASUAL
        for f, kws in _FORMAL_KW.items():
            if any(k in text for k in kws):
                formality = f
        return SceneSpec(
            occasions=list(dict.fromkeys(occasions)),
            formality=formality,
            style_keywords=styles or list(ctx.user_profile.style_prefs[:1]),
            hard_avoids=[],
            vibe=text or "日常",
        )

    # ----- B3 -----
    def generate_outfits(self, ctx, scene, pool: CandidatePool, exemplars, k) -> list[Outfit]:
        torsos = pool.get(Slot.TORSO)
        bottoms = pool.get(Slot.BOTTOM)
        shoes = pool.get(Slot.FEET)
        outers = pool.get(Slot.OUTER)
        exemplar_style = ""
        if exemplars:
            exemplar_style = "、".join(exemplars[0].get("style_keywords", [])[:2])

        # Mock 同样受生产校验约束：穷举小候选池，保留合法模板后再按需循环填满 k。
        # 这样评测测到的是 prompt/管线质量，而不是旧轮转器制造的已知非法草稿。
        torso_choices: list[WardrobeItem | None] = list(torsos) or [None]
        shoe_choices: list[WardrobeItem | None] = list(shoes) or [None]
        if pool.band.outer_required:
            outer_choices: list[WardrobeItem | None] = list(outers) or [None]
        else:
            outer_choices = [None, *outers]

        idx = {item.id: item for item in ctx.wardrobe}
        policy = build_constraint_policy(ctx, scene)
        templates: list[Outfit] = []
        for torso in torso_choices:
            is_dress = bool(torso and covers_bottom(torso))
            bottom_choices: list[WardrobeItem | None] = (
                [None] if is_dress else (list(bottoms) or [None])
            )
            for bottom, shoe, outer in product(bottom_choices, shoe_choices, outer_choices):
                items: list[OutfitItemRef] = []
                picked: list[WardrobeItem] = []

                if torso:
                    items.append(OutfitItemRef(
                        role=Slot.TORSO,
                        ref=torso.id,
                        owned=True,
                        layer_role=LayerRole.BASE,
                    ))
                    picked.append(torso)
                else:
                    cat, desc = _gap_desc(Slot.TORSO)
                    items.append(OutfitItemRef(
                        role=Slot.TORSO,
                        owned=False,
                        layer_role=LayerRole.BASE,
                        suggest=GapSuggestion(cat, desc, f"衣橱缺{scene.vibe}的上身"),
                    ))

                if not is_dress:
                    if bottom:
                        items.append(OutfitItemRef(
                            role=Slot.BOTTOM, ref=bottom.id, owned=True,
                        ))
                        picked.append(bottom)
                    else:
                        cat, desc = _gap_desc(Slot.BOTTOM)
                        items.append(OutfitItemRef(
                            role=Slot.BOTTOM,
                            owned=False,
                            suggest=GapSuggestion(cat, desc, "衣橱缺合适下装"),
                        ))

                if shoe:
                    items.append(OutfitItemRef(role=Slot.FEET, ref=shoe.id, owned=True))
                    picked.append(shoe)
                else:
                    cat, desc = _gap_desc(Slot.FEET)
                    items.append(OutfitItemRef(
                        role=Slot.FEET,
                        owned=False,
                        suggest=GapSuggestion(cat, desc, "衣橱缺合脚的鞋"),
                    ))

                if outer:
                    items.append(OutfitItemRef(
                        role=Slot.OUTER,
                        ref=outer.id,
                        owned=True,
                        layer_role=LayerRole.OUTER,
                    ))
                    picked.append(outer)
                elif pool.band.outer_required:
                    cat, desc = _gap_desc(Slot.OUTER)
                    items.append(OutfitItemRef(
                        role=Slot.OUTER,
                        owned=False,
                        layer_role=LayerRole.OUTER,
                        suggest=GapSuggestion(cat, desc, "当前温度需要外套"),
                    ))

                candidate = Outfit(
                    items=items,
                    occasion=scene.occasions[0] if scene.occasions else "日常",
                    reasoning=self._reason(scene, picked, exemplar_style, ctx),
                )
                if validate_outfit_result(candidate, ctx, scene, idx, policy=policy).valid:
                    templates.append(candidate)

        if not templates:
            return []
        return [deepcopy(templates[i % len(templates)]) for i in range(k)]

    @staticmethod
    def _reason(scene, picked, exemplar_style, ctx) -> str:
        names = "+".join(f"{p.colors[0] if p.colors else ''}{p.subcategory or p.category.value}"
                         for p in picked)
        bits = [f"{ctx.weather.temp_c:.0f}°C{ctx.weather.condition}"]
        if scene.occasions:
            bits.append(scene.occasions[0])
        if exemplar_style:
            bits.append(f"参考{exemplar_style}")
        return f"[{' / '.join(bits)}] {names}"
