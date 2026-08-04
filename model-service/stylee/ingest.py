"""触点 A code 脊柱:把 VLM 原始属性规范化成 WardrobeItem,并编排标准化。

A1 recognize_item:VLM 识别 → code 映射枚举 + 推导 warmth + 判拍摄类型 → WardrobeItem。
A2 standardize_item:见 Task 5。
模型出错也兜得住:非法/缺失字段给默认 + needs_review,绝不让导入失败。
"""
from __future__ import annotations

import base64
import hashlib
from contextlib import nullcontext
from typing import Callable, ContextManager

from .contracts import (
    Category,
    Fit,
    IngestResult,
    PhotoType,
    Season,
    Sleeve,
    StandardizedImage,
    WardrobeItem,
)
from .vision.base import ImageStandardizer, VisionProvider


def to_data_url(image_bytes: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(image_bytes).decode()


# warmth 由 material(+category) 查表推导:0 最薄 → 4 最厚
_WARMTH = [
    (("羽绒", "down"), 4),
    (("毛呢", "厚呢", "羊绒", "厚针织", "cashmere"), 3),
    (("羊毛", "卫衣", "针织", "毛衣", "wool", "fleece"), 2),
    (("棉", "牛仔", "衬衫", "denim", "cotton", "涤纶", "polyester", "皮", "leather"), 1),
    (("雪纺", "真丝", "背心", "无袖", "网纱", "chiffon", "silk", "麻", "linen"), 0),
]


def derive_warmth(material: str, category: Category) -> int:
    m = (material or "").lower()
    base = 1
    for kws, w in _WARMTH:
        if any(k.lower() in m for k in kws):
            base = w
            break
    if category == Category.OUTERWEAR:
        base = min(4, base + 1)
    return base


def _enum_by_value(enum_cls, s, default):
    if s is None:
        return default, True   # 缺失字段也标 needs_review
    s = str(s).strip()
    for e in enum_cls:
        if e.value == s or e.value in s or s in e.value:
            return e, False
    return default, True   # 没命中 → 默认 + needs_review


def normalize_attrs(raw: dict, item_id: str) -> tuple[WardrobeItem, PhotoType, bool]:
    needs_review = False

    category, miss = _enum_by_value(Category, raw.get("category"), Category.TOP)
    needs_review = needs_review or miss

    pt_raw = raw.get("photo_type")
    photo_type = PhotoType.ON_BODY
    if pt_raw in (p.value for p in PhotoType):
        photo_type = PhotoType(pt_raw)
    else:
        needs_review = True

    sleeve = None
    if raw.get("sleeve") not in (None, "", "null"):
        sleeve, _ = _enum_by_value(Sleeve, raw.get("sleeve"), None)
    fit = None
    if raw.get("fit") not in (None, "", "null"):
        fit, _ = _enum_by_value(Fit, raw.get("fit"), None)

    seasons = []
    for s in raw.get("seasons") or []:
        e, miss = _enum_by_value(Season, s, None)
        if e is not None:
            seasons.append(e)

    colors = [c for c in (raw.get("colors") or []) if c]
    material = raw.get("material") or ""

    item = WardrobeItem(
        id=item_id, category=category, colors=colors, material=material,
        sleeve=sleeve, fit=fit, seasons=seasons,
        style_tags=list(raw.get("style_tags") or []),
        occasion_tags=list(raw.get("occasion_tags") or []),
        warmth=derive_warmth(material, category),
    )
    # brand 不是 WardrobeItem 字段,保留在 IngestResult.raw 里供 App 取用。
    return item, photo_type, needs_review


def _gen_id(raw: dict) -> str:
    seed = f"{raw.get('category','')}{raw.get('material','')}{raw.get('colors','')}"
    return "a_" + hashlib.md5(seed.encode("utf-8")).hexdigest()[:8]


def recognize_item(
    image_url: str,
    provider: VisionProvider,
    item_id: str = "",
    stage_timer: Callable[[str], ContextManager[None]] | None = None,
    on_fallback: Callable[[str, BaseException], None] | None = None,
) -> IngestResult:
    """A1:看图 → WardrobeItem。模型/解析出错也产出可用 item(+needs_review)。"""
    with stage_timer("A1.vision_recognize") if stage_timer else nullcontext():
        try:
            raw = provider.recognize(image_url)
            if not isinstance(raw, dict):
                raw = {}
        except Exception as error:
            if on_fallback:
                on_fallback("A1.vision_recognize", error)
            raw = {}
    parse_failed = not raw

    with stage_timer("A1.normalize_attrs") if stage_timer else nullcontext():
        item, photo_type, needs_review = normalize_attrs(raw, item_id or _gen_id(raw))
    needs_review = needs_review or parse_failed
    confidence = 0.3 if parse_failed else (0.7 if needs_review else 0.95)
    return IngestResult(item=item, photo_type=photo_type, confidence=confidence,
                        needs_review=needs_review, raw=raw)


def mode_for(photo_type: PhotoType) -> str:
    return "cutout" if photo_type == PhotoType.FLATLAY else "img2img"


def standardize_item(image_url: str, item: WardrobeItem, photo_type: PhotoType,
                     provider: VisionProvider, standardizer: ImageStandardizer,
                     stage_timer: Callable[[str], ContextManager[None]] | None = None,
                     on_fallback: Callable[[str, BaseException], None] | None = None,
                     ) -> StandardizedImage:
    """A2:按 photo_type 路由生成标准化图 → 回验漂移 → 失败/漂移回退原图。"""
    mode = mode_for(photo_type)
    edit_error = None
    with stage_timer("A2.image_edit") if stage_timer else nullcontext():
        try:
            result_url = standardizer.standardize(image_url, item, mode)
        except Exception as error:
            edit_error = error
            result_url = ""
    if edit_error is not None:
        if on_fallback:
            on_fallback("A2.image_edit", edit_error)
        return StandardizedImage(image_ref=image_url, method="cropped_fallback", verified=False)

    expected = {"category": item.category.value, "colors": item.colors}
    verify_error = None
    with stage_timer("A2.visual_verify") if stage_timer else nullcontext():
        try:
            vres = provider.verify(result_url, expected)
        except Exception as error:
            verify_error = error
            vres = {"drift": True, "reason": "verify failed"}
    if verify_error is not None and on_fallback:
        on_fallback("A2.visual_verify", verify_error)
    if vres.get("drift"):
        return StandardizedImage(image_ref=image_url, method="cropped_fallback", verified=False)
    return StandardizedImage(image_ref=result_url, method=mode, verified=True)
