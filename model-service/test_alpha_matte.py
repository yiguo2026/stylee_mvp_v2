import base64
import io
import struct
import warnings
import zlib
from PIL import Image, ImageDraw
from stylee.vision.alpha_matte import AlphaMatteError, matte_image_bytes, read_image_ref, validate_alpha_png

def fixture_png(background=(255, 255, 255), white_center=False):
    image = Image.new("RGB", (100, 100), background)
    draw = ImageDraw.Draw(image)
    draw.rectangle((25, 20, 75, 80), fill=(25, 40, 55))
    if white_center:
        draw.rectangle((40, 35, 60, 65), fill=(255, 255, 255))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()

def fixture_png_header(width, height):
    raw = bytearray(fixture_png())
    raw[16:24] = struct.pack(">II", width, height)
    raw[29:33] = struct.pack(">I", zlib.crc32(raw[12:29]))
    return bytes(raw)

def test_connected_border_is_transparent_but_internal_white_survives():
    result = matte_image_bytes(fixture_png(white_center=True))
    png = base64.b64decode(result.data_uri.split(",", 1)[1])
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    assert image.getpixel((0, 0))[3] <= 16
    assert image.getpixel((50, 50))[3] >= 32
    assert result.alpha_verified is True

def test_off_white_canvas_fails_validation():
    try:
        matte_image_bytes(fixture_png((220, 220, 220)))
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.alpha_validate"

def test_data_uri_round_trip():
    raw = fixture_png()
    ref = "data:image/png;base64," + base64.b64encode(raw).decode()
    assert read_image_ref(ref) == raw
    stats = validate_alpha_png(base64.b64decode(matte_image_bytes(raw).data_uri.split(",", 1)[1]))
    assert stats.transparent_ratio >= 0.05
    assert stats.visible_ratio >= 0.05
    assert stats.transparent_border_ratio >= 0.90

def test_exact_input_limits_fail_closed():
    import stylee.vision.alpha_matte as matte
    oversized = base64.b64encode(b"x" * (matte.MAX_INPUT_BYTES + 1)).decode()
    try:
        read_image_ref("data:image/png;base64," + oversized)
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

    original_limit = matte.MAX_OUTPUT_BYTES
    matte.MAX_OUTPUT_BYTES = 1
    try:
        matte_image_bytes(fixture_png())
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.png_encode"
    finally:
        matte.MAX_OUTPUT_BYTES = original_limit

    large = Image.new("RGB", (4001, 4000), (255, 255, 255))
    out = io.BytesIO()
    large.save(out, format="PNG")
    try:
        matte_image_bytes(out.getvalue())
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

def test_pillow_decompression_bomb_error_is_source_error():
    try:
        matte_image_bytes(fixture_png_header(20_000, 20_000))
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

def test_pillow_decompression_bomb_warning_is_source_error():
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            matte_image_bytes(fixture_png_header(10_000, 10_000))
            assert False
        except AlphaMatteError as error:
            assert error.stage == "A2.source_image_download"

def main():
    test_connected_border_is_transparent_but_internal_white_survives()
    test_off_white_canvas_fails_validation()
    test_data_uri_round_trip()
    test_exact_input_limits_fail_closed()
    test_pillow_decompression_bomb_error_is_source_error()
    test_pillow_decompression_bomb_warning_is_source_error()
    print("ok")

if __name__ == "__main__":
    main()
