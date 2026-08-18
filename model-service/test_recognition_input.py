import base64
import io

from PIL import Image

from stylee.vision.recognition_input import prepare_recognition_data_uri


def _data_uri(image: Image.Image, fmt: str, quality: int = 92) -> str:
    output = io.BytesIO()
    save_args = {"quality": quality} if fmt == "JPEG" else {}
    image.save(output, format=fmt, **save_args)
    mime = "image/jpeg" if fmt == "JPEG" else "image/png"
    return f"data:{mime};base64," + base64.b64encode(output.getvalue()).decode("ascii")


def test_large_png_becomes_bounded_jpeg():
    source = _data_uri(Image.new("RGB", (1672, 2508), "beige"), "PNG")
    prepared = prepare_recognition_data_uri(source)
    assert prepared.data_uri.startswith("data:image/jpeg;base64,")
    assert max(prepared.width, prepared.height) <= 1280
    assert prepared.width * prepared.height <= 1_100_000
    assert prepared.encoded_bytes < 1_000_000
    assert prepared.compressed is True


def test_small_jpeg_is_not_reencoded():
    source = _data_uri(Image.new("RGB", (640, 960), "beige"), "JPEG", quality=82)
    prepared = prepare_recognition_data_uri(source)
    assert prepared.data_uri == source
    assert prepared.width == 640 and prepared.height == 960
    assert prepared.compressed is False


def test_unsupported_or_malformed_input_fails_closed():
    for value in ("https://example.com/x.png", "data:image/gif;base64,AAAA", "data:image/png;base64,***"):
        try:
            prepare_recognition_data_uri(value)
            assert False, f"expected rejection for {value[:24]}"
        except ValueError:
            pass


if __name__ == "__main__":
    test_large_png_becomes_bounded_jpeg()
    test_small_jpeg_is_not_reencoded()
    test_unsupported_or_malformed_input_fails_closed()
    print("ok")
