from __future__ import annotations

import base64
import binascii
from collections import deque
from contextlib import nullcontext
from dataclasses import dataclass
import http.client
import io
import ipaddress
import os
import socket
from typing import Callable, ContextManager, Mapping, Sequence
from urllib.parse import urljoin, urlsplit
import warnings

from PIL import Image, UnidentifiedImageError

from .base import AlphaMatteProcessor, ImageRefSource


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
MAX_PROVIDER_REDIRECTS = 3

_DASHSCOPE_RESULT_HOSTS = frozenset({
    "dashscope-7c2c.oss-cn-shanghai.aliyuncs.com",
    "dashscope-result-bj.oss-cn-beijing.aliyuncs.com",
    "dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com",
    "dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com",
    "dashscope-result-sh.oss-cn-shanghai.aliyuncs.com",
    "dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com",
})
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


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


@dataclass(frozen=True)
class ProviderHttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes


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


def read_image_ref(ref: str, timeout_seconds: int | float = 20) -> bytes:
    """Read an untrusted client source without performing network I/O."""
    if not isinstance(ref, str) or not ref:
        raise _source_error("source image reference is required")
    if ref.startswith("data:"):
        return _decode_data_uri(ref)
    raise _source_error("source image reference scheme is not supported")


def _normalize_host(host: str) -> str:
    if not host or host.endswith("."):
        raise _source_error("provider image host is not allowed")
    try:
        return host.encode("idna").decode("ascii").lower()
    except UnicodeError:
        raise _source_error("provider image host is not allowed") from None


def _configured_provider_hosts() -> tuple[str, ...]:
    hosts: set[str] = set()
    for value in os.environ.get("STYLEE_PROVIDER_IMAGE_HOSTS", "").split(","):
        value = value.strip()
        if value:
            hosts.add(_normalize_host(value))
    supabase_url = os.environ.get("STYLEE_SUPABASE_URL", "")
    if supabase_url:
        try:
            supabase_host = urlsplit(supabase_url).hostname
        except ValueError:
            supabase_host = None
        if supabase_host:
            hosts.add(_normalize_host(supabase_host))
    return tuple(sorted(hosts))


def _provider_host_allowed(host: str, allowed_hosts: Sequence[str]) -> bool:
    normalized_allowed = {_normalize_host(value) for value in allowed_hosts}
    return host in normalized_allowed or host in _DASHSCOPE_RESULT_HOSTS


def _default_resolver(host: str, port: int) -> Sequence[str]:
    try:
        answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise _source_error("provider image host could not be resolved") from None
    return tuple(dict.fromkeys(str(answer[4][0]) for answer in answers))


def _validated_connection_target(
    ref: str,
    allowed_hosts: Sequence[str],
    resolver: Callable[[str, int], Sequence[str]],
) -> str:
    try:
        parsed = urlsplit(ref)
        port = parsed.port or 443
        host_value = parsed.hostname or ""
    except ValueError:
        raise _source_error("provider image URL is malformed") from None
    if parsed.scheme.lower() != "https":
        raise _source_error("provider image URL must use HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise _source_error("provider image URL userinfo is not allowed")
    if port != 443:
        raise _source_error("provider image URL port is not allowed")

    host = _normalize_host(host_value)
    if not _provider_host_allowed(host, allowed_hosts):
        raise _source_error("provider image host is not allowed")

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        try:
            resolved = tuple(resolver(host, port))
        except AlphaMatteError:
            raise
        except (OSError, ValueError, TypeError):
            raise _source_error("provider image host could not be resolved") from None
    else:
        resolved = (str(literal),)

    if not resolved:
        raise _source_error("provider image host could not be resolved")
    validated: list[str] = []
    for value in resolved:
        if not isinstance(value, str) or "%" in value:
            raise _source_error("provider image host resolved to a disallowed address")
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            raise _source_error("provider image host resolved to a disallowed address") from None
        if not address.is_global:
            raise _source_error("provider image host resolved to a disallowed address")
        validated.append(str(address))
    return validated[0]


def _header(headers: Mapping[str, str], name: str) -> str | None:
    lowered = name.lower()
    for key, value in headers.items():
        if str(key).lower() == lowered:
            return str(value)
    return None


def _https_transport(
    ref: str,
    connect_ip: str,
    timeout_seconds: int | float,
) -> ProviderHttpResponse:
    parsed = urlsplit(ref)
    host = _normalize_host(parsed.hostname or "")
    port = parsed.port or 443
    connection = http.client.HTTPSConnection(host, port, timeout=timeout_seconds)

    def create_validated_connection(address, timeout=None, source_address=None):
        return socket.create_connection(
            (connect_ip, port), timeout=timeout, source_address=source_address,
        )

    connection._create_connection = create_validated_connection
    target = parsed.path or "/"
    if parsed.query:
        target += "?" + parsed.query
    response = None
    try:
        connection.request("GET", target, headers={"Accept": "image/png,image/jpeg"})
        response = connection.getresponse()
        headers = dict(response.getheaders())
        if response.status in _REDIRECT_STATUSES:
            body = b""
        else:
            content_length = _header(headers, "Content-Length")
            if content_length:
                try:
                    if int(content_length) > MAX_INPUT_BYTES:
                        raise _source_error("source image exceeds the input size limit")
                except ValueError:
                    raise _source_error("source image has an invalid content length") from None
            body = response.read(MAX_INPUT_BYTES + 1)
        return ProviderHttpResponse(status=response.status, headers=headers, body=body)
    finally:
        if response is not None:
            response.close()
        connection.close()


def read_provider_image_ref(
    ref: str,
    timeout_seconds: int | float = 20,
    *,
    allowed_hosts: Sequence[str] | None = None,
    resolver: Callable[[str, int], Sequence[str]] = _default_resolver,
    transport: Callable[[str, str, int | float], ProviderHttpResponse] = _https_transport,
) -> bytes:
    """Read a trusted provider output through a validated, pinned HTTPS target."""
    if not isinstance(ref, str) or not ref:
        raise _source_error("source image reference is required")
    if ref.startswith("data:"):
        return _decode_data_uri(ref)

    configured_hosts = _configured_provider_hosts() if allowed_hosts is None else allowed_hosts
    current_ref = ref
    for redirect_count in range(MAX_PROVIDER_REDIRECTS + 1):
        connect_ip = _validated_connection_target(current_ref, configured_hosts, resolver)
        try:
            response = transport(current_ref, connect_ip, timeout_seconds)
        except AlphaMatteError:
            raise
        except (OSError, http.client.HTTPException, ValueError):
            raise _source_error("provider image could not be downloaded") from None
        if not isinstance(response, ProviderHttpResponse):
            raise _source_error("provider image transport returned an invalid response")

        if response.status in _REDIRECT_STATUSES:
            if redirect_count >= MAX_PROVIDER_REDIRECTS:
                raise _source_error("provider image exceeded the redirect limit")
            location = _header(response.headers, "Location")
            if not location:
                raise _source_error("provider image redirect is missing a location")
            current_ref = urljoin(current_ref, location)
            continue
        if response.status != 200:
            raise _source_error("provider image download returned a non-success status")

        content_length = _header(response.headers, "Content-Length")
        if content_length:
            try:
                if int(content_length) > MAX_INPUT_BYTES:
                    raise _source_error("source image exceeds the input size limit")
            except ValueError:
                raise _source_error("source image has an invalid content length") from None
        if not isinstance(response.body, bytes):
            raise _source_error("provider image transport returned invalid bytes")
        _ensure_input_size(response.body)
        return response.body

    raise _source_error("provider image exceeded the redirect limit")


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

    def process(
        self,
        image_ref: str,
        stage_timer=None,
        source: ImageRefSource = ImageRefSource.CLIENT,
    ) -> AlphaMatteOutput:
        with _stage(stage_timer, "A2.source_image_download"):
            if source == ImageRefSource.CLIENT:
                data = read_image_ref(image_ref)
            elif source == ImageRefSource.PROVIDER_OUTPUT:
                data = read_provider_image_ref(image_ref)
            else:
                raise _source_error("source image trust classification is invalid")
        return matte_image_bytes(data, stage_timer=stage_timer)
