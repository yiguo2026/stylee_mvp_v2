"""触点 A 识别/回验的 prompt 构造 + JSON 解析(纯函数,离线可测)。

对标 providers/openai_compat.py:把 prompt 与解析拆成纯函数,无网络也能测。
图片以 image_url 传入(data: 或 http:),qwen-vl 两者都接受。
"""
from __future__ import annotations

from ..providers.openai_compat import _extract_json   # 复用容错 JSON 解析,避免重复

RECOGNIZE_SCHEMA = (
    '{"category":"上装|下装|连衣裙|外套|鞋|包|帽子|围巾",'
    '"colors":["颜色"],"material":"材质","sleeve":"无袖|短袖|长袖|null",'
    '"fit":"紧身|修身|标准|宽松|oversize|null","seasons":["春|夏|秋|冬"],'
    '"style_tags":["风格"],"occasion_tags":["场合"],'
    '"photo_type":"flatlay|on_body|web|angled","brand":""}'
)


def _img_messages(system: str, user_text: str, image_url: str) -> list[dict]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": [
            {"type": "text", "text": user_text},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]},
    ]


def build_recognize_messages(image_url: str) -> list[dict]:
    system = ("你是服装属性识别器。识别图中这件衣物的属性,只输出 JSON,schema:"
              + RECOGNIZE_SCHEMA +
              "。category/photo_type 必须从给定枚举里选;颜色用中文颜色名;拿不准的字段填 null 或空。")
    return _img_messages(system, "识别这件衣物的属性。", image_url)


def parse_recognize_json(content: str) -> dict:
    return _extract_json(content)


def build_verify_messages(image_url: str, expected: dict) -> list[dict]:
    cat = expected.get("category", "")
    colors = "、".join(expected.get("colors", []))
    system = ('你是图像质检器。判断图中服装与期望属性是否一致(品类/主色)。'
              '只输出 JSON:{"drift": true 或 false, "reason": "一句话"}。drift=true 表示明显不符。')
    usr = f"期望品类:{cat};期望主色:{colors}。图中是否明显不符?"
    return _img_messages(system, usr, image_url)


def parse_verify_json(content: str) -> dict:
    d = _extract_json(content)
    return {"drift": bool(d.get("drift", False)), "reason": d.get("reason", "") or ""}
