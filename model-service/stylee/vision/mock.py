"""不打真模型的占位 provider:把 A1/A2 链路+测试今天就跑通。

刻意"哑":recognize 返回固定合法属性;standardize 返回 mock url。
真 key 到位换 dashscope.py 即出真结果,ingest 不动。
"""
from __future__ import annotations

import base64
import io

from PIL import Image

from ..contracts import WardrobeItem
from .alpha_matte import AlphaMatteError, AlphaMatteOutput, validate_alpha_png
from .base import AlphaMatteProcessor, ImageStandardizer, VisionProvider

_FIXED = {
    "category": "上装", "colors": ["白色"], "material": "棉",
    "sleeve": "长袖", "fit": "标准", "seasons": ["春", "秋"],
    "style_tags": ["通勤"], "occasion_tags": ["通勤"],
    "photo_type": "flatlay", "brand": "",
}


class MockVisionProvider(VisionProvider):
    name = "mock"

    def recognize(self, image_url: str) -> dict:
        return dict(_FIXED)

    def verify(self, image_url: str, expected: dict) -> dict:
        return {"drift": False, "reason": "mock"}


class MockImageStandardizer(ImageStandardizer):
    name = "mock"

    def standardize(self, image_url: str, item: WardrobeItem, mode: str) -> str:
        return f"mock://std/{mode}"


class MockAlphaMatteProcessor(AlphaMatteProcessor):
    name = "mock-alpha-matte-v1"

    def process(self, image_ref: str, stage_timer=None) -> AlphaMatteOutput:
        if not image_ref:
            raise AlphaMatteError("A2.source_image_download", "source image reference is required")

        from .alpha_matte import _stage

        with _stage(stage_timer, "A2.source_image_download"):
            pass
        with _stage(stage_timer, "A2.alpha_matte"):
            image = Image.new("RGBA", (4, 4), (0, 0, 0, 0))
            pixels = image.load()
            for y in (1, 2):
                for x in (1, 2):
                    pixels[x, y] = (64, 96, 160, 255)
        with _stage(stage_timer, "A2.png_encode"):
            output = io.BytesIO()
            image.save(output, format="PNG", optimize=True)
            png = output.getvalue()
        with _stage(stage_timer, "A2.alpha_validate"):
            stats = validate_alpha_png(png)
        return AlphaMatteOutput(
            data_uri="data:image/png;base64," + base64.b64encode(png).decode("ascii"),
            mime="image/png",
            alpha_verified=True,
            provider=self.name,
            stats=stats,
        )
