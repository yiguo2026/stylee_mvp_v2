"""Small, purpose-built model endpoints used by the App.

Prompts and provider credentials live here, never in the Expo bundle.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

from ..providers.openai_compat import _chat_completion, _extract_json
from ..usage_log import log_usage
from ..vision.dashscope import build_edit_payload, parse_edit_response

_SCENES = {
    "cafe": "坐在咖啡馆里，暖色调灯光，悠闲氛围",
    "street": "站在城市街头，自然光线，都市感",
    "office": "在办公室内，专业场景，干净光线",
    "park": "在公园草地旁，自然阳光，绿意盎然",
    "home": "在家中沙发上，温馨居家氛围，柔和光线",
}


def _deepseek_json(system: str, user: str, temperature: float = 0.5) -> dict:
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not key:
        return {"provider": "mock"}
    content = _chat_completion(
        os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        key, os.environ.get("DEEPSEEK_MODEL_INTENT", "deepseek-v4-flash"),
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature, 60, True,
    )
    data = _extract_json(content)
    data["provider"] = os.environ.get("DEEPSEEK_MODEL_INTENT", "deepseek-v4-flash")
    return data


def recognize_many(image_url: str) -> dict:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        return {"items": [], "provider": "mock"}
    schema = ('{"items":[{"category":"上装|下装|连体装|外套|鞋履|包袋|帽巾|配饰",'
              '"color":"颜色","material":"材质","style":"风格","brand":"",'
              '"sleeve_length":"无袖|短袖|长袖|null","fit_type":"版型|null",'
              '"season":[],"occasion_tags":[],"description":"简洁客观名称",'
              '"photo_type":"flatlay|on_body|web|angled"}]}')
    messages = [{"role": "system", "content": "识别图片中所有服饰单品，只输出JSON，schema:" + schema},
                {"role": "user", "content": [
                    {"type": "text", "text": "逐件识别所有可辨认的服饰。"},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ]}]
    content = _chat_completion(
        os.environ.get("VL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        key, os.environ.get("VL_MODEL", "qwen3-vl-plus"), messages, 0.2, 60, True,
    )
    data = _extract_json(content)
    return {"items": data.get("items") if isinstance(data.get("items"), list) else [],
            "provider": os.environ.get("VL_MODEL", "qwen3-vl-plus")}


def intent(query: str) -> dict:
    return _deepseek_json(
        '从用户穿搭描述提取标签，只返回JSON:{"tags":["标签ID"]}。可用前缀:场合daily_commute/date/travel/business/sport/ceremony/beach/hiking/home/party;风格quiet_luxury/minimalist/commute_style/french/preppy/vintage/street/sporty_casual/sweet/romantic/bohemian/urban_cool;色系white/black_gray/red/orange/yellow/green/blue/purple/pink;温度temp_hot/temp_warm/temp_cool/temp_cold。',
        query, 0.2,
    )


def reason(payload: dict) -> dict:
    return _deepseek_json(
        '你是穿搭顾问。生成2-3句具体理由，只返回JSON:{"reason":""}。',
        json.dumps(payload, ensure_ascii=False), 0.6,
    )


def product(payload: dict) -> dict:
    return _deepseek_json(
        '根据商品URL推断商品信息，只返回JSON，字段name/category/color/material/brand/price/description。category只能是上装/下装/连体装/外套/鞋履/包袋/帽巾/配饰。',
        str(payload.get("url") or ""), 0.2,
    )


def tryon_suggestion(payload: dict) -> dict:
    return _deepseek_json(
        '根据搭配单品和体型给出建议，只返回JSON:{"suggestion":"","compatibility_score":80,"tips":[]}。',
        json.dumps(payload, ensure_ascii=False), 0.6,
    )


def tryon_image(payload: dict) -> str:
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    items_desc = "、".join(
        str(x.get("color") or "") + str(x.get("name") or x.get("category") or "单品")
        for x in items if isinstance(x, dict)
    )[:300]
    body_shape = str(payload.get("body_shape") or "")[:50]
    scene = _SCENES.get(str(payload.get("scene") or ""), _SCENES["street"])
    prompt = ("严格保持参考照片中人物的面部五官、脸型轮廓、肤色和发型完全一致，"
              f"一位{body_shape}身材的年轻女性穿着{items_desc}，{scene}，"
              "全身照，时尚杂志风格，高质量摄影")
    return edit_image(str(payload.get("image_url") or ""), prompt, "tryon")


def edit_image(image_url: str, prompt: str, feature: str) -> str:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        return ""
    model = os.environ.get("IMG_EDIT_MODEL", "qwen-image-edit")
    data = json.dumps(build_edit_payload(model, image_url, prompt)).encode("utf-8")
    req = urllib.request.Request(
        os.environ.get("IMG_BASE_URL", "https://dashscope.aliyuncs.com/api/v1").rstrip("/")
        + "/services/aigc/multimodal-generation/generation",
        data=data, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        url = parse_edit_response(body)
        log_usage("qwen", model, feature, "image", body.get("usage"), int((time.time() - t0) * 1000), True, body.get("request_id"))
        return url
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
        log_usage("qwen", model, feature, "image", None, int((time.time() - t0) * 1000), False)
        return ""
