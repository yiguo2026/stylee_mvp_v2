from __future__ import annotations

import json
import re
import socket
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Iterator

from ..embeddings import EmbeddingError
from ..providers.openai_compat import ProviderError, ProviderTimeoutError
from ..vision.dashscope import VisionError


_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def normalize_request_id(value: str | None) -> str:
    candidate = (value or "").strip()
    if _REQUEST_ID.fullmatch(candidate):
        return candidate
    return f"stylee-{uuid.uuid4().hex}"


def _safe_message(error: BaseException) -> str:
    return " ".join(str(error).split())[:400] or type(error).__name__


def error_status(error: BaseException) -> int:
    message = str(error).lower()
    if isinstance(error, (TimeoutError, socket.timeout, ProviderTimeoutError)) or "timed out" in message or "timeout" in message or "调用超时" in message:
        return 504
    if isinstance(error, (ProviderError, EmbeddingError, VisionError, json.JSONDecodeError)):
        return 502
    return 500


@dataclass
class RequestTrace:
    feature: str
    request_id: str = field(default_factory=lambda: normalize_request_id(None))
    path: str = ""
    stage_ms: dict[str, int] = field(default_factory=dict)
    failed_stage: str | None = None
    attributes: dict[str, object] = field(default_factory=dict)
    fallbacks: list[dict[str, object]] = field(default_factory=list)
    _started_at: float = field(default_factory=time.perf_counter, init=False, repr=False)
    _current_stage: str = field(default="request", init=False, repr=False)

    @property
    def duration_ms(self) -> int:
        return max(0, round((time.perf_counter() - self._started_at) * 1000))

    @contextmanager
    def stage(self, name: str) -> Iterator[None]:
        previous = self._current_stage
        self._current_stage = name
        started_at = time.perf_counter()
        try:
            yield
        except BaseException:
            self._record_stage(name, started_at)
            if self.failed_stage is None:
                self.failed_stage = name
            raise
        else:
            self._record_stage(name, started_at)
            self._current_stage = previous

    def _record_stage(self, name: str, started_at: float) -> None:
        elapsed = max(0, round((time.perf_counter() - started_at) * 1000))
        self.stage_ms[name] = self.stage_ms.get(name, 0) + elapsed

    def annotate(self, **values: object) -> None:
        self.attributes.update({key: value for key, value in values.items() if value is not None})

    def record_fallback(self, stage: str, error: BaseException) -> None:
        self.fallbacks.append({
            "stage": stage,
            "error_type": type(error).__name__,
            "message": _safe_message(error),
        })

    def record_fallback_info(self, fallback: dict[str, object]) -> None:
        self.fallbacks.append({
            "stage": str(fallback.get("stage") or "unknown"),
            "error_type": str(fallback.get("error_type") or "Fallback"),
            "message": str(fallback.get("message") or "")[:400],
        })

    def response_summary(self) -> dict[str, object]:
        summary: dict[str, object] = {
            "request_id": self.request_id,
            "duration_ms": self.duration_ms,
            "stage_ms": dict(self.stage_ms),
            "degraded": bool(self.fallbacks),
        }
        if self.fallbacks:
            summary["fallbacks"] = list(self.fallbacks)
        summary.update(self.attributes)
        return summary

    def error_summary(self, error: BaseException) -> dict[str, object]:
        status = error_status(error)
        summary: dict[str, object] = {
            "error": "model_service_error",
            "message": _safe_message(error),
            "request_id": self.request_id,
            "stage": self.failed_stage or self._current_stage,
            "error_type": type(error).__name__,
            "duration_ms": self.duration_ms,
            "stage_ms": dict(self.stage_ms),
            "retryable": status in {502, 503, 504},
        }
        if self.fallbacks:
            summary["fallbacks"] = list(self.fallbacks)
        summary.update(self.attributes)
        return summary

    def emit(self, status: int, error: BaseException | None = None) -> None:
        record: dict[str, object] = {
            "event": "stylee_request",
            "feature": self.feature,
            "path": self.path,
            "status": status,
            "ok": status < 400,
            **self.response_summary(),
        }
        if error is not None:
            record.update({
                "stage": self.failed_stage or self._current_stage,
                "error_type": type(error).__name__,
                "message": _safe_message(error),
            })
        print(json.dumps(record, ensure_ascii=False, separators=(",", ":")), flush=True)
