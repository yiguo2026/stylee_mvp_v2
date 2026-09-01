import base64
import io

from PIL import Image

from stylee.vision.target_crop import TargetCropError, crop_target_image


def source_image() -> str:
    image = Image.new("RGB", (100, 100), "white")
    for y in range(30, 80):
        for x in range(20, 60):
            image.putpixel((x, y), (220, 20, 20))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def decode(ref: str) -> Image.Image:
    data = base64.b64decode(ref.split(",", 1)[1])
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def test_crop_target_image_uses_normalized_box():
    cropped = decode(crop_target_image(source_image(), [200, 300, 600, 800], padding=0))
    assert cropped.size == (40, 50)
    assert cropped.convert("RGB").getpixel((20, 25)) == (220, 20, 20)


def test_crop_target_image_rejects_invalid_box():
    try:
        crop_target_image(source_image(), [600, 300, 200, 800])
        assert False, "reversed target box must be rejected"
    except TargetCropError as error:
        assert error.stage == "A2.target_crop"


def main():
    test_crop_target_image_uses_normalized_box()
    test_crop_target_image_rejects_invalid_box()
    print("ok")


if __name__ == "__main__":
    main()
