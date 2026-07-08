"""嵌入层 —— B2 向量检索用。

只用 stdlib。HashingEmbedder 是无 key 时的确定性占位(哈希词袋,非语义);
真 embedding 见 OpenAICompatEmbedder(Task 2)。建库与查询必须用同一 embedder
(靠 signature 校验),否则向量空间不可比。
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

from .usage_log import log_usage


class EmbeddingError(RuntimeError):
    pass


def l2_normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v))
    if n == 0:
        return list(v)
    return [x / n for x in v]


class EmbeddingClient(ABC):
    dim: int = 0
    name: str = "base"

    @abstractmethod
    def signature(self) -> str:
        """唯一标识向量空间(embedder 名+模型+维度),用于建库/查询一致性校验。"""
        raise NotImplementedError

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """返回 L2 归一化向量,长度 == dim。"""
        raise NotImplementedError


class HashingEmbedder(EmbeddingClient):
    name = "hashing"

    def __init__(self, dim: int = 256):
        self.dim = dim

    def signature(self) -> str:
        return f"hashing:{self.dim}"

    def _features(self, text: str) -> list[str]:
        # 单字 + 相邻 bigram,覆盖中文词法
        return list(text) + [text[i:i + 2] for i in range(len(text) - 1)]

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for t in texts:
            vec = [0.0] * self.dim
            for tok in self._features(t):
                h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
                vec[h % self.dim] += 1.0 if (h >> 7) & 1 else -1.0
            out.append(l2_normalize(vec))
        return out


# ---------------------------------------------------------------------------
# OpenAI-Compatible embedder(urllib,自动走环境代理;不引 SDK)
# ---------------------------------------------------------------------------
def build_embeddings_payload(texts: list[str], model: str, dim: int) -> dict:
    return {"model": model, "input": texts, "dimensions": dim,
            "encoding_format": "float"}


def parse_embeddings_response(body: dict) -> list[list[float]]:
    try:
        return [l2_normalize([float(x) for x in d["embedding"]])
                for d in body["data"]]
    except (KeyError, TypeError, ValueError):
        raise EmbeddingError(f"embedding 响应结构异常: {str(body)[:200]}") from None


class OpenAICompatEmbedder(EmbeddingClient):
    def __init__(self, base_url: str, model: str, api_key: str,
                 name: str = "openai_compat", dim: int = 1024,
                 batch: int = 64, timeout: int = 60):
        if not api_key:
            raise EmbeddingError(f"{name}: 缺少 api_key(设置 DASHSCOPE_API_KEY)")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.name = name
        self.dim = dim
        self.batch = batch
        self.timeout = timeout

    def signature(self) -> str:
        return f"{self.name}:{self.model}:{self.dim}"

    def _post(self, texts: list[str]) -> list[list[float]]:
        data = json.dumps(build_embeddings_payload(texts, self.model, self.dim)
                          ).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + "/embeddings", data=data, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.api_key}"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            log_usage("qwen", self.model, "embedding", "embedding", None, int((time.time() - t0) * 1000), False)
            detail = e.read().decode("utf-8", "replace")[:300]
            raise EmbeddingError(f"HTTP {e.code}: {detail}") from None
        except urllib.error.URLError as e:
            log_usage("qwen", self.model, "embedding", "embedding", None, int((time.time() - t0) * 1000), False)
            raise EmbeddingError(f"网络错误: {e.reason}") from None
        log_usage("qwen", self.model, "embedding", "embedding", body.get("usage"),
                  int((time.time() - t0) * 1000), True)
        return parse_embeddings_response(body)

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), self.batch):
            out.extend(self._post(texts[i:i + self.batch]))
        return out


def build_embedder() -> EmbeddingClient:
    """有 key → 真 embedder;无 key → Hashing 兜底(dev/test)。镜像 build_provider。"""
    key = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("EMBED_API_KEY")
    if not key:
        print("[embeddings] 无 key → HashingEmbedder 降级(dev/test)")
        return HashingEmbedder(dim=int(os.environ.get("EMBED_DIM", "256")))
    return OpenAICompatEmbedder(
        base_url=os.environ.get(
            "EMBED_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        model=os.environ.get("EMBED_MODEL", "text-embedding-v4"),
        api_key=key, dim=int(os.environ.get("EMBED_DIM", "1024")),
        # DashScope text-embedding 单次 batch 上限 ≤20;默认取 10 兼容,EMBED_BATCH 可调。
        batch=int(os.environ.get("EMBED_BATCH", "10")))
