"""App JSON ↔ stylee.contracts 双向映射(纯函数,离线可测)。

App 发它原生形状(中文品类/颜色单值/英文标签 ID/Outfit 形状),服务端在这里翻译,
让 App 保持瘦。词表把 App 标签 ID(date/french/…)映射到中文喂 B0/B1。
"""
from __future__ import annotations

import re

from ..contracts import (
    BodyShape, Category, FilterTags, Fit, InputMode, RequestContext,
    Season, Sleeve, UserProfile, WardrobeItem, Weather,
    Outfit, OutfitItemRef, GapSuggestion, RecommendationResult, IngestResult,
    StandardizedImage,
)

_OCCASION = {"commute": "通勤", "date": "约会", "travel": "差旅",
             "casual": "休闲", "work": "正式", "sport": "运动"}
_STYLE = {"korean": "韩系", "sweet": "甜美", "new_chinese": "新中式", "preppy": "学院风",
          "city_chic": "都市", "artsy": "文艺", "sporty_casual": "运动休闲",
          "commute_style": "通勤", "french": "法式", "maillard": "美拉德",
          "japanese": "日系", "business": "商务", "american": "美式", "british": "英伦"}
_COLOR = {"black": "黑色", "white": "白色", "gray": "灰色", "blue": "蓝色",
          "green": "绿色", "warm": "暖色", "morandi": "莫兰迪", "clash": "撞色"}
_TEMP = {"temp_hot": 30.0, "temp_warm": 22.0, "temp_cool": 14.0, "temp_cold": 5.0}


def label(tag_id: str) -> str:
    return _OCCASION.get(tag_id) or _STYLE.get(tag_id) or _COLOR.get(tag_id) or tag_id


def model_category(value: str) -> Category:
    aliases = {
        "连体装": Category.DRESS, "鞋履": Category.SHOES, "包袋": Category.BAG,
        "帽巾": Category.SCARF, "配饰": Category.HAT,
    }
    if value in aliases:
        return aliases[value]
    for c in Category:
        if c.value == value:
            return c
    return Category.TOP


def app_category(cat: Category) -> str:
    return {
        Category.DRESS: "连体装", Category.SHOES: "鞋履", Category.BAG: "包袋",
        Category.HAT: "帽巾", Category.SCARF: "帽巾",
    }.get(cat, cat.value)


_ITEM_TERMS = (
    "牛仔短裤", "牛仔长裤", "牛仔裤", "西装长裤", "半身裙", "连衣裙",
    "针织衫", "防晒衫", "白衬衫", "衬衫", "T恤", "背心", "吊带", "卫衣",
    "毛衣", "上衣", "短裤", "长裤", "阔腿裤", "运动裤", "外套", "夹克",
    "风衣", "西装", "帆布鞋", "运动鞋", "小白鞋", "凉鞋", "拖鞋", "乐福鞋",
    "高跟鞋", "鞋", "托特包", "斜挎包", "双肩包", "包", "草帽", "帽子",
    "丝巾", "围巾", "墨镜", "耳饰", "项链", "手链", "腰带",
)


def compact_recommended_name(value: str, category: Category) -> str:
    """把模型的购买建议句压成适合标签展示的简短单品名。"""
    text = str(value or "").strip()
    text = re.sub(r"^(?:补\s*[:：]?\s*)", "", text)
    text = re.sub(
        r"^(?:建议|推荐|可以|可|请|考虑)?\s*(?:购买|选择|搭配|准备)?\s*"
        r"(?:一件|一条|一双|一个|一顶|一款|一套|一只)?\s*",
        "",
        text,
    )
    text = re.split(r"[，,。；;！!]", text, maxsplit=1)[0].strip()

    # 模型常写“适合海岛度假的浅蓝色牛仔短裤”。从最右侧服饰名向前
    # 最多保留 12 个字，再丢掉最后一个“的”之前的场景修饰语。
    hits = [(text.rfind(term) + len(term), len(term)) for term in _ITEM_TERMS if term in text]
    if hits:
        end, _ = max(hits)
        candidate = text[max(0, end - 12):end]
        if "的" in candidate:
            candidate = candidate.rsplit("的", 1)[-1]
        text = candidate

    text = text.strip(" -—:：·")
    if len(text) > 12:
        text = text[-12:]
        if "的" in text:
            text = text.rsplit("的", 1)[-1]
    return text or app_category(category)


def _enum(enum_cls, value):
    if not value:
        return None
    for e in enum_cls:
        if e.value == value:
            return e
    return None


def wardrobe_item(d: dict) -> WardrobeItem:
    colors = list(d.get("colors") or ([] if not d.get("color") else [d["color"]]))
    seasons = [s for s in (_enum(Season, x) for x in (d.get("season") or [])) if s]
    return WardrobeItem(
        id=str(d.get("item_id") or d.get("id") or ""),
        category=model_category(d.get("category")),
        subcategory=d.get("name", "") or "",
        colors=[c for c in colors if c],
        material=d.get("material", "") or "",
        sleeve=_enum(Sleeve, d.get("sleeve_length")),
        fit=_enum(Fit, d.get("fit") or d.get("fit_type")),
        seasons=seasons,
        style_tags=list(d.get("style_tags") or []),
        occasion_tags=list(d.get("occasion_tags") or []),
        warmth=int(d.get("warmth", 1)),
    )


def to_request_context(payload: dict) -> RequestContext:
    mode = InputMode.TAGS if payload.get("input_mode") == "tags" else InputMode.NL
    wardrobe = [wardrobe_item(x) for x in (payload.get("wardrobe") or [])]

    prof = payload.get("profile") or {}
    profile = UserProfile(
        gender=prof.get("gender", "") or "",
        age=prof.get("age"),
        body_shape=_enum(BodyShape, prof.get("body_shape")),
        skin_tone=prof.get("skin_tone", "") or "",
        height_cm=prof.get("height_cm"),
        style_prefs=list(prof.get("style_prefs") or []),
    )

    w = payload.get("weather") or {}
    weather = Weather(
        temp_c=float(w.get("temp_c", 20.0)),
        condition=w.get("condition", "晴") or "晴",
        city=w.get("city", "") or "",
        time_of_day=w.get("time_of_day", "day") or "day",
    )
    tag_ids = list(payload.get("tags") or [])
    for t in tag_ids:
        if t in _TEMP:
            weather.temp_c = _TEMP[t]

    filter_tags = FilterTags(
        occasion=next((_OCCASION[t] for t in tag_ids if t in _OCCASION), None),
        style=next((_STYLE[t] for t in tag_ids if t in _STYLE), None),
        color=next((_COLOR[t] for t in tag_ids if t in _COLOR), None),
    )

    query = payload.get("query", "") or ""
    if mode == InputMode.NL:
        extra = " ".join(label(t) for t in tag_ids if t not in _TEMP)
        query = (query + " " + extra).strip()

    return RequestContext(
        input_mode=mode, wardrobe=wardrobe, user_profile=profile, weather=weather,
        query_text=query, filter_tags=filter_tags, n=int(payload.get("n", 4)),
    )


def outfits_to_app(result, ctx) -> dict:
    outfits = []
    for i, o in enumerate(result.outfits):
        rec = []
        for it in o.items:
            if not it.owned and it.suggest:
                g = it.suggest
                rec.append({"name": compact_recommended_name(g.desc, g.category),
                            "category": app_category(g.category),
                            "color": "", "description": g.reason})
        outfits.append({
            "name": o.occasion or f"方案{i + 1}",
            "owned_item_ids": o.owned_refs(),
            "recommended_items": rec,
            "comment": o.reasoning or "",
        })
    return {"outfits": outfits,
            "trace": {"rag_mode": result.trace.get("rag_mode", "?"),
                      "pool": result.trace.get("candidate_pool_size", 0)}}


def ingest_to_app(res) -> dict:
    it = res.item
    return {
        "category": app_category(it.category),
        "color": it.colors[0] if it.colors else "",
        "material": it.material or "",
        "style": it.style_tags[0] if it.style_tags else "",
        "brand": (res.raw or {}).get("brand", "") or "",
        "fit_type": it.fit.value if it.fit else None,
        "sleeve_length": it.sleeve.value if it.sleeve else None,
        "season": [s.value for s in it.seasons],
        "occasion_tags": list(it.occasion_tags),
        "photo_type": res.photo_type.value,
        "needs_review": res.needs_review,
        "confidence": res.confidence,
    }


def std_to_app(si) -> dict:
    return {"image_ref": si.image_ref, "method": si.method, "verified": si.verified}
