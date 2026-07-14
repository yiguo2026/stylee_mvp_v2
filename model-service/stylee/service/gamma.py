"""Gamma: thin, direct model API paths kept separate from the B0-B6 engine.

The client still talks only to model-service. Gamma deliberately skips RAG,
candidate pools, ranking and visual verification so the experiment measures
what current provider APIs can do with a short path.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import time
import urllib.error
import urllib.request

from ..providers.openai_compat import _chat_completion, _extract_json
from ..usage_log import log_usage
from ..vision.dashscope import parse_edit_response

_CATEGORIES = {"上装", "下装", "连体装", "外套", "鞋履", "包袋", "帽巾", "配饰"}
_PHOTO_TYPES = {"flatlay", "on_body", "web", "angled"}
_PHOTO_ALIASES = {"flat": "flatlay", "product": "web"}
_MM_PATH = "/services/aigc/multimodal-generation/generation"
_SINGLE_SLOT_CATEGORIES = {"上装", "下装", "连体装", "外套", "鞋履", "包袋", "帽巾"}
_TRYON_CATEGORY_PRIORITY = {
    "连体装": 0, "外套": 1, "上装": 2, "下装": 3,
    "鞋履": 4, "包袋": 5, "帽巾": 6, "配饰": 7,
}
_TRYON_SCENES = {
    "cafe": "自然采光的现代咖啡馆",
    "street": "真实城市街道",
    "office": "明亮整洁的现代办公室",
    "park": "自然光下的城市公园",
    "home": "温暖简洁的居家空间",
}


def _image_url(payload: dict) -> str:
    if payload.get("image_url"):
        return str(payload["image_url"])
    if payload.get("image_b64"):
        mime = str(payload.get("mime") or "image/jpeg")
        return f"data:{mime};base64,{payload['image_b64']}"
    return ""


def normalize_import_item(raw: dict) -> dict:
    item = dict(raw) if isinstance(raw, dict) else {}
    category = str(item.get("category") or "上装")
    if category not in _CATEGORIES:
        category = "上装"
    photo = _PHOTO_ALIASES.get(str(item.get("photo_type") or ""), str(item.get("photo_type") or ""))
    if photo not in _PHOTO_TYPES:
        photo = "on_body"
    color = str(item.get("color") or "").strip()
    name = str(item.get("name") or item.get("description") or f"{color}{category}").strip()
    return {
        "name": name[:40] or category,
        "category": category,
        "color": color[:30],
        "material": str(item.get("material") or "")[:40],
        "brand": str(item.get("brand") or "")[:60],
        "style": str(item.get("style") or "")[:40],
        "sleeve_length": item.get("sleeve_length") if item.get("sleeve_length") in {"无袖", "短袖", "长袖"} else None,
        "fit_type": str(item.get("fit_type") or "")[:30] or None,
        "season": list(item.get("season") or [])[:4],
        "occasion_tags": list(item.get("occasion_tags") or [])[:6],
        "photo_type": photo,
    }


def _qwen_recognize_one(image_url: str) -> dict:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        raise RuntimeError("Gamma import requires DASHSCOPE_API_KEY")
    schema = (
        '{"name":"简短单品名","category":"上装|下装|连体装|外套|鞋履|包袋|帽巾|配饰",'
        '"color":"主颜色","material":"材质","brand":"","style":"风格",'
        '"sleeve_length":"无袖|短袖|长袖|null","fit_type":"版型|null",'
        '"season":[],"occasion_tags":[],"photo_type":"flatlay|on_body|web|angled"}'
    )
    messages = [
        {"role": "system", "content": "你是服饰入库识别器。只识别图中最主要的一件服饰，只输出JSON，schema:" + schema},
        {"role": "user", "content": [
            {"type": "text", "text": "识别这件服饰，名称要简短客观。"},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]},
    ]
    content = _chat_completion(
        os.environ.get("VL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        key, os.environ.get("GAMMA_VL_MODEL", os.environ.get("VL_MODEL", "qwen3-vl-plus")),
        messages, 0.1, 60, True,
    )
    return normalize_import_item(_extract_json(content))


def _qwen_image(content: list[dict], model: str, feature: str, parameters: dict | None = None) -> str:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        raise RuntimeError(f"{feature} requires DASHSCOPE_API_KEY")
    body = {
        "model": model,
        "input": {"messages": [{"role": "user", "content": content}]},
        "parameters": parameters or {},
    }
    req = urllib.request.Request(
        os.environ.get("IMG_BASE_URL", "https://dashscope.aliyuncs.com/api/v1").rstrip("/") + _MM_PATH,
        data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=int(os.environ.get("GAMMA_IMAGE_TIMEOUT_SECONDS", "90"))) as resp:
            response = json.loads(resp.read().decode("utf-8"))
        url = parse_edit_response(response)
        log_usage("qwen", model, feature, "image", response.get("usage"),
                  int((time.time() - t0) * 1000), True, response.get("request_id"))
        return url
    except urllib.error.HTTPError as exc:
        log_usage("qwen", model, feature, "image", None,
                  int((time.time() - t0) * 1000), False)
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"{feature} failed: HTTP {exc.code}: {detail}") from None
    except (urllib.error.URLError, ValueError, RuntimeError) as exc:
        log_usage("qwen", model, feature, "image", None,
                  int((time.time() - t0) * 1000), False)
        raise RuntimeError(f"{feature} failed: {exc}") from None


def _qwen_standardize(image_url: str, item: dict) -> str:
    details = "、".join(x for x in [item.get("color"), item.get("material"), item.get("name")] if x)
    prompt = (
        "只保留图中这件目标服饰，去掉人物、衣架和背景，生成纯白背景的正面平铺电商商品图。"
        "严格保留原始颜色、材质、版型、图案和细节，不要添加新装饰。"
        f" 目标特征：{details[:160]}"
    )
    model = os.environ.get("GAMMA_EDIT_MODEL", os.environ.get("IMG_EDIT_MODEL", "qwen-image-edit"))
    return _qwen_image([{"image": image_url}, {"text": prompt}], model, "gamma_import_edit")


def import_garment(payload: dict, recognize=None, edit=None) -> dict:
    started = time.time()
    image = _image_url(payload)
    if not image:
        raise ValueError("image_url or image_b64 is required")
    recognize_fn = recognize or _qwen_recognize_one
    edit_fn = edit or _qwen_standardize
    item = normalize_import_item(recognize_fn(image))
    image_ref = ""
    error = ""
    try:
        image_ref = edit_fn(image, item)
    except Exception as exc:  # noqa: BLE001 - Gamma returns recognition even when edit fails
        error = str(exc)[:200]
    return {
        "item": item,
        "standardized_image_url": image_ref,
        "standardized": bool(image_ref),
        "error": error or None,
        "trace": {
            "engine": "gamma",
            "vision_model": os.environ.get("GAMMA_VL_MODEL", os.environ.get("VL_MODEL", "qwen3-vl-plus")),
            "edit_model": os.environ.get("GAMMA_EDIT_MODEL", os.environ.get("IMG_EDIT_MODEL", "qwen-image-edit")),
            "duration_ms": int((time.time() - started) * 1000),
        },
    }


def build_outfit_messages(payload: dict) -> list[dict]:
    action = str(payload.get("action") or "generate")
    instruction = str(payload.get("instruction") or payload.get("query") or "")[:1000]
    schema = (
        '{"outfit":{"name":"方案名","comment":"2句理由","items":['
        '{"source":"owned","item_id":"衣橱真实id","name":"","category":"","color":""},'
        '{"source":"recommended","name":"简短单品名","category":"上装|下装|连体装|外套|鞋履|包袋|帽巾|配饰",'
        '"color":"","description":"","image_prompt":"白底商品图提示词"}]}}'
    )
    rules = [
        "只输出JSON，不要markdown。",
        "优先使用衣橱已有单品，且owned的item_id必须逐字来自输入衣橱。",
        "只有衣橱无法满足完整搭配时才返回recommended。",
        "一套搭配不得包含重复上装、重复下装或其他明显槽位冲突。",
        "recommended.image_prompt必须描述单件服饰的纯白背景正面平铺商品图，无人物无文字。",
    ]
    if action == "replace_all":
        rules.append("完整替换上一套，不得返回相同单品组合，并满足新要求。")
    elif action == "replace_item":
        rules.append("只替换target_item_key对应的单件，其他单品原样保留，新单品满足instruction。")
    return [
        {"role": "system", "content": "你是服装搭配API。" + "".join(rules) + " 输出schema:" + schema},
        {"role": "user", "content": json.dumps({
            "action": action,
            "instruction": instruction,
            "weather": payload.get("weather") or {},
            "profile": payload.get("profile") or {},
            "wardrobe": payload.get("wardrobe") or [],
            "previous_outfit": payload.get("previous_outfit") or None,
            "target_item_key": payload.get("target_item_key") or None,
        }, ensure_ascii=False)},
    ]


def _deepseek_outfit(payload: dict) -> dict:
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not key:
        raise RuntimeError("Gamma outfit requires DEEPSEEK_API_KEY")
    model = os.environ.get("GAMMA_TEXT_MODEL", os.environ.get("DEEPSEEK_MODEL_GEN", "deepseek-v4-flash"))
    content = _chat_completion(
        os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        key, model, build_outfit_messages(payload), 0.65, 60, True,
    )
    return _extract_json(content)


def _canonical_outfit(raw: dict, wardrobe: list[dict]) -> dict:
    source = raw.get("outfit") if isinstance(raw.get("outfit"), dict) else raw
    known = {str(x.get("item_id")): x for x in wardrobe if isinstance(x, dict) and x.get("item_id")}
    items = []
    seen = set()
    occupied_categories = set()
    body_mode = ""
    for i, value in enumerate(source.get("items") or []):
        if not isinstance(value, dict):
            continue
        item_id = str(value.get("item_id") or "")
        if value.get("source") == "owned" and item_id in known:
            base = known[item_id]
            key = f"owned:{item_id}"
            item = {
                "key": key, "source": "owned", "item_id": item_id,
                "name": str(base.get("name") or value.get("name") or "单品")[:40],
                "category": str(base.get("category") or value.get("category") or "配饰"),
                "color": str(base.get("color") or value.get("color") or "")[:30],
                "image_url": str(base.get("image_url") or "") or None,
            }
        else:
            name = str(value.get("name") or "").strip()[:40]
            category = str(value.get("category") or "配饰")
            if not name:
                continue
            if category not in _CATEGORIES:
                category = "配饰"
            key = f"new:{i}:{name}"
            item = {
                "key": key, "source": "recommended", "name": name,
                "category": category, "color": str(value.get("color") or "")[:30],
                "description": str(value.get("description") or "")[:160],
                "image_prompt": str(value.get("image_prompt") or "")[:500],
                "image_url": None,
            }
        category = item["category"]
        if category == "连体装":
            if body_mode:
                continue
            body_mode = "dress"
        elif category in {"上装", "下装"}:
            if body_mode == "dress":
                continue
            body_mode = "separates"
        if category in _SINGLE_SLOT_CATEGORIES and category in occupied_categories:
            continue
        if key not in seen:
            seen.add(key)
            occupied_categories.add(category)
            items.append(item)
    if not items:
        raise ValueError("Gamma model returned no usable outfit items")
    return {
        "name": str(source.get("name") or "Gamma搭配")[:50],
        "comment": str(source.get("comment") or "")[:300],
        "items": items,
    }


def _qwen_product_image(prompt: str) -> str:
    text = prompt or "单件服饰，纯白背景，正面平铺电商商品图，无人物，无文字"
    model = os.environ.get("GAMMA_IMAGE_MODEL", "qwen-image-2.0")
    return _qwen_image(
        [{"text": text[:700]}], model, "gamma_outfit_image",
        {"size": "1024*1024", "n": 1, "prompt_extend": True, "watermark": False},
    )


def outfit(payload: dict, complete=None, generate_image=None) -> dict:
    started = time.time()
    wardrobe = [x for x in (payload.get("wardrobe") or []) if isinstance(x, dict)]
    complete_fn = complete or _deepseek_outfit
    image_fn = generate_image or _qwen_product_image
    result = _canonical_outfit(complete_fn(payload), wardrobe)

    recommended = [x for x in result["items"] if x["source"] == "recommended"][:4]
    if payload.get("generate_images", True) and recommended:
        workers = min(4, len(recommended))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(image_fn, x.get("image_prompt") or x["name"]): x for x in recommended}
            for future in as_completed(futures):
                item = futures[future]
                try:
                    item["image_url"] = future.result() or None
                except Exception:  # noqa: BLE001 - text outfit remains usable
                    item["image_url"] = None

    return {
        "outfit": result,
        "trace": {
            "engine": "gamma",
            "action": str(payload.get("action") or "generate"),
            "text_model": os.environ.get("GAMMA_TEXT_MODEL", os.environ.get("DEEPSEEK_MODEL_GEN", "deepseek-v4-flash")),
            "image_model": os.environ.get("GAMMA_IMAGE_MODEL", "qwen-image-2.0"),
            "duration_ms": int((time.time() - started) * 1000),
        },
    }


def normalize_tryon_items(values: list[dict]) -> list[dict]:
    items = []
    for value in values[:8]:
        if not isinstance(value, dict):
            continue
        name = str(value.get("name") or "").strip()[:60]
        category = str(value.get("category") or "配饰")
        if category not in _CATEGORIES:
            category = "配饰"
        items.append({
            "name": name or category,
            "category": category,
            "color": str(value.get("color") or "")[:30],
            "description": str(value.get("description") or "")[:160],
            "image_url": str(value.get("image_url") or "")[:3000] or None,
        })
    return items


def tryon_reference_images(items: list[dict]) -> list[str]:
    """Select at most two garment references; Qwen accepts three images total."""
    ranked = sorted(
        enumerate(items),
        key=lambda pair: (_TRYON_CATEGORY_PRIORITY.get(pair[1].get("category"), 99), pair[0]),
    )
    refs = []
    for _, item in ranked:
        url = str(item.get("image_url") or "")
        if url and url not in refs:
            refs.append(url)
        if len(refs) == 2:
            break
    return refs


def build_tryon_prompt(items: list[dict], scene: str, body_shape: str, reference_count: int) -> str:
    garments = []
    for item in items:
        detail = " ".join(x for x in [item["color"], item["name"], item["description"]] if x)
        garments.append(f"{item['category']}：{detail}"[:220])
    reference_note = (
        f"图片2到图片{reference_count + 1}是服饰参考图，严格保留它们的颜色、版型、材质和图案。"
        if reference_count else "本次没有服饰参考图，请严格依据服饰文字清单生成。"
    )
    scene_text = _TRYON_SCENES.get(scene, scene or "自然光下的简洁室内空间")
    body_note = f"用户体型信息：{body_shape[:100]}。" if body_shape else ""
    return (
        "图片1是真实用户本人，也是唯一人物主体。生成一张写实的全身虚拟试穿照片。"
        "保持图片1人物的脸型、五官、发型、肤色、年龄感和真实体型，不美化成其他人，不改变身份。"
        f"{reference_note}{body_note}"
        f"让人物完整穿上以下搭配：{'；'.join(garments)}。"
        f"场景为{scene_text}，自然站姿，真实摄影光线，服装比例和遮挡关系合理。"
        "不要增加清单以外的外套或下装，不要出现第二个人、拼贴、商品平铺、文字、水印、畸形肢体或多余手指。"
    )


def _qwen_tryon(person_image: str, items: list[dict], scene: str, body_shape: str,
                 references: list[str]) -> str:
    content = [{"image": person_image}]
    content.extend({"image": url} for url in references)
    content.append({"text": build_tryon_prompt(items, scene, body_shape, len(references))})
    model = os.environ.get(
        "GAMMA_TRYON_MODEL", os.environ.get("GAMMA_IMAGE_MODEL", "qwen-image-2.0")
    )
    return _qwen_image(
        content, model, "gamma_tryon",
        {"size": "1024*1536", "n": 1, "prompt_extend": True, "watermark": False},
    )


def tryon(payload: dict, generate=None) -> dict:
    started = time.time()
    person_image = _image_url(payload)
    if not person_image:
        raise ValueError("image_url or image_b64 is required")
    items = normalize_tryon_items(payload.get("items") or [])
    if not items:
        raise ValueError("at least one outfit item is required")
    scene = str(payload.get("scene") or "")[:100]
    body_shape = str(payload.get("body_shape") or "")[:100]
    references = tryon_reference_images(items)
    image_url = (generate or _qwen_tryon)(person_image, items, scene, body_shape, references)
    if not image_url:
        raise RuntimeError("Gamma try-on returned no image")
    return {
        "image_url": image_url,
        "trace": {
            "engine": "gamma",
            "image_model": os.environ.get(
                "GAMMA_TRYON_MODEL", os.environ.get("GAMMA_IMAGE_MODEL", "qwen-image-2.0")
            ),
            "input_image_count": 1 + len(references),
            "duration_ms": int((time.time() - started) * 1000),
        },
    }
