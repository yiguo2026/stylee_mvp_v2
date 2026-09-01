from __future__ import annotations

import base64
import io
import math

from PIL import Image, UnidentifiedImageError

from .alpha_matte import MAX_INPUT_BYTES, MAX_INPUT_PIXELS, read_image_ref


class TargetCropError(RuntimeError):
    def __init__(self, message: str):
        super().__init__(message)
        self.stage = "A2.target_crop"


def _box(value) -> tuple[float, float, float, float]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise TargetCropError("target box must contain four coordinates")
    if any(
        isinstance(coordinate, bool)
        or not isinstance(coordinate, (int, float))
        or not math.isfinite(coordinate)
        or coordinate < 0
        or coordinate > 1000
        for coordinate in value
    ):
        raise TargetCropError("target box coordinates must be within 0..1000")
    left, top, right, bottom = (float(coordinate) for coordinate in value)
    if right <= left or bottom <= top:
        raise TargetCropError("target box must have positive area")
    return left, top, right, bottom


def crop_target_image(ref: str, bbox, padding: float = 0.08) -> str:
    left, top, right, bottom = _box(bbox)
    if not isinstance(padding, (int, float)) or padding < 0 or padding > 0.5:
        raise TargetCropError("target crop padding is invalid")
    try:
        data = read_image_ref(ref)
        with Image.open(io.BytesIO(data)) as source:
            width, height = source.size
            if width * height > MAX_INPUT_PIXELS:
                raise TargetCropError("target crop source exceeds the pixel limit")
            source.load()
            image = source.convert("RGBA")
    except TargetCropError:
        raise
    except (OSError, UnidentifiedImageError, ValueError):
        raise TargetCropError("target crop source could not be decoded") from None

    box_width = right - left
    box_height = bottom - top
    pad_x = box_width * float(padding)
    pad_y = box_height * float(padding)
    pixel_box = (
        max(0, math.floor((left - pad_x) * width / 1000)),
        max(0, math.floor((top - pad_y) * height / 1000)),
        min(width, math.ceil((right + pad_x) * width / 1000)),
        min(height, math.ceil((bottom + pad_y) * height / 1000)),
    )
    if pixel_box[2] <= pixel_box[0] or pixel_box[3] <= pixel_box[1]:
        raise TargetCropError("target crop resolved to an empty image")

    output = io.BytesIO()
    image.crop(pixel_box).save(output, format="PNG", optimize=True)
    encoded = output.getvalue()
    if len(encoded) > MAX_INPUT_BYTES:
        raise TargetCropError("target crop exceeds the input size limit")
    return "data:image/png;base64," + base64.b64encode(encoded).decode("ascii")
