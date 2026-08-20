#!/usr/bin/env python3
"""Authenticated production smoke checks with redacted scalar-only logs."""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time
from typing import Callable, Mapping
import urllib.error
import urllib.request

from PIL import Image, UnidentifiedImageError

_REPOSITORY_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPOSITORY_ROOT not in sys.path:
    sys.path.insert(0, _REPOSITORY_ROOT)

from stylee.vision.alpha_matte import (
    AlphaMatteError,
    MAX_INPUT_PIXELS,
    read_provider_image_ref,
)


MAX_RESPONSE_BYTES = 20 * 1024 * 1024
OVERALL_TIMEOUT_SECONDS = 600.0
REQUIRED_ENVIRONMENT = (
    "STYLEE_SMOKE_SUPABASE_URL",
    "STYLEE_SMOKE_SUPABASE_ANON_KEY",
    "STYLEE_SMOKE_EMAIL",
    "STYLEE_SMOKE_PASSWORD",
)
SAFE_LOG_KEYS = {"status", "request_id", "stage", "duration_ms", "contract"}


class SmokeError(RuntimeError):
    """A safe release-smoke failure identified only by a stable code."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _safe_scalar(value: object, limit: int = 80) -> str:
    text = str(value or "-")
    return "".join(
        character if character.isalnum() or character in "._:-" else "_"
        for character in text
    )[:limit] or "-"


def _emit(*, stage: str, status: object, request_id: object,
          duration_ms: int, contract: str) -> None:
    record = {
        "stage": _safe_scalar(stage),
        "status": status if isinstance(status, int) else _safe_scalar(status),
        "request_id": _safe_scalar(request_id),
        "duration_ms": max(0, int(duration_ms)),
        "contract": _safe_scalar(contract),
    }
    assert set(record) == SAFE_LOG_KEYS
    print(json.dumps(record, separators=(",", ":")), flush=True)


def load_smoke_environment(environ: Mapping[str, str]) -> dict[str, str]:
    values = {name: str(environ.get(name) or "").strip() for name in REQUIRED_ENVIRONMENT}
    if any(not value for value in values.values()):
        raise SmokeError("missing_smoke_secrets")
    if not values["STYLEE_SMOKE_SUPABASE_URL"].startswith("https://"):
        raise SmokeError("invalid_supabase_url")
    return {
        "supabase_url": values["STYLEE_SMOKE_SUPABASE_URL"],
        "supabase_anon_key": values["STYLEE_SMOKE_SUPABASE_ANON_KEY"],
        "email": values["STYLEE_SMOKE_EMAIL"],
        "password": values["STYLEE_SMOKE_PASSWORD"],
    }


def _request_json(
    *,
    url: str,
    payload: dict,
    headers: dict[str, str],
    timeout: float,
    stage: str,
    opener: Callable,
) -> tuple[dict, dict[str, object]]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, separators=(",", ":")).encode(),
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    started = time.monotonic()
    try:
        with opener(request, timeout=timeout) as response:
            status = int(response.status)
            request_id = response.headers.get("X-Request-ID", "-")
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise SmokeError(f"{stage}_http_{error.code}") from None
    except (OSError, TimeoutError, urllib.error.URLError):
        raise SmokeError(f"{stage}_request_failed") from None
    duration_ms = round((time.monotonic() - started) * 1000)
    if status != 200:
        raise SmokeError(f"{stage}_http_{status}")
    if len(body) > MAX_RESPONSE_BYTES:
        raise SmokeError(f"{stage}_response_too_large")
    try:
        decoded = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SmokeError(f"{stage}_invalid_json") from None
    if not isinstance(decoded, dict):
        raise SmokeError(f"{stage}_invalid_contract")
    return decoded, {
        "status": status,
        "request_id": request_id,
        "duration_ms": duration_ms,
    }


def _real_provider(value: object) -> bool:
    provider = str(value or "").strip().lower()
    return bool(provider) and not provider.startswith("mock")


def _request_id(payload: dict, fallback: object, stage: str) -> str:
    trace = payload.get("trace")
    if not isinstance(trace, dict):
        raise SmokeError(f"{stage}_missing_trace")
    request_id = trace.get("request_id") or fallback
    if not isinstance(request_id, str) or not request_id:
        raise SmokeError(f"{stage}_missing_request_id")
    return request_id


def _log_success(stage: str, payload: dict, metadata: dict[str, object]) -> None:
    _emit(
        stage=stage,
        status=metadata["status"],
        request_id=_request_id(payload, metadata["request_id"], stage),
        duration_ms=int(metadata["duration_ms"]),
        contract="ok",
    )


def _validate_recognition(payload: dict) -> dict:
    if not _real_provider(payload.get("provider")):
        raise SmokeError("recognize-multi_mock_provider")
    items = payload.get("items")
    if not isinstance(items, list) or not items or not isinstance(items[0], dict):
        raise SmokeError("recognize-multi_empty_items")
    item = items[0]
    if not all(isinstance(item.get(field), str) and item[field] for field in (
        "category", "color", "material", "description", "photo_type",
    )):
        raise SmokeError("recognize-multi_invalid_item")
    if item.get("needs_review") is not False:
        raise SmokeError("recognize-multi_needs_review")
    return item


def _validate_standardization(payload: dict) -> None:
    if not _real_provider(payload.get("provider")):
        raise SmokeError("standardize_mock_provider")
    if not (
        payload.get("verified") is True
        and payload.get("alpha_verified") is True
        and payload.get("mime") == "image/png"
        and payload.get("background") == "transparent"
        and isinstance(payload.get("image_ref"), str)
        and payload["image_ref"].startswith("data:image/png;base64,")
    ):
        raise SmokeError("standardize_invalid_contract")


def _validate_recommendation(payload: dict) -> None:
    trace = payload.get("trace")
    outfits = payload.get("outfits")
    if not isinstance(trace, dict) or not _real_provider(trace.get("provider")):
        raise SmokeError("recommend_mock_provider")
    if trace.get("rag_mode") != "vector" or trace.get("degraded") is not False:
        raise SmokeError("recommend_degraded_contract")
    if not isinstance(outfits, list) or not outfits or not isinstance(outfits[0], dict):
        raise SmokeError("recommend_empty_outfits")


def _validate_tryon(
    payload: dict,
    provider_image_reader: Callable = read_provider_image_ref,
    timeout_seconds: float = 20,
) -> None:
    image_ref = payload.get("image_ref")
    if not isinstance(image_ref, str) or not image_ref.startswith("https://"):
        raise SmokeError("tryon-image_missing_real_image")
    try:
        image_bytes = provider_image_reader(image_ref, timeout_seconds)
    except (AlphaMatteError, OSError, ValueError):
        raise SmokeError("tryon-image_untrusted_image") from None
    if not isinstance(image_bytes, bytes) or not image_bytes:
        raise SmokeError("tryon-image_invalid_image")
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image_format = image.format
            width, height = image.size
            if image_format not in {"PNG", "JPEG", "WEBP"} or width * height > MAX_INPUT_PIXELS:
                raise SmokeError("tryon-image_invalid_image")
            image.verify()
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.load()
    except (OSError, UnidentifiedImageError, ValueError):
        raise SmokeError("tryon-image_invalid_image") from None


def _encoded_fixture(path: Path, expected_suffix: str) -> str:
    if path.suffix.lower() != expected_suffix or not path.is_file():
        raise SmokeError("missing_project_fixture")
    data = path.read_bytes()
    if not data or len(data) > 2 * 1024 * 1024:
        raise SmokeError("invalid_project_fixture")
    return base64.b64encode(data).decode()


def _ensure_deadline(deadline: float) -> None:
    if time.monotonic() >= deadline:
        raise SmokeError("release_smoke_deadline_exceeded")


def _request_timeout(deadline: float, normal_timeout: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise SmokeError("release_smoke_deadline_exceeded")
    return min(normal_timeout, remaining)


def _run_release_smoke_sequence(
    *,
    service_url: str,
    supabase_url: str,
    supabase_anon_key: str,
    email: str,
    password: str,
    garment_fixture: Path,
    person_fixture: Path,
    opener: Callable,
    provider_image_reader: Callable,
    deadline: float,
) -> dict:
    """Run one smoke sequence inside the outer bounded worker."""
    if not service_url.startswith("https://") or not supabase_url.startswith("https://"):
        raise SmokeError("invalid_smoke_url")
    garment_b64 = _encoded_fixture(Path(garment_fixture), ".png")
    person_b64 = _encoded_fixture(Path(person_fixture), ".jpg")
    stages = []
    _ensure_deadline(deadline)

    auth, metadata = _request_json(
        url=supabase_url.rstrip("/") + "/auth/v1/token?grant_type=password",
        payload={"email": email, "password": password},
        headers={
            "apikey": supabase_anon_key,
            "Authorization": f"Bearer {supabase_anon_key}",
        },
        timeout=_request_timeout(deadline, 20),
        stage="auth",
        opener=opener,
    )
    _ensure_deadline(deadline)
    token = auth.get("access_token")
    expires_in = auth.get("expires_in")
    if not (
        isinstance(token, str)
        and token
        and str(auth.get("token_type") or "").lower() == "bearer"
        and isinstance(expires_in, int)
        and not isinstance(expires_in, bool)
        and 0 < expires_in <= 3600
    ):
        raise SmokeError("auth_invalid_short_lived_token")
    _emit(
        stage="auth",
        status=metadata["status"],
        request_id=metadata["request_id"],
        duration_ms=int(metadata["duration_ms"]),
        contract="ok",
    )
    stages.append("auth")

    service_headers = {"Authorization": f"Bearer {token}"}
    service_root = service_url.rstrip("/")

    recognition, metadata = _request_json(
        url=service_root + "/recognize-multi",
        payload={"image_b64": garment_b64, "mime": "image/png"},
        headers={**service_headers, "X-Request-ID": "release-smoke-recognize-multi"},
        timeout=_request_timeout(deadline, 60),
        stage="recognize-multi",
        opener=opener,
    )
    _ensure_deadline(deadline)
    recognized_item = _validate_recognition(recognition)
    _log_success("recognize-multi", recognition, metadata)
    stages.append("recognize-multi")

    standardization, metadata = _request_json(
        url=service_root + "/standardize",
        payload={
            "image_b64": garment_b64,
            "mime": "image/png",
            "photo_type": recognized_item["photo_type"],
            "item": {
                "item_id": "release-smoke-garment",
                "category": recognized_item["category"],
                "color": recognized_item["color"],
                "material": recognized_item["material"],
                "description": recognized_item["description"],
            },
        },
        headers={**service_headers, "X-Request-ID": "release-smoke-standardize"},
        timeout=_request_timeout(deadline, 120),
        stage="standardize",
        opener=opener,
    )
    _ensure_deadline(deadline)
    _validate_standardization(standardization)
    _log_success("standardize", standardization, metadata)
    stages.append("standardize")

    wardrobe = [
        {"item_id": "smoke-top", "category": "上装", "color": "白色", "material": "棉"},
        {"item_id": "smoke-bottom", "category": "下装", "color": "黑色", "material": "牛仔"},
        {"item_id": "smoke-shoes", "category": "鞋", "color": "白色", "material": "皮"},
        {"item_id": "smoke-outer", "category": "外套", "color": "米色", "material": "棉"},
    ]
    recommendation, metadata = _request_json(
        url=service_root + "/recommend",
        payload={
            "input_mode": "nl",
            "query": "22度日间通勤，生成一套完整穿搭",
            "n": 2,
            "weather": {"temp_c": 22, "condition": "晴", "time_of_day": "day"},
            "wardrobe": wardrobe,
        },
        headers={**service_headers, "X-Request-ID": "release-smoke-recommend"},
        timeout=_request_timeout(deadline, 90),
        stage="recommend",
        opener=opener,
    )
    _ensure_deadline(deadline)
    _validate_recommendation(recommendation)
    _log_success("recommend", recommendation, metadata)
    stages.append("recommend")

    tryon, metadata = _request_json(
        url=service_root + "/tryon-image",
        payload={
            "image_b64": person_b64,
            "mime": "image/jpeg",
            "items": [
                {"name": "白色上衣", "category": "上装", "color": "白色"},
                {"name": "黑色长裤", "category": "下装", "color": "黑色"},
            ],
            "body_shape": "标准",
            "scene": "office",
        },
        headers={**service_headers, "X-Request-ID": "release-smoke-tryon-image"},
        timeout=_request_timeout(deadline, 120),
        stage="tryon-image",
        opener=opener,
    )
    _ensure_deadline(deadline)
    _validate_tryon(
        tryon,
        provider_image_reader=provider_image_reader,
        timeout_seconds=_request_timeout(deadline, 20),
    )
    _ensure_deadline(deadline)
    _log_success("tryon-image", tryon, metadata)
    stages.append("tryon-image")
    return {"status": "ok", "stages": stages}


def run_release_smoke(
    *,
    service_url: str,
    supabase_url: str,
    supabase_anon_key: str,
    email: str,
    password: str,
    garment_fixture: Path,
    person_fixture: Path,
    opener: Callable = urllib.request.urlopen,
    provider_image_reader: Callable = read_provider_image_ref,
    overall_timeout_seconds: float | None = None,
) -> dict:
    """Run the complete smoke sequence under one strict wall-clock deadline."""
    timeout = (
        OVERALL_TIMEOUT_SECONDS
        if overall_timeout_seconds is None
        else float(overall_timeout_seconds)
    )
    if timeout <= 0:
        raise SmokeError("release_smoke_deadline_exceeded")
    deadline = time.monotonic() + timeout
    results: queue.Queue[tuple[str, object, float]] = queue.Queue(maxsize=1)

    def run() -> None:
        try:
            value: tuple[str, object, float] = (
                "result",
                _run_release_smoke_sequence(
                    service_url=service_url,
                    supabase_url=supabase_url,
                    supabase_anon_key=supabase_anon_key,
                    email=email,
                    password=password,
                    garment_fixture=garment_fixture,
                    person_fixture=person_fixture,
                    opener=opener,
                    provider_image_reader=provider_image_reader,
                    deadline=deadline,
                ),
                time.monotonic(),
            )
        except Exception as error:
            value = ("error", error, time.monotonic())
        results.put_nowait(value)

    threading.Thread(target=run, name="stylee-release-smoke", daemon=True).start()
    try:
        kind, value, completed_at = results.get(timeout=timeout)
    except queue.Empty as error:
        raise SmokeError("release_smoke_deadline_exceeded") from error
    if completed_at >= deadline or time.monotonic() >= deadline:
        raise SmokeError("release_smoke_deadline_exceeded")
    if kind == "error":
        if isinstance(value, SmokeError):
            raise value
        raise SmokeError("release_smoke_internal_error")
    if not isinstance(value, dict):
        raise SmokeError("release_smoke_internal_error")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Authenticated Stylee production smoke gate")
    parser.add_argument("--service-url", required=True)
    parser.add_argument("--garment-fixture", type=Path, required=True)
    parser.add_argument("--person-fixture", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=float, default=OVERALL_TIMEOUT_SECONDS)
    args = parser.parse_args()
    try:
        config = load_smoke_environment(os.environ)
        run_release_smoke(
            service_url=args.service_url,
            garment_fixture=args.garment_fixture,
            person_fixture=args.person_fixture,
            overall_timeout_seconds=args.timeout_seconds,
            **config,
        )
    except SmokeError as error:
        _emit(
            stage="release-smoke",
            status="failed",
            request_id="-",
            duration_ms=0,
            contract=error.code,
        )
        raise SystemExit(1)
    except Exception:
        _emit(
            stage="release-smoke",
            status="failed",
            request_id="-",
            duration_ms=0,
            contract="internal_error",
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
