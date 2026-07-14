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


def main():
    test_no_keys_do_not_call_external_models()
    test_tryon_prompt_is_built_server_side()
    print("ok")


if __name__ == "__main__":
    main()
