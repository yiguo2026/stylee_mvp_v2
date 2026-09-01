import base64
from contextlib import contextmanager
import io
import os

from PIL import Image

from stylee.service import ai_features


def _png_data_uri(size=(1672, 2508)):
    output = io.BytesIO()
    Image.new("RGB", size, "beige").save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def test_no_keys_do_not_call_external_models():
    saved = {k: os.environ.pop(k, None) for k in ("DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY")}
    try:
        assert ai_features.intent("约会")["provider"] == "mock"
        assert ai_features.recognize_many("data:image/png;base64,AA==") == {"items": [], "provider": "mock"}
    finally:
        for key, value in saved.items():
            if value is not None:
                os.environ[key] = value


def test_tryon_prompt_is_built_server_side():
    seen = {}
    original = ai_features.edit_image
    ai_features.edit_image = lambda image, prompt, feature: seen.update(
        image=image, prompt=prompt, feature=feature) or "https://example/result.png"
    try:
        result = ai_features.tryon_image({
            "image_url": "data:image/png;base64,AA==",
            "items": [{"name": "衬衫", "color": "白色"}],
            "body_shape": "梨形", "scene": "office",
            "prompt": "客户端注入内容不得使用",
        }, verify=lambda _image, _items: {"ok": True, "reason": ""})
        assert result == "https://example/result.png"
        assert "白色衬衫" in seen["prompt"] and "办公室" in seen["prompt"]
        assert "客户端注入内容" not in seen["prompt"]
        assert "时尚杂志摄影质感" in seen["prompt"]
        assert "不是杂志封面" in seen["prompt"]
        for forbidden in ("文字", "字母", "数字", "标题", "Logo", "水印"):
            assert forbidden in seen["prompt"]
    finally:
        ai_features.edit_image = original


def test_tryon_edit_parameters_suppress_text_without_breaking_legacy_model():
    legacy = ai_features.tryon_edit_parameters("qwen-image-edit")
    assert legacy["watermark"] is False
    assert "文字" in legacy["negative_prompt"] and "Logo" in legacy["negative_prompt"]
    assert "prompt_extend" not in legacy

    modern = ai_features.tryon_edit_parameters("qwen-image-2.0-pro")
    assert modern["watermark"] is False and modern["prompt_extend"] is False


def test_tryon_image_edit_uses_bounded_deadline_and_multiple_references():
    saved_key = os.environ.get("DASHSCOPE_API_KEY")
    original_urlopen = ai_features.urllib.request.urlopen
    original_log_usage = ai_features.log_usage
    seen = {}

    class Response:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return None
        def read(self):
            return (
                b'{"output":{"choices":[{"message":{"content":['
                b'{"image":"https://example.test/result.png"}]}}]},"usage":{}}'
            )

    def fake_urlopen(request, timeout):
        seen["payload"] = ai_features.json.loads(request.data.decode())
        seen["timeout"] = timeout
        return Response()

    os.environ["DASHSCOPE_API_KEY"] = "test-key"
    ai_features.urllib.request.urlopen = fake_urlopen
    ai_features.log_usage = lambda *_args, **_kwargs: None
    try:
        result = ai_features.edit_image(
            ["data:person", "https://storage.test/dress.png"],
            "虚拟试穿",
            "tryon",
        )
    finally:
        ai_features.urllib.request.urlopen = original_urlopen
        ai_features.log_usage = original_log_usage
        if saved_key is None:
            os.environ.pop("DASHSCOPE_API_KEY", None)
        else:
            os.environ["DASHSCOPE_API_KEY"] = saved_key

    assert result == "https://example.test/result.png"
    assert seen["timeout"] == 35
    assert seen["payload"]["input"]["messages"][0]["content"][:2] == [
        {"image": "data:person"},
        {"image": "https://storage.test/dress.png"},
    ]


def test_tryon_uses_person_and_garment_references_with_sleeve_constraints():
    seen = {}

    def generate(images, prompt, feature):
        seen["images"] = images
        seen["prompt"] = prompt
        seen["feature"] = feature
        return "https://example.test/tryon.png"

    def verify(image_ref, items):
        seen["verified_image"] = image_ref
        seen["verified_items"] = items
        return {"ok": True, "reason": ""}

    result = ai_features.tryon_image({
        "image_url": "data:image/png;base64,AA==",
        "items": [
            {
                "name": "黑色连衣裙",
                "category": "连体装",
                "color": "黑色",
                "material": "醋酸",
                "sleeve_length": "无袖",
                "fit_type": "修身",
                "description": "宽肩无袖连衣裙",
                "image_url": "https://storage.test/dress.png",
            },
            {
                "name": "高跟鞋",
                "category": "鞋履",
                "color": "黑色",
                "image_url": "https://storage.test/shoes.png",
            },
        ],
        "scene": "park",
    }, generate=generate, verify=verify)

    assert result == "https://example.test/tryon.png"
    assert seen["images"] == [
        "data:image/png;base64,AA==",
        "https://storage.test/dress.png",
        "https://storage.test/shoes.png",
    ]
    assert seen["feature"] == "tryon"
    assert "无袖" in seen["prompt"] and "吊带" in seen["prompt"]
    assert seen["verified_items"][0]["sleeve_length"] == "无袖"


def test_tryon_quality_failure_regenerates_the_whole_result_once():
    generated = []

    def generate(_images, _prompt, _feature):
        value = "bad.png" if not generated else "good.png"
        generated.append(value)
        return value

    result = ai_features.tryon_image({
        "image_url": "data:image/png;base64,AA==",
        "items": [{"name": "白衬衫", "category": "上装", "color": "白色"}],
        "scene": "office",
    }, generate=generate, verify=lambda image_ref, _items: {
        "ok": image_ref == "good.png",
        "reason": "发现伪水印" if image_ref == "bad.png" else "",
    })

    assert result == "good.png"
    assert generated == ["bad.png", "good.png"]


def test_tryon_records_generation_and_quality_stage_timings():
    stages = []

    @contextmanager
    def stage(name):
        stages.append(name)
        yield

    result = ai_features.tryon_image({
        "image_url": "data:image/png;base64,AA==",
        "items": [{"name": "白衬衫", "category": "上装", "color": "白色"}],
    }, generate=lambda _images, _prompt, _feature: "good.png",
       verify=lambda _image, _items: {"ok": True, "reason": ""},
       stage_timer=stage)

    assert result == "good.png"
    assert stages == ["tryon.generate.1", "tryon.verify.1"]


def test_tryon_never_returns_a_second_unverified_image():
    generated = []

    def generate(_images, _prompt, _feature):
        value = "bad-" + str(len(generated) + 1) + ".png"
        generated.append(value)
        return value

    try:
        ai_features.tryon_image({
            "image_url": "data:image/png;base64,AA==",
            "items": [{"name": "黑色连衣裙", "category": "连体装", "color": "黑色"}],
        }, generate=generate, verify=lambda _image, _items: {
            "ok": False,
            "reason": "仍有伪水印",
        })
        assert False, "second unverified try-on image must be rejected"
    except ai_features.VisionError as error:
        assert "quality verification" in str(error)

    assert generated == ["bad-1.png", "bad-2.png"]


def test_tryon_quality_verifier_rejects_fake_text_and_sleeve_drift():
    verifier = getattr(ai_features, "verify_tryon_output", None)
    assert callable(verifier)
    saved_key = os.environ.get("DASHSCOPE_API_KEY")
    original = ai_features._chat_completion
    responses = iter([
        '{"has_text_or_watermark":true,"garment_match":true,"detail_match":false,"sleeve_match":false,"sleeveless_not_straps":false,"reason":"右下角伪水印且无袖变吊带"}',
        '{"has_text_or_watermark":false,"garment_match":true,"detail_match":true,"sleeve_match":true,"sleeveless_not_straps":true,"reason":""}',
    ])
    seen = {}
    os.environ["DASHSCOPE_API_KEY"] = "test-key"
    ai_features._chat_completion = (
        lambda _base, _key, model, messages, _temperature, timeout, _json_mode:
        seen.update(model=model, messages=messages, timeout=timeout) or next(responses)
    )
    items = [{
        "name": "黑色连衣裙",
        "category": "连体装",
        "color": "黑色",
        "material": "醋酸",
        "sleeve_length": "无袖",
        "fit_type": "修身",
        "description": "宽肩无袖连衣裙",
        "image_url": "https://storage.test/dress.png",
    }]
    try:
        rejected = verifier("https://example.test/bad.png", items)
        accepted = verifier("https://example.test/good.png", items)
    finally:
        ai_features._chat_completion = original
        if saved_key is None:
            os.environ.pop("DASHSCOPE_API_KEY", None)
        else:
            os.environ["DASHSCOPE_API_KEY"] = saved_key

    assert rejected["ok"] is False and "伪水印" in rejected["reason"]
    assert accepted["ok"] is True
    prompt = str(seen["messages"])
    assert "社交媒体标记" in prompt and "sleeve_length" in prompt
    assert "细肩带" in prompt and "宽肩无袖连衣裙" in prompt
    assert "https://storage.test/dress.png" not in prompt
    assert seen["timeout"] == 10


def test_multi_recognition_uses_server_deadline_env():
    saved_key = os.environ.get("DASHSCOPE_API_KEY")
    saved_timeout = os.environ.get("VL_MULTI_TIMEOUT_SECONDS")
    saved_model = os.environ.get("VL_MULTI_MODEL")
    saved_max_pixels = os.environ.get("VL_MULTI_MAX_PIXELS")
    original = ai_features._chat_completion
    seen = {}
    os.environ["DASHSCOPE_API_KEY"] = "test-key"
    os.environ["VL_MULTI_TIMEOUT_SECONDS"] = "17"
    os.environ["VL_MULTI_MODEL"] = "qwen3-vl-flash"
    os.environ["VL_MULTI_MAX_PIXELS"] = "1048576"
    ai_features._chat_completion = lambda base_url, key, model, messages, temperature, timeout, json_mode: (
        seen.update(timeout=timeout, model=model, messages=messages) or '{"items":[]}'
    )
    try:
        source = _png_data_uri()
        result = ai_features.recognize_many(source)
        assert result["items"] == [] and result["provider"] == "qwen3-vl-flash"
        assert result["input_info"]["compressed"] is True
        assert result["input_info"]["width"] * result["input_info"]["height"] <= 1048576
        assert seen["timeout"] == 17
        assert seen["model"] == "qwen3-vl-flash"
        assert seen["messages"][1]["content"][1]["max_pixels"] == 1048576
        sent_ref = seen["messages"][1]["content"][1]["image_url"]["url"]
        assert sent_ref.startswith("data:image/jpeg;base64,")
        assert len(sent_ref) < len(source)
        prompt = str(seen["messages"])
        assert "白底商品图优先判为 web" in prompt
        assert "有真实环境背景" in prompt
        assert '"bbox_2d"' in prompt and "0-1000" in prompt
    finally:
        ai_features._chat_completion = original
        if saved_key is None:
            os.environ.pop("DASHSCOPE_API_KEY", None)
        else:
            os.environ["DASHSCOPE_API_KEY"] = saved_key
        if saved_timeout is None:
            os.environ.pop("VL_MULTI_TIMEOUT_SECONDS", None)
        else:
            os.environ["VL_MULTI_TIMEOUT_SECONDS"] = saved_timeout
        if saved_model is None:
            os.environ.pop("VL_MULTI_MODEL", None)
        else:
            os.environ["VL_MULTI_MODEL"] = saved_model
        if saved_max_pixels is None:
            os.environ.pop("VL_MULTI_MAX_PIXELS", None)
        else:
            os.environ["VL_MULTI_MAX_PIXELS"] = saved_max_pixels


def test_multi_max_pixels_rejects_invalid_or_unsafe_values():
    saved = os.environ.get("VL_MULTI_MAX_PIXELS")
    try:
        os.environ["VL_MULTI_MAX_PIXELS"] = "invalid"
        assert ai_features.multi_max_pixels() == 1048576
        os.environ["VL_MULTI_MAX_PIXELS"] = "1"
        assert ai_features.multi_max_pixels() == 65536
        os.environ["VL_MULTI_MAX_PIXELS"] = "99999999"
        assert ai_features.multi_max_pixels() == 16777216
    finally:
        if saved is None:
            os.environ.pop("VL_MULTI_MAX_PIXELS", None)
        else:
            os.environ["VL_MULTI_MAX_PIXELS"] = saved


def test_multi_item_normalizes_only_valid_target_boxes():
    valid = ai_features.normalize_multi_item({
        "category": "包袋",
        "color": "米色",
        "material": "藤编",
        "description": "藤编水桶包",
        "photo_type": "flatlay",
        "bbox_2d": [80, 120, 360, 620],
    }, 0)
    invalid = ai_features.normalize_multi_item({
        "category": "鞋履",
        "color": "粉色",
        "material": "反绒皮",
        "description": "乐福鞋",
        "photo_type": "flatlay",
        "bbox_2d": [400, 500, 200, 900],
    }, 1)

    assert valid["bbox_2d"] == [80, 120, 360, 620]
    assert "bbox_2d" not in invalid
    assert valid["needs_review"] is False
    assert invalid["needs_review"] is True


def test_multi_item_rejects_unsupported_sleeve_values():
    item = ai_features.normalize_multi_item({
        "category": "上装",
        "color": "黑色",
        "material": "棉",
        "description": "黑色七分袖上衣",
        "photo_type": "flatlay",
        "bbox_2d": [100, 100, 900, 900],
        "sleeve_length": "七分袖",
    }, 0)

    assert item["sleeve_length"] is None
    assert item["needs_review"] is True


def main():
    test_no_keys_do_not_call_external_models()
    test_tryon_prompt_is_built_server_side()
    test_tryon_edit_parameters_suppress_text_without_breaking_legacy_model()
    test_tryon_image_edit_uses_bounded_deadline_and_multiple_references()
    test_tryon_uses_person_and_garment_references_with_sleeve_constraints()
    test_tryon_quality_failure_regenerates_the_whole_result_once()
    test_tryon_records_generation_and_quality_stage_timings()
    test_tryon_never_returns_a_second_unverified_image()
    test_tryon_quality_verifier_rejects_fake_text_and_sleeve_drift()
    test_multi_recognition_uses_server_deadline_env()
    test_multi_max_pixels_rejects_invalid_or_unsafe_values()
    test_multi_item_normalizes_only_valid_target_boxes()
    test_multi_item_rejects_unsupported_sleeve_values()
    print("ok")


if __name__ == "__main__":
    main()
