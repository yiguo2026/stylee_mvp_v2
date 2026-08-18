from __future__ import annotations

import base64
from dataclasses import dataclass
import io
import math
import warnings

from PIL import Image, UnidentifiedImageError

from .alpha_matte import AlphaMatteError, MAX_INPUT_PIXELS, read_image_ref


RECOGNITION_MAX_EDGE = 1280
RECOGNITION_TARGET_PIXELS = 1_048_576
RECOGNITION_PASSTHROUGH_BYTES = 1_000_000
RECOGNITION_JPEG_QUALITY = 82


@dataclass(frozen=True)
class PreparedRecognitionImage:
    data_uri: str
    encoded_bytes: int
    width: int
    height: int
    compressed: bool


def _mime(ref: str) -> str:
    header = ref.partition(",")[0].lower()
    if header == "data:image/png;base64":
        return "image/png"
    if header in {"data:image/jpeg;base64", "data:image/jpg;base64"}:
        return "image/jpeg"
    raise ValueError("recognition input must be a PNG or JPEG data URI")


def _decode(ref: str) -> tuple[bytes, Image.Image, str]:
    mime = _mime(ref)
    try:
        data = read_image_ref(ref)
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                width, height = source.size
                if width * height > MAX_INPUT_PIXELS:
                    raise ValueError("recognition input exceeds the decoded pixel limit")
                source.load()
                image = source.convert("RGBA")
    except AlphaMatteError as error:
        raise ValueError(str(error)) from None
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("recognition input exceeds the decoded pixel limit") from None
    except (OSError, UnidentifiedImageError, ValueError) as error:
        if isinstance(error, ValueError):
            raise
        raise ValueError("recognition input could not be decoded") from None
    return data, image, mime


def _rgb(image: Image.Image) -> Image.Image:
    background = Image.new("RGBA", image.size, "white")
    background.alpha_composite(image)
    return background.convert("RGB")


def prepare_recognition_data_uri(ref: str) -> PreparedRecognitionImage:
    data, image, mime = _decode(ref)
    width, height = image.size
    if (
        width * height <= RECOGNITION_TARGET_PIXELS
        and max(width, height) <= RECOGNITION_MAX_EDGE
        and len(data) <= RECOGNITION_PASSTHROUGH_BYTES
    ):
        return PreparedRecognitionImage(ref, len(data), width, height, False)

    scale = min(
        1.0,
        RECOGNITION_MAX_EDGE / max(width, height),
        math.sqrt(RECOGNITION_TARGET_PIXELS / (width * height)),
    )
    target = (
        max(1, round(width * scale)),
        max(1, round(height * scale)),
    )
    prepared = _rgb(image).resize(target, Image.Resampling.LANCZOS)
    output = io.BytesIO()
    prepared.save(
        output,
        format="JPEG",
        quality=RECOGNITION_JPEG_QUALITY,
        optimize=True,
    )
    encoded = output.getvalue()
    data_uri = "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii")
    return PreparedRecognitionImage(data_uri, len(encoded), target[0], target[1], True)
