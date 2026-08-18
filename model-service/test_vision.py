from stylee.vision.prompts import (
    build_recognize_messages, parse_recognize_json,
    build_verify_messages, parse_verify_json,
)
from stylee.vision.base import ImageRefSource, VisionProvider, ImageStandardizer
from stylee.contracts import StandardizedImage, IngestResult, WardrobeItem, Category, PhotoType, Sleeve, Fit, Season
from stylee.ingest import to_data_url, derive_warmth, normalize_attrs, recognize_item, mode_for, standardize_item


def _image_block(messages):
    for m in messages:
        c = m["content"]
        if isinstance(c, list):
            for blk in c:
                if blk.get("type") == "image_url":
                    return blk["image_url"]["url"]
    return None


def test_recognize_messages_has_image_and_schema():
    msgs = build_recognize_messages("data:image/png;base64,AAAA")
    assert _image_block(msgs) == "data:image/png;base64,AAAA"
    joined = " ".join(m["content"] if isinstance(m["content"], str) else "" for m in msgs)
    assert "category" in joined and "photo_type" in joined        # schema 在 system 里


def test_parse_recognize_json_codefence():
    raw = '```json\n{"category":"上装","colors":["白色"],"photo_type":"flatlay"}\n```'
    d = parse_recognize_json(raw)
    assert d["category"] == "上装" and d["colors"] == ["白色"]


def test_verify_messages_and_parse():
    msgs = build_verify_messages("http://x/y.png", {"category": "上装", "colors": ["白色"]})
    assert _image_block(msgs) == "http://x/y.png"
    prompt = str(msgs)
    assert "棋盘格" in prompt and "白色矩形" in prompt and "可见背景" in prompt
    assert parse_verify_json('{"drift": true, "reason": "品类变了"}') == {"drift": True, "reason": "品类变了"}


def test_abc_cannot_instantiate():
    try:
        VisionProvider()
        assert False, "ABC 不应可实例化"
    except TypeError:
        pass


def test_contracts_dataclasses():
    si = StandardizedImage(image_ref="u", method="cutout", verified=True)
    assert si.method == "cutout" and si.verified is True
    it = WardrobeItem(id="x", category=Category.TOP)
    r = IngestResult(item=it, photo_type=PhotoType.FLATLAY)
    assert r.needs_review is False and r.confidence == 0.0 and r.raw == {}


class _FakeVP:
    name = "fake"
    def __init__(self, raw): self._raw = raw
    def recognize(self, image_url): return self._raw
    def verify(self, image_url, expected): return {"drift": False, "reason": ""}


def test_to_data_url():
    assert to_data_url(b"\x00\x01", "image/png").startswith("data:image/png;base64,")


def test_derive_warmth():
    assert derive_warmth("羽绒", Category.OUTERWEAR) == 4
    assert derive_warmth("纯棉", Category.TOP) == 1
    assert derive_warmth("雪纺", Category.TOP) == 0
    assert derive_warmth("棉", Category.OUTERWEAR) == 2   # 外套 +1


def test_normalize_good():
    raw = {"category": "下装", "colors": ["黑色"], "material": "牛仔", "sleeve": "null",
           "fit": "修身", "seasons": ["春", "秋"], "style_tags": ["都市"],
           "occasion_tags": ["休闲"], "photo_type": "flatlay", "brand": ""}
    item, pt, nr = normalize_attrs(raw, "id1")
    assert item.category == Category.BOTTOM and item.colors == ["黑色"]
    assert item.fit == Fit.SLIM and item.seasons == [Season.SPRING, Season.AUTUMN]
    assert pt == PhotoType.FLATLAY and nr is False and item.warmth == 1


def test_normalize_bad_sets_needs_review():
    item, pt, nr = normalize_attrs({"category": "外星装", "photo_type": "??"}, "id2")
    assert item.category == Category.TOP          # 非法品类 → 默认上装
    assert pt == PhotoType.ON_BODY                # 非法拍摄类型 → 默认 on_body
    assert nr is True


def test_recognize_item_endtoend_fake():
    raw = {"category": "鞋", "colors": ["白色"], "material": "皮", "photo_type": "web"}
    res = recognize_item("http://x.png", _FakeVP(raw), item_id="s9")
    assert res.item.id == "s9" and res.item.category == Category.SHOES
    assert res.photo_type == PhotoType.WEB and res.raw == raw


def test_normalize_missing_category_needs_review():
    item, pt, nr = normalize_attrs({"photo_type": "flatlay", "material": "棉"}, "idM")
    assert item.category == Category.TOP and nr is True   # 缺 category → 默认+needs_review


class _RaisingVP:
    def recognize(self, image_url): raise RuntimeError("vlm down")
    def verify(self, image_url, expected): return {"drift": False, "reason": ""}


class _DriftVP:
    def recognize(self, image_url): return {}
    def verify(self, image_url, expected): return {"drift": True, "reason": "品类不符"}


class _DriftThenCleanVP:
    name = "fake"
    def __init__(self):
        self.verified_refs = []
    def recognize(self, image_url): return {}
    def verify(self, image_url, expected):
        self.verified_refs.append(image_url)
        if len(self.verified_refs) == 1:
            return {"drift": True, "reason": "仍有棋盘格背景"}
        return {"drift": False, "reason": ""}


class _BoomStd:
    def standardize(self, image_url, item, mode): raise RuntimeError("api down")


class _FakeMatte:
    name = "pillow-border-connected-v1"
    def __init__(self, fail_first=False):
        self.refs = []
        self.fail_first = fail_first
    def process(self, image_ref, stage_timer=None, source=ImageRefSource.CLIENT):
        self.refs.append((source, image_ref))
        if self.fail_first and len(self.refs) == 1:
            from stylee.vision.alpha_matte import AlphaMatteError
            raise AlphaMatteError("A2.alpha_validate", "not transparent")
        from stylee.vision.alpha_matte import AlphaMatteOutput, AlphaStats
        return AlphaMatteOutput(
            "data:image/png;base64,AAAA", "image/png", True, self.name,
            AlphaStats(0.5, 0.5, 1.0, (1, 1, 2, 2)),
        )


def test_web_uses_direct_matte_before_edit():
    matte = _FakeMatte()
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://web", item, PhotoType.WEB, _FakeVP({}), _BoomStd(), matte)
    assert matte.refs == [(ImageRefSource.CLIENT, "orig://web")]
    assert si.method == "direct_matte" and si.alpha_verified is True


def test_web_direct_failure_falls_back_to_edit_then_matte():
    from stylee.vision.mock import MockImageStandardizer
    matte = _FakeMatte(fail_first=True)
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://web", item, PhotoType.WEB, _FakeVP({}), MockImageStandardizer(), matte)
    assert matte.refs == [
        (ImageRefSource.CLIENT, "orig://web"),
        (ImageRefSource.PROVIDER_OUTPUT, "mock://std/img2img"),
    ]
    assert si.method == "img2img_alpha" and si.verified is True


def test_web_dirty_direct_matte_falls_back_to_edit_then_matte():
    from stylee.vision.mock import MockImageStandardizer
    provider = _DriftThenCleanVP()
    matte = _FakeMatte()
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://web", item, PhotoType.WEB, provider, MockImageStandardizer(), matte)
    assert matte.refs == [
        (ImageRefSource.CLIENT, "orig://web"),
        (ImageRefSource.PROVIDER_OUTPUT, "mock://std/img2img"),
    ]
    assert provider.verified_refs == [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,AAAA",
    ]
    assert si.method == "img2img_alpha" and si.verified is True


def test_terminal_failure_never_verifies_white_output():
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://x", item, PhotoType.FLATLAY, _FakeVP({}), _BoomStd(), _FakeMatte())
    assert si.verified is False and si.alpha_verified is False
    assert si.failure_stage == "A2.image_edit"


def test_recognize_item_provider_exception_safe():
    fallbacks = []
    res = recognize_item(
        "u", _RaisingVP(), item_id="e1",
        on_fallback=lambda stage, error: fallbacks.append((stage, type(error).__name__)),
    )
    assert res.item.id == "e1" and res.needs_review is True   # provider 抛异常仍产出可用 item
    assert fallbacks == [("A1.vision_recognize", "RuntimeError")]


def test_mock_recognize_and_standardize():
    from stylee.vision.mock import MockAlphaMatteProcessor, MockVisionProvider, MockImageStandardizer
    vp = MockVisionProvider()
    raw = vp.recognize("data:image/png;base64,AAAA")
    assert raw["category"] in (c.value for c in Category)
    assert vp.verify("u", {"category": "上装"}) == {"drift": False, "reason": "mock"}
    res = recognize_item("u", vp, item_id="m1")
    assert res.item.id == "m1" and res.needs_review is False
    std = MockImageStandardizer().standardize("u", res.item, "cutout")
    assert std == "mock://std/cutout"
    matte = MockAlphaMatteProcessor().process(std)
    assert matte.data_uri.startswith("data:image/png;base64,") and matte.alpha_verified is True


def test_mode_for():
    assert mode_for(PhotoType.FLATLAY) == "cutout"
    assert mode_for(PhotoType.ON_BODY) == "img2img"
    assert mode_for(PhotoType.WEB) == "img2img"


def test_standardize_ok_cutout():
    from stylee.vision.mock import MockVisionProvider, MockImageStandardizer
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://x", item, PhotoType.FLATLAY,
                          MockVisionProvider(), MockImageStandardizer(), _FakeMatte())
    assert si.image_ref == "data:image/png;base64,AAAA" and si.method == "cutout_alpha" and si.verified is True


def test_standardize_drift_falls_back():
    from stylee.vision.mock import MockImageStandardizer
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://x", item, PhotoType.ON_BODY,
                          _DriftVP(), MockImageStandardizer(), _FakeMatte())
    assert si.method == "cropped_fallback" and si.image_ref == "orig://x" and si.verified is False


def test_standardize_api_error_falls_back():
    from stylee.vision.mock import MockVisionProvider
    item = WardrobeItem(id="i", category=Category.TOP)
    fallbacks = []
    si = standardize_item(
        "orig://x", item, PhotoType.FLATLAY, MockVisionProvider(), _BoomStd(), _FakeMatte(),
        on_fallback=lambda stage, error: fallbacks.append((stage, type(error).__name__)),
    )
    assert si.method == "cropped_fallback" and si.image_ref == "orig://x"
    assert fallbacks == [("A2.image_edit", "RuntimeError")]


import os
import json as _json
import stylee.vision.dashscope as _dashscope
from stylee.vision.dashscope import (
    build_edit_payload, parse_edit_response, VisionError, DashScopeImageStandardizer,
    build_vision_provider, build_image_standardizer,
)
from stylee.vision.mock import MockVisionProvider as _MVP


def test_build_edit_payload():
    p = build_edit_payload("qwen-image-edit", "data:img", "去背")
    msgs = p["input"]["messages"][0]["content"]
    assert p["model"] == "qwen-image-edit"
    assert {"image": "data:img"} in msgs and {"text": "去背"} in msgs
    assert p["parameters"] == {}


def test_build_edit_payload_accepts_explicit_parameters():
    params = {"watermark": False, "negative_prompt": "文字，Logo，水印"}
    p = build_edit_payload("qwen-image-edit", "data:img", "真实摄影", params)
    assert p["parameters"] == params
    assert p["parameters"] is not params


def test_standardizer_prompts_preserve_prints_for_every_mode():
    captured_prompts = []

    class _Response:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def read(self):
            return _json.dumps({
                "output": {"choices": [{"message": {"content": [{"image": "https://example.test/out.png"}]}}]},
                "usage": {},
                "request_id": "req-test",
            }).encode()

    def fake_urlopen(request, timeout):
        payload = _json.loads(request.data.decode())
        captured_prompts.append(payload["input"]["messages"][0]["content"][1]["text"])
        return _Response()

    original_urlopen = _dashscope.urllib.request.urlopen
    original_log_usage = _dashscope.log_usage
    _dashscope.urllib.request.urlopen = fake_urlopen
    _dashscope.log_usage = lambda *args, **kwargs: None
    try:
        standardizer = DashScopeImageStandardizer("https://example.test", "key", "qwen-image-edit")
        item = WardrobeItem(id="i", category=Category.TOP)
        standardizer.standardize("data:image/png;base64,AAAA", item, "cutout")
        standardizer.standardize("data:image/png;base64,AAAA", item, "img2img")
    finally:
        _dashscope.urllib.request.urlopen = original_urlopen
        _dashscope.log_usage = original_log_usage

    assert len(captured_prompts) == 2
    assert all("保留颜色、材质、轮廓和印花" in prompt for prompt in captured_prompts)


def test_parse_edit_response_ok_and_bad():
    body = {"output": {"choices": [{"message": {"content": [{"image": "http://o/r.png"}]}}]}}
    assert parse_edit_response(body) == "http://o/r.png"
    try:
        parse_edit_response({"output": {}})
        assert False
    except VisionError:
        pass


def test_factories_no_key_fall_back_to_mock():
    saved = os.environ.pop("DASHSCOPE_API_KEY", None)
    try:
        assert isinstance(build_vision_provider(), _MVP)
        assert build_image_standardizer().name == "mock"
    finally:
        if saved is not None:
            os.environ["DASHSCOPE_API_KEY"] = saved


def main():
    test_recognize_messages_has_image_and_schema()
    test_parse_recognize_json_codefence()
    test_verify_messages_and_parse()
    test_abc_cannot_instantiate()
    test_contracts_dataclasses()
    test_to_data_url()
    test_derive_warmth()
    test_normalize_good()
    test_normalize_bad_sets_needs_review()
    test_recognize_item_endtoend_fake()
    test_normalize_missing_category_needs_review()
    test_recognize_item_provider_exception_safe()
    test_mock_recognize_and_standardize()
    test_mode_for()
    test_standardize_ok_cutout()
    test_standardize_drift_falls_back()
    test_standardize_api_error_falls_back()
    test_web_uses_direct_matte_before_edit()
    test_web_direct_failure_falls_back_to_edit_then_matte()
    test_web_dirty_direct_matte_falls_back_to_edit_then_matte()
    test_terminal_failure_never_verifies_white_output()
    test_build_edit_payload()
    test_build_edit_payload_accepts_explicit_parameters()
    test_standardizer_prompts_preserve_prints_for_every_mode()
    test_parse_edit_response_ok_and_bad()
    test_factories_no_key_fall_back_to_mock()
    print("ok")


if __name__ == "__main__":
    main()
