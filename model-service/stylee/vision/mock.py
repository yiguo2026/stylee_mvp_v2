"""不打真模型的占位 provider:把 A1/A2 链路+测试今天就跑通。

刻意"哑":recognize 返回固定合法属性;standardize 返回 mock url。
真 key 到位换 dashscope.py 即出真结果,ingest 不动。
"""
from __future__ import annotations

from ..contracts import WardrobeItem
from .base import ImageStandardizer, VisionProvider

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
