import os

from stylee.service import ai_features


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
    finally:
        ai_features.edit_image = original


def test_multi_recognition_uses_server_deadline_env():
    saved_key = os.environ.get("DASHSCOPE_API_KEY")
    saved_timeout = os.environ.get("VL_MULTI_TIMEOUT_SECONDS")
    saved_model = os.environ.get("VL_MULTI_MODEL")
    original = ai_features._chat_completion
    seen = {}
    os.environ["DASHSCOPE_API_KEY"] = "test-key"
    os.environ["VL_MULTI_TIMEOUT_SECONDS"] = "17"
    os.environ["VL_MULTI_MODEL"] = "qwen3-vl-flash"
    ai_features._chat_completion = lambda base_url, key, model, messages, temperature, timeout, json_mode: (
        seen.update(timeout=timeout, model=model) or '{"items":[]}'
    )
    try:
        result = ai_features.recognize_many("data:image/png;base64,AA==")
        assert result == {"items": [], "provider": "qwen3-vl-flash"}
        assert seen["timeout"] == 17
        assert seen["model"] == "qwen3-vl-flash"
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


def main():
    test_no_keys_do_not_call_external_models()
    test_tryon_prompt_is_built_server_side()
    test_multi_recognition_uses_server_deadline_env()
    print("ok")


if __name__ == "__main__":
    main()
