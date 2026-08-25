"""Stylee 离线搭配评测 harness —— 核心逻辑。

本模块只做“调用既有 model-service + 组织输入输出”，不修改 model-service 源码。
调用路径与生产 server.py 完全一致：
    adapter.to_request_context(payload) -> pipeline.recommend(ctx, provider, retriever)
区别仅在于：eval 直接消费 RecommendationResult 里的 Outfit 结构（含 slot→item_id、
理由、四维分），比 App 侧 outfits_to_app 更细，便于制评审表。
"""
from __future__ import annotations

import json
import os
import re
import sys

# 让 eval/ 目录能 import 到 model-service 的 stylee 包（eval/ 是 model-service 的子目录）
_MODEL_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _MODEL_SERVICE_DIR not in sys.path:
    sys.path.insert(0, _MODEL_SERVICE_DIR)

from stylee.service import adapter          # noqa: E402
from stylee.pipeline import recommend       # noqa: E402
from stylee.providers import build_provider, ProviderError  # noqa: E402
from stylee.contracts import Slot, Category  # noqa: E402

try:
    from stylee.rag import default_retriever  # noqa: E402
except Exception:  # pragma: no cover
    default_retriever = None


# ---------------------------------------------------------------------------
# 评审表槽位列（左侧搭配信息按此顺序展开）
# ---------------------------------------------------------------------------
SLOT_COLUMNS = ["上装", "下装", "外套", "鞋", "包", "配饰"]

# query.style / profile_variant 的中文标签 → model-service 认识的风格偏好 token
# （对齐 mock 的 _STYLE_KW 与 outfit_policy.STYLE_ALIASES）
_STYLE_PREF_MAP = {
    "简约极简": ["极简"],
    "法式复古": ["法式", "复古"],
    "静奢老钱风": ["静奢老钱"],
    "街头": ["街头"],
    "甜美": ["甜美"],
    "通勤知性": ["通勤", "商务"],
    "运动机能": ["运动休闲"],
    "波西米亚度假": ["波西米亚", "度假"],
    "学院": ["学院风"],
    "中性帅气": ["都市"],
    "优雅正式": ["通勤", "商务"],
    # profile_variant 常见写法
    "偏好简约极简": ["极简"],
    "偏好法式复古": ["法式", "复古"],
    "偏好静奢老钱风": ["静奢老钱"],
    "偏好街头潮流": ["街头"],
    "偏好中性帅气": ["都市"],
    "偏好甜美少女": ["甜美"],
    "偏好波西米亚度假": ["波西米亚", "度假"],
    "偏好运动机能": ["运动休闲"],
    "偏好莫兰迪低饱和": ["莫兰迪"],
    "偏好暖色调大地色": ["美拉德"],
}

_BODY_SHAPE_MAP = [
    ("梨形", "梨形"), ("苹果形", "苹果形"), ("沙漏", "沙漏形"),
    ("矩形", "矩形"), ("倒三角", "倒三角"),
]


# ---------------------------------------------------------------------------
# 输入构造：query（结构化）→ model-service /recommend 的 App JSON payload
# ---------------------------------------------------------------------------
def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_temp(temp_range: str, text: str) -> float:
    """从 temp_range 字符串抽取代表温度（取区间平均）。

    需正确区分“区间分隔符 -”与“负号 -”：
      "10-20℃"->[10,20]  "28-35℃"->[28,35]  "-5~8℃"->[-5,8]
      "8-22℃"->[8,22]    "26℃(空调房)"->[26]
    做法：只取 ℃/( 之前的部分，把 ~ 归一为 -，再用『前一个字符不是数字才允许负号』的正则取数。
    """
    head = re.split(r"[℃°(（]", temp_range or "", maxsplit=1)[0]
    head = head.replace("~", "-").replace("～", "-").replace("至", "-")
    nums = re.findall(r"(?<!\d)(-?\d+)", head)
    vals = [int(n) for n in nums]
    if not vals:
        return 20.0
    return round(sum(vals) / len(vals), 1)


def infer_time_of_day(text: str) -> str:
    if "夜" in text:
        return "night"
    if "晚" in text:
        return "evening"
    return "day"


def infer_condition(text: str) -> str:
    for token in ("雪", "雨", "阴"):
        if token in text:
            return token
    return "晴"


def build_profile(query: dict) -> dict:
    """构造用户画像。

    身材/身高走**结构化字段优先**（``body_shape``/``height_cm``），文本关键词兜底。
    这样 query 的 ``text`` 可以写成口语（不必把“梨形/苹果形”这种体型学名硬塞进句子），
    而体型仍然经 ``profile.body_shape`` 稳定注入模型上下文——与生产“画像来自用户资料”一致。
    """
    text = query.get("text", "") or ""
    prefs: list[str] = []
    for key in (query.get("style") or "", query.get("profile_variant") or ""):
        for token in _STYLE_PREF_MAP.get(key, []):
            if token not in prefs:
                prefs.append(token)

    profile: dict = {"gender": query.get("gender", "") or "", "style_prefs": prefs}

    # 体型：结构化字段优先，文本关键词兜底（兼容旧题）
    body_shape = (query.get("body_shape") or "").strip()
    if not body_shape:
        for token, shape in _BODY_SHAPE_MAP:
            if token in text:
                body_shape = shape
                break
    if body_shape:
        profile["body_shape"] = body_shape

    # 肤色：结构化字段直传（模型据此做颜色避雷打分，见 scoring._SKIN_AVOID）
    skin_tone = (query.get("skin_tone") or "").strip()
    if skin_tone:
        profile["skin_tone"] = skin_tone

    # 身高：结构化字段优先，文本“显高/矮个”兜底
    height_cm = query.get("height_cm")
    if height_cm is None and any(k in text for k in ("显高", "个子矮", "矮个")):
        height_cm = 158
    if height_cm is not None:
        profile["height_cm"] = height_cm
    return profile


def compose_model_query(query: dict) -> str:
    """把口语化 ``text`` 拼成实际下发模型的 query_text。

    生产里，色系偏好来自用户画像/标签而非用户逐字说出；本 harness 无独立色系上下文槽，
    故把结构化 ``color_system`` 作为“偏好色系”后缀拼进 query（等价于 adapter 对 tags 的
    label 追加行为），保证：
      1) 题面 ``text`` 保持自然口语、不把配色代号写死进句子；
      2) 色系仍进入模型上下文，且“撞色/多彩/荧光”等规则级 override 触发词不丢失。
    """
    text = (query.get("text", "") or "").strip()
    color_system = (query.get("color_system") or "").strip()
    if color_system:
        text = f"{text}（偏好{color_system}色系）" if text else f"偏好{color_system}色系"
    return text


def build_payload(query: dict, catalog: list[dict], n: int = 4) -> dict:
    """把一条结构化 query + 单品池，翻译成 model-service /recommend 的 App JSON。"""
    raw_text = query.get("text", "") or ""
    model_query = compose_model_query(query)
    temp_c = parse_temp(query.get("temp_range", ""), raw_text)
    payload = {
        "input_mode": "nl",
        "query": model_query,
        "n": n,
        "wardrobe": catalog,
        "profile": build_profile(query),
        "weather": {
            "temp_c": temp_c,
            "condition": infer_condition(raw_text),
            "city": "",
            "time_of_day": infer_time_of_day(raw_text),
        },
    }
    return payload


# ---------------------------------------------------------------------------
# 调用：in-process 复用 pipeline（与 server 的 /recommend 同一条链路）
# ---------------------------------------------------------------------------
_RETRIEVER = None
_RETRIEVER_READY = False


def _get_retriever():
    global _RETRIEVER, _RETRIEVER_READY
    if _RETRIEVER_READY:
        return _RETRIEVER
    _RETRIEVER_READY = True
    if default_retriever is not None:
        try:
            _RETRIEVER = default_retriever()
        except Exception:
            _RETRIEVER = None
    return _RETRIEVER


def make_provider(name: str):
    """构造 provider；deepseek/qwen 缺 key 会抛 ProviderError（调用方决定是否回退）。"""
    return build_provider(name)


def run_one(query: dict, catalog: list[dict], provider, n: int = 4):
    """对单条 query 跑一次推荐，返回 (payload, ctx, RecommendationResult)。"""
    payload = build_payload(query, catalog, n=n)
    ctx = adapter.to_request_context(payload)
    result = recommend(ctx, provider, _get_retriever())
    return payload, ctx, result


# ---------------------------------------------------------------------------
# 输出抽取：Outfit -> slot→item 结构（供 jsonl / 评审表）
# ---------------------------------------------------------------------------
def catalog_index(catalog: list[dict]) -> dict[str, dict]:
    idx = {}
    for it in catalog:
        key = str(it.get("item_id") or it.get("id") or "")
        if key:
            idx[key] = it
    return idx


def _display_name(item: dict) -> str:
    return item.get("name") or item.get("subcategory") or item.get("category") or "?"


def _slot_column_for(role: Slot, category_value: str) -> str:
    """把 (slot, 品类) 落到评审表的 6 个展示列之一。"""
    if role == Slot.TORSO:
        return "上装"          # 连衣裙也放上装列，另在下装列标注
    if role == Slot.BOTTOM:
        return "下装"
    if role == Slot.OUTER:
        return "外套"
    if role == Slot.FEET:
        return "鞋"
    if role == Slot.ACCESSORY:
        return "包" if category_value in ("包", "包袋") else "配饰"
    return "配饰"


def extract_outfit(outfit, cat_idx: dict[str, dict]) -> dict:
    """把 Outfit 转成评测友好的结构：slot 列表 + 展示列映射 + 理由 + 分数。"""
    slots = []           # 明细：每个 slot 选了什么
    columns = {col: [] for col in SLOT_COLUMNS}
    has_dress = False

    for ref in outfit.items:
        role = ref.role
        if ref.owned and ref.ref:
            item = cat_idx.get(ref.ref, {})
            cat_value = item.get("category", "")
            name = _display_name(item)
            if cat_value in ("连衣裙", "连体装"):
                has_dress = True
            slots.append({
                "slot": role.value,
                "owned": True,
                "item_id": ref.ref,
                "name": name,
                "category": cat_value,
                "colors": item.get("colors") or ([item["color"]] if item.get("color") else []),
            })
            columns[_slot_column_for(role, cat_value)].append(f"{name}({ref.ref})")
        elif ref.suggest is not None:
            g = ref.suggest
            cat_value = g.category.value
            slots.append({
                "slot": role.value,
                "owned": False,
                "item_id": None,
                "name": g.desc,
                "category": cat_value,
                "reason": g.reason,
                "gap": True,
            })
            columns[_slot_column_for(role, cat_value)].append(f"补:{g.desc}(建议购买)")

    if has_dress and not columns["下装"]:
        columns["下装"].append("（连衣裙一体覆盖）")

    display = {col: " / ".join(v) if v else "—" for col, v in columns.items()}
    scores = outfit.scores
    return {
        "slots": slots,
        "display_columns": display,
        "reasoning": outfit.reasoning,
        "primary_style": outfit.primary_style,
        "secondary_style": outfit.secondary_style,
        "occasion": outfit.occasion,
        "confidence": outfit.confidence,
        "scores": {
            "body_fit": scores.body_fit,
            "occasion": scores.occasion,
            "style_coherence": scores.style_coherence,
            "color_harmony": scores.color_harmony,
        },
    }
