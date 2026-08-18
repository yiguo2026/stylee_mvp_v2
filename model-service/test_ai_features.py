import base64
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
        })
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


def main():
    test_no_keys_do_not_call_external_models()
    test_tryon_prompt_is_built_server_side()
    test_tryon_edit_parameters_suppress_text_without_breaking_legacy_model()
    test_multi_recognition_uses_server_deadline_env()
    test_multi_max_pixels_rejects_invalid_or_unsafe_values()
    print("ok")


if __name__ == "__main__":
    main()
