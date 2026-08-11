from __future__ import annotations

import base64
import binascii
from collections import deque
from contextlib import nullcontext
from dataclasses import dataclass
import io
from typing import Callable, ContextManager
from urllib.parse import urlparse
import urllib.error
import urllib.request
import warnings

from PIL import Image, UnidentifiedImageError

from .base import AlphaMatteProcessor


MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_INPUT_PIXELS = 16_000_000
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_EDGE = 1600
TRANSPARENT_ALPHA_MAX = 16
VISIBLE_ALPHA_MIN = 32
MIN_TRANSPARENT_RATIO = 0.05
MIN_VISIBLE_RATIO = 0.05
MIN_TRANSPARENT_BORDER_RATIO = 0.90
MATTE_PROVIDER = "pillow-border-connected-v1"


class AlphaMatteError(RuntimeError):
    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage


@dataclass(frozen=True)
class AlphaStats:
    transparent_ratio: float
    visible_ratio: float
    transparent_border_ratio: float
    visible_bbox: tuple[int, int, int, int]


@dataclass(frozen=True)
class AlphaMatteOutput:
    data_uri: str
    mime: str
    alpha_verified: bool
    provider: str
    stats: AlphaStats


StageTimer = Callable[[str], ContextManager[None]]


def _stage(stage_timer: StageTimer | None, name: str) -> ContextManager[None]:
    if stage_timer is None:
        return nullcontext()
    return stage_timer(name)


def _source_error(message: str) -> AlphaMatteError:
    return AlphaMatteError("A2.source_image_download", message)


def _ensure_input_size(data: bytes) -> None:
    if len(data) > MAX_INPUT_BYTES:
        raise _source_error("source image exceeds the input size limit")


def _decode_data_uri(ref: str) -> bytes:
    header, separator, payload = ref.partition(",")
    if not separator or header.lower() not in {
        "data:image/png;base64",
        "data:image/jpeg;base64",
        "data:image/jpg;base64",
    }:
        raise _source_error("source image data URI must be base64 PNG or JPEG")
    if len(payload) % 4 != 0:
        raise _source_error("source image data URI is malformed")
    padding = len(payload) - len(payload.rstrip("="))
    decoded_size = (len(payload) // 4) * 3 - padding
    if decoded_size > MAX_INPUT_BYTES:
        raise _source_error("source image exceeds the input size limit")
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise _source_error("source image data URI is malformed") from None
    _ensure_input_size(data)
    return data


def _read_http_image(ref: str, timeout_seconds: int | float) -> bytes:
    request = urllib.request.Request(ref, headers={"Accept": "image/png,image/jpeg"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            if urlparse(response.geturl()).scheme.lower() not in {"http", "https"}:
                raise _source_error("source image redirect scheme is not supported")
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    if int(content_length) > MAX_INPUT_BYTES:
                        raise _source_error("source image exceeds the input size limit")
                except ValueError:
                    raise _source_error("source image has an invalid content length") from None
            data = response.read(MAX_INPUT_BYTES + 1)
    except AlphaMatteError:
        raise
    except (OSError, urllib.error.URLError, ValueError):
        raise _source_error("source image could not be downloaded") from None
    _ensure_input_size(data)
    return data


def read_image_ref(ref: str, timeout_seconds: int | float = 20) -> bytes:
    if not isinstance(ref, str) or not ref:
        raise _source_error("source image reference is required")
    if ref.startswith("data:"):
        return _decode_data_uri(ref)
    scheme = urlparse(ref).scheme.lower()
    if scheme in {"http", "https"}:
        return _read_http_image(ref, timeout_seconds)
    raise _source_error("source image reference scheme is not supported")


def _decode_image(data: bytes) -> Image.Image:
    if not isinstance(data, bytes):
        raise _source_error("source image must be encoded bytes")
    _ensure_input_size(data)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                width, height = source.size
                if width * height > MAX_INPUT_PIXELS:
                    raise _source_error("source image exceeds the decoded pixel limit")
                source.load()
                image = source.convert("RGBA")
    except AlphaMatteError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise _source_error("source image exceeds the decoded pixel limit") from None
    except (OSError, UnidentifiedImageError, ValueError):
        raise _source_error("source image could not be decoded") from None

    longest_edge = max(image.size)
    if longest_edge > MAX_EDGE:
        scale = MAX_EDGE / longest_edge
        size = (
            max(1, round(image.width * scale)),
            max(1, round(image.height * scale)),
        )
        image = image.resize(size, Image.Resampling.LANCZOS)
    return image


def soft_alpha(r: int, g: int, b: int) -> int:
    whiteness = (r + g + b) / 3
    return max(0, min(255, round((250 - whiteness) * 255 / 15)))


def _is_background(r: int, g: int, b: int) -> bool:
    return min(r, g, b) >= 235 and max(r, g, b) - min(r, g, b) <= 20


def _apply_border_connected_alpha(image: Image.Image) -> None:
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    pending: deque[int] = deque()

    def visit(x: int, y: int) -> None:
        index = y * width + x
        if visited[index]:
            return
        r, g, b, _ = pixels[x, y]
        if not _is_background(r, g, b):
            return
        visited[index] = 1
        pending.append(index)

    for x in range(width):
        visit(x, 0)
        if height > 1:
            visit(x, height - 1)
    for y in range(1, height - 1):
        visit(0, y)
        if width > 1:
            visit(width - 1, y)

    while pending:
        index = pending.popleft()
        x = index % width
        y = index // width
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, soft_alpha(r, g, b))
        if x > 0:
            visit(x - 1, y)
        if x + 1 < width:
            visit(x + 1, y)
        if y > 0:
            visit(x, y - 1)
        if y + 1 < height:
            visit(x, y + 1)


def _border_coordinates(width: int, height: int):
    for x in range(width):
        yield x, 0
        if height > 1:
            yield x, height - 1
    for y in range(1, height - 1):
        yield 0, y
        if width > 1:
            yield width - 1, y


def validate_alpha_png(data: bytes) -> AlphaStats:
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format != "PNG" or "A" not in source.getbands():
                raise AlphaMatteError("A2.alpha_validate", "output must be an RGBA PNG")
            source.load()
            image = source.convert("RGBA")
    except AlphaMatteError:
        raise
    except (OSError, UnidentifiedImageError, ValueError):
        raise AlphaMatteError("A2.alpha_validate", "output PNG could not be decoded") from None

    width, height = image.size
    pixels = image.load()
    total = width * height
    transparent = 0
    visible = 0
    left = width
    top = height
    right = -1
    bottom = -1

    for y in range(height):
        for x in range(width):
            alpha = pixels[x, y][3]
            if alpha <= TRANSPARENT_ALPHA_MAX:
                transparent += 1
            if alpha >= VISIBLE_ALPHA_MIN:
                visible += 1
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)

    border_total = 0
    transparent_border = 0
    for x, y in _border_coordinates(width, height):
        border_total += 1
        if pixels[x, y][3] <= TRANSPARENT_ALPHA_MAX:
            transparent_border += 1

    transparent_ratio = transparent / total
    visible_ratio = visible / total
    transparent_border_ratio = transparent_border / border_total
    if transparent_ratio < MIN_TRANSPARENT_RATIO:
        raise AlphaMatteError("A2.alpha_validate", "output has insufficient transparency")
    if visible_ratio < MIN_VISIBLE_RATIO:
        raise AlphaMatteError("A2.alpha_validate", "output has insufficient visible content")
    if transparent_border_ratio < MIN_TRANSPARENT_BORDER_RATIO:
        raise AlphaMatteError("A2.alpha_validate", "output border is insufficiently transparent")
    if right < left or bottom < top:
        raise AlphaMatteError("A2.alpha_validate", "output has no visible bounding box")

    return AlphaStats(
        transparent_ratio=transparent_ratio,
        visible_ratio=visible_ratio,
        transparent_border_ratio=transparent_border_ratio,
        visible_bbox=(left, top, right + 1, bottom + 1),
    )


def matte_image_bytes(data: bytes, stage_timer: StageTimer | None = None) -> AlphaMatteOutput:
    image = _decode_image(data)
    with _stage(stage_timer, "A2.alpha_matte"):
        _apply_border_connected_alpha(image)

    with _stage(stage_timer, "A2.png_encode"):
        output = io.BytesIO()
        try:
            image.save(output, format="PNG", optimize=True)
        except (OSError, ValueError):
            raise AlphaMatteError("A2.png_encode", "output PNG could not be encoded") from None
        png = output.getvalue()
        if len(png) > MAX_OUTPUT_BYTES:
            raise AlphaMatteError("A2.png_encode", "output PNG exceeds the size limit")

    with _stage(stage_timer, "A2.alpha_validate"):
        stats = validate_alpha_png(png)

    return AlphaMatteOutput(
        data_uri="data:image/png;base64," + base64.b64encode(png).decode("ascii"),
        mime="image/png",
        alpha_verified=True,
        provider=MATTE_PROVIDER,
        stats=stats,
    )


class PillowAlphaMatteProcessor(AlphaMatteProcessor):
    name = MATTE_PROVIDER

    def process(self, image_ref: str, stage_timer=None) -> AlphaMatteOutput:
        with _stage(stage_timer, "A2.source_image_download"):
            data = read_image_ref(image_ref)
        return matte_image_bytes(data, stage_timer=stage_timer)
