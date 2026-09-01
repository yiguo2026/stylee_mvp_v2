"""Small, purpose-built model endpoints used by the App.

Prompts and provider credentials live here, never in the Expo bundle.
"""
from __future__ import annotations

from contextlib import nullcontext
import json
import math
import os
import time
import urllib.error
import urllib.request

from ..providers.openai_compat import _chat_completion, _extract_json
from ..usage_log import log_usage
from ..vision.dashscope import VisionError, build_edit_payload, parse_edit_response
from ..vision.recognition_input import prepare_recognition_data_uri
from .gamma import build_tryon_prompt, normalize_tryon_items, tryon_reference_images

_SCENES = {
    "cafe": "坐在咖啡馆里，暖色调灯光，悠闲氛围",
    "street": "站在城市街头，自然光线，都市感",
    "office": "在办公室内，专业场景，干净光线",
    "park": "在公园草地旁，自然阳光，绿意盎然",
    "home": "在家中沙发上，温馨居家氛围，柔和光线",
}

_CATEGORIES = {"上装", "下装", "连体装", "外套", "鞋履", "包袋", "帽巾", "配饰"}
_PHOTO_TYPE_ALIASES = {
    "flat": "flatlay", "flatlay": "flatlay",
    "product": "web", "web": "web",
    "on_body": "on_body", "angled": "angled",
}


def multi_max_pixels() -> int:
    try:
        configured = int(os.environ.get("VL_MULTI_MAX_PIXELS", "1048576"))
    except ValueError:
        configured = 1048576
    return min(16777216, max(65536, configured))


def normalize_target_bbox(value) -> list[float | int] | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    if any(
        isinstance(coordinate, bool)
        or not isinstance(coordinate, (int, float))
        or not math.isfinite(coordinate)
        or coordinate < 0
        or coordinate > 1000
        for coordinate in value
    ):
        return None
    left, top, right, bottom = value
    if right <= left or bottom <= top:
        return None
    return list(value)


def normalize_multi_item(raw: dict, index: int) -> dict:
    """Keep /recognize-multi compatible with the typed App contract.

    Confidence is a deterministic completeness score, not an ungrounded model
    self-assessment. Invalid fields are retained only through needs_review.
    """
    item = dict(raw) if isinstance(raw, dict) else {}
    category = str(item.get("category") or "")
    color = str(item.get("color") or "").strip()
    photo_raw = str(item.get("photo_type") or "")
    photo_type = _PHOTO_TYPE_ALIASES.get(photo_raw, "on_body")
    sleeve_raw = item.get("sleeve_length")
    sleeve_invalid = sleeve_raw not in (None, "", "无袖", "短袖", "长袖")
    if sleeve_invalid:
        item["sleeve_length"] = None
    bbox = normalize_target_bbox(item.get("bbox_2d"))
    if bbox is None:
        item.pop("bbox_2d", None)
    else:
        item["bbox_2d"] = bbox
    needs_review = (
        category not in _CATEGORIES
        or not color
        or photo_raw not in _PHOTO_TYPE_ALIASES
        or sleeve_invalid
        or bbox is None
    )
    if category not in _CATEGORIES:
        category = "上装"
    completeness = sum(bool(item.get(key)) for key in ("category", "color", "material", "description"))
    confidence = 0.95 if not needs_review and completeness >= 3 else (0.7 if completeness >= 2 else 0.4)
    item.update({
        "index": item.get("index") or index + 1,
        "category": category,
        "color": color,
        "photo_type": photo_type,
        "needs_review": needs_review,
        "confidence": confidence,
    })
    return item


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
    model = os.environ.get("VL_MULTI_MODEL", os.environ.get("VL_MODEL", "qwen3-vl-plus"))
    max_pixels = multi_max_pixels()
    prepared = prepare_recognition_data_uri(image_url)
    schema = ('{"items":[{"category":"上装|下装|连体装|外套|鞋履|包袋|帽巾|配饰",'
              '"color":"颜色","material":"材质","style":"风格","brand":"",'
              '"sleeve_length":"无袖|短袖|长袖|null","fit_type":"版型|null",'
              '"season":[],"occasion_tags":[],"description":"简洁客观名称",'
              '"photo_type":"flatlay|on_body|web|angled",'
              '"bbox_2d":[x1,y1,x2,y2]}]}')
    photo_type_rules = (
        "photo_type判定：白底商品图优先判为 web，即使衣物是平铺状态；"
        "flatlay 仅指有真实环境背景的俯拍平铺照，不含已抠净或棚拍商品图；"
        "on_body 指真人或人台穿着；angled 指带场景的非正俯视角度照片。"
    )
    messages = [{"role": "system", "content": (
                    "识别图片中所有服饰单品，只输出JSON。"
                    "bbox_2d必须紧贴该单品可见主体，坐标使用0-1000归一化网格，"
                    "格式为左上x、左上y、右下x、右下y。"
                    + photo_type_rules + "schema:" + schema)},
                {"role": "user", "content": [
                    {"type": "text", "text": "逐件识别所有可辨认的服饰。"},
                    {"type": "image_url", "image_url": {"url": prepared.data_uri}, "max_pixels": max_pixels},
                ]}]
    content = _chat_completion(
        os.environ.get("VL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        key, model, messages, 0.2,
        int(os.environ.get("VL_MULTI_TIMEOUT_SECONDS", "50")), True,
    )
    data = _extract_json(content)
    raw_items = data.get("items") if isinstance(data.get("items"), list) else []
    items = [normalize_multi_item(item, i) for i, item in enumerate(raw_items) if isinstance(item, dict)]
    return {
        "items": items,
        "provider": model,
        "input_info": {
            "encoded_bytes": prepared.encoded_bytes,
            "width": prepared.width,
            "height": prepared.height,
            "compressed": prepared.compressed,
        },
    }


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


def _tryon_quality_messages(image_ref: str, items: list[dict]) -> list[dict]:
    expected = [
        {
            "name": item.get("name"),
            "category": item.get("category"),
            "color": item.get("color"),
            "material": item.get("material"),
            "sleeve_length": item.get("sleeve_length"),
            "fit_type": item.get("fit_type"),
            "description": item.get("description"),
        }
        for item in items
    ]
    schema = (
        '{"has_text_or_watermark":false,"garment_match":true,'
        '"detail_match":true,"sleeve_match":true,'
        '"sleeveless_not_straps":true,"reason":"一句话"}'
    )
    return [
        {
            "role": "system",
            "content": (
                "你是虚拟试穿成图质检器。检查画面是否出现任何文字、伪文字、签名、"
                "社交媒体标记、Logo或水印，并检查服装品类、颜色、材质、描述细节、袖型与版型是否匹配。"
                "当期望为无袖时，宽肩无袖可以，但绝不能变成细肩带、吊带、抹胸或露肩款。"
                "只输出JSON，schema:" + schema
            ),
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "期望服装:" + json.dumps(expected, ensure_ascii=False)},
                {"type": "image_url", "image_url": {"url": image_ref}, "max_pixels": 524288},
            ],
        },
    ]


def verify_tryon_output(image_ref: str, items: list[dict]) -> dict:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key or not image_ref:
        return {"ok": False, "reason": "quality verifier unavailable"}
    model = os.environ.get(
        "TRYON_VERIFY_MODEL",
        os.environ.get("VL_MULTI_MODEL", os.environ.get("VL_MODEL", "qwen3-vl-flash")),
    )
    content = _chat_completion(
        os.environ.get("VL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        key,
        model,
        _tryon_quality_messages(image_ref, items),
        0.0,
        int(os.environ.get("TRYON_VERIFY_TIMEOUT_SECONDS", "10")),
        True,
    )
    result = _extract_json(content)
    ok = (
        result.get("has_text_or_watermark") is False
        and result.get("garment_match") is True
        and result.get("detail_match") is True
        and result.get("sleeve_match") is True
        and result.get("sleeveless_not_straps") is True
    )
    return {"ok": ok, "reason": str(result.get("reason") or "")[:200]}


def tryon_image(payload: dict, generate=None, verify=None, stage_timer=None) -> str:
    person_image = str(payload.get("image_url") or "")
    items = normalize_tryon_items(
        payload.get("items") if isinstance(payload.get("items"), list) else []
    )
    if not person_image or not items:
        raise VisionError("try-on requires a person image and at least one garment")
    references = tryon_reference_images(items)
    images = [person_image, *references]
    prompt = build_tryon_prompt(
        items,
        str(payload.get("scene") or ""),
        str(payload.get("body_shape") or "")[:100],
        len(references),
    )
    generate_fn = generate or edit_image
    verify_fn = verify or verify_tryon_output
    last_reason = ""
    for attempt in range(2):
        retry_instruction = (
            " 上一张候选未通过质检，原因：" + last_reason
            + "。重新生成整张图片并严格修正。"
            if attempt else ""
        )
        with stage_timer(f"tryon.generate.{attempt + 1}") if stage_timer else nullcontext():
            image_ref = generate_fn(images, prompt + retry_instruction, "tryon")
        with stage_timer(f"tryon.verify.{attempt + 1}") if stage_timer else nullcontext():
            quality = verify_fn(image_ref, items)
        if quality.get("ok") is True:
            return image_ref
        last_reason = str(quality.get("reason") or "quality verification failed")[:200]
    raise VisionError("try-on output failed quality verification: " + last_reason)


def tryon_edit_parameters(model: str) -> dict:
    """Use only parameters supported by the selected image-edit model."""
    parameters = {
        "watermark": False,
        "negative_prompt": "文字，字母，数字，标题，Logo，水印，杂志封面排版",
    }
    # The legacy qwen-image-edit endpoint rejects prompt_extend. Newer image
    # models accept it and disabling expansion reduces accidental cover text.
    if model != "qwen-image-edit":
        parameters["prompt_extend"] = False
    return parameters


def edit_image(image_url: str | list[str], prompt: str, feature: str) -> str:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        return ""
    model = os.environ.get("IMG_EDIT_MODEL", "qwen-image-edit")
    parameters = tryon_edit_parameters(model) if feature == "tryon" else None
    data = json.dumps(build_edit_payload(model, image_url, prompt, parameters)).encode("utf-8")
    req = urllib.request.Request(
        os.environ.get("IMG_BASE_URL", "https://dashscope.aliyuncs.com/api/v1").rstrip("/")
        + "/services/aigc/multimodal-generation/generation",
        data=data, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    timeout = int(os.environ.get("TRYON_EDIT_TIMEOUT_SECONDS", "35"))
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        url = parse_edit_response(body)
        log_usage("qwen", model, feature, "image", body.get("usage"), int((time.time() - t0) * 1000), True, body.get("request_id"))
        return url
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
        log_usage("qwen", model, feature, "image", None, int((time.time() - t0) * 1000), False)
        return ""
