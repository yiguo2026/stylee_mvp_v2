"""MockProvider —— 不打真模型的占位实现。

输出"结构真实但内容是规则拼的"搭配,目的是把 B0–B6 整条链路 + 评测今天就跑通。
key 到位后,换成 DeepseekProvider / QwenProvider 即出真审美结果,pipeline 不动。

刻意保持"哑":B0 用关键词映射,B3 从候选池按槽位轮转拼装(尊重槽位逻辑),
真正的审美质量留给真模型;这里只验证管线、约束、打分、评测是否成立。
"""
from __future__ import annotations

from ..contracts import (
    Category,
    Formality,
    GapSuggestion,
    InputMode,
    Outfit,
    OutfitItemRef,
    RequestContext,
    SceneSpec,
    Slot,
    WardrobeItem,
)
from ..constraints import CandidatePool, covers_bottom
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
        tops = [i for i in torsos if not covers_bottom(i)]
        dresses = [i for i in torsos if covers_bottom(i)]
        bottoms = pool.get(Slot.BOTTOM)
        shoes = pool.get(Slot.FEET)
        outers = pool.get(Slot.OUTER)
        accs = pool.get(Slot.ACCESSORY)

        # 上身候选 = 上装 + 连衣裙,轮转保证多样
        torso_choices = tops + dresses
        outfits: list[Outfit] = []
        exemplar_style = ""
        if exemplars:
            exemplar_style = "、".join(exemplars[0].get("style_keywords", [])[:2])

        for i in range(k):
            items: list[OutfitItemRef] = []
            style_tags: set[str] = set()
            picked: list[WardrobeItem] = []

            # 上身(含连衣裙判定)
            if torso_choices:
                t = torso_choices[i % len(torso_choices)]
                items.append(OutfitItemRef(role=Slot.TORSO, ref=t.id, owned=True))
                picked.append(t)
                style_tags.update(t.style_tags)
                is_dress = covers_bottom(t)
            else:
                cat, desc = _gap_desc(Slot.TORSO)
                items.append(OutfitItemRef(role=Slot.TORSO, owned=False,
                             suggest=GapSuggestion(cat, desc, f"衣橱缺{scene.vibe}的上身")))
                is_dress = False

            # 下身(连衣裙则跳过)
            if not is_dress:
                if bottoms:
                    b = bottoms[i % len(bottoms)]
                    items.append(OutfitItemRef(role=Slot.BOTTOM, ref=b.id, owned=True))
                    picked.append(b)
                    style_tags.update(b.style_tags)
                else:
                    cat, desc = _gap_desc(Slot.BOTTOM)
                    items.append(OutfitItemRef(role=Slot.BOTTOM, owned=False,
                                 suggest=GapSuggestion(cat, desc, "衣橱缺合适下装")))

            # 鞋
            if shoes:
                s = shoes[i % len(shoes)]
                items.append(OutfitItemRef(role=Slot.FEET, ref=s.id, owned=True))
                picked.append(s)
                style_tags.update(s.style_tags)
            else:
                cat, desc = _gap_desc(Slot.FEET)
                items.append(OutfitItemRef(role=Slot.FEET, owned=False,
                             suggest=GapSuggestion(cat, desc, "衣橱缺合脚的鞋")))

            # 外套:冷天必加;否则隔套加一件做层次
            if outers and (pool.band.outer_required or i % 2 == 1):
                o = outers[i % len(outers)]
                items.append(OutfitItemRef(role=Slot.OUTER, ref=o.id, owned=True))
                picked.append(o)
                style_tags.update(o.style_tags)

            # 配饰:点缀一件
            if accs:
                a = accs[i % len(accs)]
                items.append(OutfitItemRef(role=Slot.ACCESSORY, ref=a.id, owned=True))
                picked.append(a)

            reason = self._reason(scene, picked, exemplar_style, ctx)
            outfits.append(Outfit(
                items=items,
                style_tags=list(style_tags)[:3],
                occasion=scene.occasions[0] if scene.occasions else "日常",
                reasoning=reason,
            ))
        return outfits

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
