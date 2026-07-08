"""真 provider:识别/回验 qwen3-vl-plus(OpenAI-compatible chat,含图);
标准化 qwen-image-edit(图生图/img2img,multimodal-generation 同步端点,base64 进、图 URL 出)。

纯 urllib,自动走环境代理。识别复用 providers.openai_compat 的 _chat_completion。
注:qwen-image-edit 返回的 OSS URL 会过期,落库由调用方负责。
图像模型选型约定:图生图/图片编辑 → qwen-image-edit;文生图(如从零合成) → qwen-image。
标准化两种模式(cutout/img2img)都带输入图,故统一走 qwen-image-edit。
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

from ..usage_log import log_usage

from ..contracts import WardrobeItem
from ..providers.openai_compat import _chat_completion
from . import prompts
from .base import ImageStandardizer, VisionProvider
from .mock import MockImageStandardizer, MockVisionProvider


class VisionError(RuntimeError):
    pass


_EDIT_PROMPTS = {
    "cutout": "去掉背景,把这件衣物单独放到纯白背景上,平铺商品图,保留原本的颜色、材质和图案。",
    "img2img": "以这张图里的衣物为准,重绘成干净的纯白背景平铺商品图,保留颜色、材质、版型和图案,不要人物。",
}

_MM_URL_PATH = "/services/aigc/multimodal-generation/generation"


# --- 标准化:请求/响应纯函数(可离线测) ---
def build_edit_payload(model: str, image_url: str, prompt: str) -> dict:
    return {"model": model, "input": {"messages": [{"role": "user", "content": [
        {"image": image_url}, {"text": prompt}]}]}, "parameters": {}}


def parse_edit_response(body: dict) -> str:
    try:
        return body["output"]["choices"][0]["message"]["content"][0]["image"]
    except (KeyError, IndexError, TypeError):
        raise VisionError(f"标准化响应无图: {str(body)[:200]}") from None


class DashScopeVisionProvider(VisionProvider):
    def __init__(self, base_url: str, api_key: str, model: str, timeout: int = 60):
        if not api_key:
            raise VisionError("DashScopeVisionProvider: 缺少 api_key(DASHSCOPE_API_KEY)")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.name = model
        self.timeout = timeout

    def recognize(self, image_url: str) -> dict:
        content = _chat_completion(self.base_url, self.api_key, self.model,
                                   prompts.build_recognize_messages(image_url),
                                   0.2, self.timeout, True)
        return prompts.parse_recognize_json(content)

    def verify(self, image_url: str, expected: dict) -> dict:
        content = _chat_completion(self.base_url, self.api_key, self.model,
                                   prompts.build_verify_messages(image_url, expected),
                                   0.0, self.timeout, True)
        return prompts.parse_verify_json(content)


class DashScopeImageStandardizer(ImageStandardizer):
    def __init__(self, base_url: str, api_key: str, model: str, timeout: int = 60):
        if not api_key:
            raise VisionError("DashScopeImageStandardizer: 缺少 api_key")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.name = model
        self.timeout = timeout

    def standardize(self, image_url: str, item: WardrobeItem, mode: str) -> str:
        prompt = _EDIT_PROMPTS.get(mode, _EDIT_PROMPTS["img2img"])
        data = json.dumps(build_edit_payload(self.model, image_url, prompt)).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + _MM_URL_PATH, data=data, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.api_key}"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            log_usage("qwen", self.model, "standardize", "image", None, int((time.time() - t0) * 1000), False)
            raise VisionError(f"HTTP {e.code}: {e.read().decode('utf-8','replace')[:200]}") from None
        except urllib.error.URLError as e:
            log_usage("qwen", self.model, "standardize", "image", None, int((time.time() - t0) * 1000), False)
            raise VisionError(f"网络错误: {e.reason}") from None
        log_usage("qwen", self.model, "standardize", "image", body.get("usage"),
                  int((time.time() - t0) * 1000), True, body.get("request_id"))
        return parse_edit_response(body)


_DASHSCOPE = "https://dashscope.aliyuncs.com"


def build_vision_provider() -> VisionProvider:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        print("[vision] 无 key → MockVisionProvider 降级")
        return MockVisionProvider()
    return DashScopeVisionProvider(
        base_url=os.environ.get("VL_BASE_URL", _DASHSCOPE + "/compatible-mode/v1"),
        api_key=key, model=os.environ.get("VL_MODEL", "qwen3-vl-plus"))


def build_image_standardizer() -> ImageStandardizer:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        print("[vision] 无 key → MockImageStandardizer 降级")
        return MockImageStandardizer()
    return DashScopeImageStandardizer(
        base_url=os.environ.get("IMG_BASE_URL", _DASHSCOPE + "/api/v1"),
        api_key=key, model=os.environ.get("IMG_EDIT_MODEL", "qwen-image-edit"))
