"""触点 A 的两个模型接口:理解(VisionProvider) 与 生成(ImageStandardizer)。

唯一打模型的地方;mock 与真实现都热替换这两个接口,ingest 脊柱一行不改。
图片统一以 image_url(data: 或 http:)传入。
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..contracts import WardrobeItem


class VisionProvider(ABC):
    name: str = "base"

    @abstractmethod
    def recognize(self, image_url: str) -> dict:
        """看图 → 原始属性 dict(schema 见 prompts.RECOGNIZE_SCHEMA)。"""
        raise NotImplementedError

    @abstractmethod
    def verify(self, image_url: str, expected: dict) -> dict:
        """回验标准化图是否与期望属性漂移 → {"drift": bool, "reason": str}。"""
        raise NotImplementedError


class ImageStandardizer(ABC):
    name: str = "base"

    @abstractmethod
    def standardize(self, image_url: str, item: WardrobeItem, mode: str) -> str:
        """以原图为条件生成标准化展示图,返回结果图 url。mode ∈ {cutout, img2img}。"""
        raise NotImplementedError
