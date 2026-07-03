from .base import LLMProvider
from .mock import MockProvider
from .openai_compat import OpenAICompatProvider, ProviderError, deepseek, qwen

__all__ = [
    "LLMProvider", "MockProvider", "OpenAICompatProvider", "ProviderError",
    "deepseek", "qwen", "build_provider",
]


def build_provider(name: str) -> LLMProvider:
    """按名字造 provider。没 key 时 deepseek/qwen 会抛 ProviderError,调用方可回退 mock。"""
    name = (name or "mock").lower()
    if name == "mock":
        return MockProvider()
    if name == "deepseek":
        return deepseek()
    if name == "qwen":
        return qwen()
    raise ValueError(f"未知 provider: {name}(可选 mock/deepseek/qwen)")
