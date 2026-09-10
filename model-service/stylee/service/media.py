"""Bounded, local-only media preparation for App-owned storage."""
from __future__ import annotations

import base64
import binascii
import hashlib
import io
import math
import re
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from ..vision.alpha_matte import AlphaMatteError, validate_alpha_png


MAX_INPUT_BYTES = 8 * 1024 * 1024
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_INPUT_PIXELS = 16_000_000
MAX_EDGE = 1600
MAX_BASE64_CHARS = ((MAX_INPUT_BYTES + 2) // 3) * 4
# Allow the fixed JSON fields and bounded crop coordinates around base64.
MAX_REQUEST_BYTES = MAX_BASE64_CHARS + 1024
_BASE64 = re.compile(r"[A-Za-z0-9+/]*={0,2}")
_REQUIRED_FIELDS = {"media_version", "image_b64", "mime", "purpose"}


class MediaPreparationError(ValueError):
    """Only fixed public error codes reach HTTP responses or request logs."""

    def __init__(self, code: str = "invalid_media", status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


def _decode_base64(value: object) -> bytes:
    if not isinstance(value, str) or not value:
        raise MediaPreparationError()
    if len(value) > MAX_BASE64_CHARS:
        raise MediaPreparationError("media_too_large", 413)
    if len(value) % 4 or not _BASE64.fullmatch(value):
        raise MediaPreparationError()
    padding = len(value) - len(value.rstrip("="))
    if (len(value) // 4) * 3 - padding > MAX_INPUT_BYTES:
        raise MediaPreparationError("media_too_large", 413)
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise MediaPreparationError() from None
    # Also reject noncanonical padding bits; data URIs and URLs are never accepted.
    if not data or base64.b64encode(data).decode("ascii") != value:
        raise MediaPreparationError()
    if len(data) > MAX_INPUT_BYTES:
        raise MediaPreparationError("media_too_large", 413)
    return data


def _crop_coordinates(value: object) -> tuple[float, float, float, float]:
    if not isinstance(value, list) or len(value) != 4:
        raise MediaPreparationError("invalid_crop")
    if any(
        isinstance(coordinate, bool)
        or not isinstance(coordinate, (int, float))
        or not 0 <= coordinate <= 1000
        or not math.isfinite(coordinate)
        for coordinate in value
    ):
        raise MediaPreparationError("invalid_crop")
    left, top, right, bottom = value
    if right <= left or bottom <= top:
        raise MediaPreparationError("invalid_crop")
    return float(left), float(top), float(right), float(bottom)


def prepare_media(payload: dict) -> dict:
    """Decode, orient, optionally crop, strip metadata, and bind the returned bytes.

    This function performs no network I/O and constructs no model provider.
    Transparent media must already be valid RGBA PNG; this never makes a matte.
    """
    if not isinstance(payload, dict) or not _REQUIRED_FIELDS <= payload.keys():
        raise MediaPreparationError()
    if payload.keys() - (_REQUIRED_FIELDS | {"crop_2d"}):
        raise MediaPreparationError()
    if type(payload["media_version"]) is not int or payload["media_version"] != 1:
        raise MediaPreparationError("unsupported_media_version")
    mime = payload["mime"]
    purpose = payload["purpose"]
    if not isinstance(mime, str) or mime not in {"image/jpeg", "image/png"}:
        raise MediaPreparationError()
    if not isinstance(purpose, str) or purpose not in {"source", "transparent"}:
        raise MediaPreparationError()
    if purpose == "transparent" and mime != "image/png":
        raise MediaPreparationError("invalid_transparent_media")
    crop = _crop_coordinates(payload["crop_2d"]) if "crop_2d" in payload else None
    data = _decode_base64(payload["image_b64"])
    image_format = "JPEG" if mime == "image/jpeg" else "PNG"
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=("JPEG", "PNG")) as source:
                if source.width * source.height > MAX_INPUT_PIXELS:
                    raise MediaPreparationError("media_too_large", 413)
                if source.format != image_format or getattr(source, "n_frames", 1) != 1:
                    raise MediaPreparationError()
                if purpose == "transparent" and source.mode != "RGBA":
                    raise MediaPreparationError("invalid_transparent_media")
                source.load()
                if purpose == "transparent":
                    validate_alpha_png(data)
                image = ImageOps.exif_transpose(source)
                if image.mode == "I;16":
                    # Direct RGBA conversion clips 16-bit gray at 255. Scale the
                    # full 0..65535 range to 0..255, rounded to the nearest level.
                    samples = image.convert("I")
                    image = samples.point(lambda value: value / 257 + 0.5).convert("L")
                    image.info.clear()
                    transparent_sample = source.info.get("transparency")
                    if transparent_sample is not None:
                        # Match tRNS before quantization: neighboring samples may
                        # share an 8-bit gray level but have different alpha.
                        alpha_lut = [255] * 65536
                        alpha_lut[transparent_sample] = 0
                        image.putalpha(samples.point(alpha_lut, "L"))
                image = image.convert(
                    "RGB" if image_format == "JPEG" else "RGBA",
                )
            if crop is not None:
                left, top, right, bottom = crop
                image = image.crop((
                    math.floor(left * image.width / 1000),
                    math.floor(top * image.height / 1000),
                    math.ceil(right * image.width / 1000),
                    math.ceil(bottom * image.height / 1000),
                ))
            if max(image.size) > MAX_EDGE:
                scale = MAX_EDGE / max(image.size)
                image = image.resize((
                    max(1, round(image.width * scale)),
                    max(1, round(image.height * scale)),
                ), Image.Resampling.LANCZOS)

            # A fresh pixel image carries none of Pillow's source info/EXIF/text.
            clean = Image.new(image.mode, image.size)
            clean.paste(image)
            output = io.BytesIO()
            if image_format == "JPEG":
                clean.save(output, format="JPEG", quality=90, optimize=True)
            else:
                clean.save(output, format="PNG", optimize=True)
            encoded = output.getvalue()
            if len(encoded) > MAX_OUTPUT_BYTES:
                raise MediaPreparationError("media_too_large", 413)
            if purpose == "transparent":
                validate_alpha_png(encoded)
            # Read metadata from the actual returned encoding, after all transforms.
            with Image.open(io.BytesIO(encoded), formats=("JPEG", "PNG")) as prepared:
                prepared.load()
                width, height = prepared.size
                output_mime = {"JPEG": "image/jpeg", "PNG": "image/png"}[prepared.format]
    except MediaPreparationError:
        raise
    except AlphaMatteError:
        raise MediaPreparationError("invalid_transparent_media") from None
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise MediaPreparationError("media_too_large", 413) from None
    except (OSError, UnidentifiedImageError, ValueError, SyntaxError):
        raise MediaPreparationError() from None

    return {
        "media_version": 1,
        "image_b64": base64.b64encode(encoded).decode("ascii"),
        "mime": output_mime,
        "bytes": len(encoded),
        "width": width,
        "height": height,
        "sha256": hashlib.sha256(encoded).hexdigest(),
    }
