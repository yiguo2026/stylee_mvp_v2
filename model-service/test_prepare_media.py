"""Real image and local HTTP coverage; no provider credentials or calls."""
import base64
from contextlib import contextmanager, redirect_stdout
import hashlib
import http.client
from http.server import ThreadingHTTPServer
import io
import json
import os
import socket
import struct
import threading
import time
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw, PngImagePlugin, TiffImagePlugin

import stylee.service.server as service
from stylee.service.security import RateLimiter, TokenVerifier


def image_bytes(image, format="PNG", **kwargs):
    output = io.BytesIO()
    image.save(output, format=format, **kwargs)
    return output.getvalue()


def payload_for(raw, mime="image/png", purpose="source", **kwargs):
    return {
        "media_version": 1,
        "image_b64": base64.b64encode(raw).decode("ascii"),
        "mime": mime,
        "purpose": purpose,
        **kwargs,
    }


@contextmanager
def local_service(*, verifier=None, limit=100):
    with patch.dict(os.environ, {}, clear=True):
        if verifier is None:
            verifier = TokenVerifier()
            verifier.url = "https://auth.invalid"
            verifier.anon_key = "test-publishable-key"
            # Exercise the real verifier's existing cache without network/auth keys.
            verifier._cache["test-token"] = (time.time() + 60, "test-user")
        limiter = RateLimiter()
        limiter.limit = limit

        class LocalHandler(service.Handler):
            require_auth = True

        LocalHandler.verifier = verifier
        LocalHandler.limiter = limiter
        server = ThreadingHTTPServer(("127.0.0.1", 0), LocalHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_address
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def post(address, payload, *, authorization="Bearer test-token"):
    connection = http.client.HTTPConnection(*address, timeout=3)
    try:
        headers = {"Content-Type": "application/json"}
        if authorization is not None:
            headers["Authorization"] = authorization
        connection.request("POST", "/prepare-media", json.dumps(payload), headers)
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


def raw_post(address, headers, body=b"", *, trickle=False):
    stop = threading.Event()
    with socket.create_connection(address, timeout=2) as connection:
        connection.sendall((
            "POST /prepare-media HTTP/1.1\r\nHost: localhost\r\n"
            "Authorization: Bearer test-token\r\n" + headers + "\r\n\r\n"
        ).encode("ascii") + body)
        sender = None
        if trickle:
            def send_slowly():
                while not stop.wait(0.04):
                    try:
                        connection.sendall(b" ")
                    except OSError:
                        return
            sender = threading.Thread(target=send_slowly, daemon=True)
            sender.start()
        try:
            response = http.client.HTTPResponse(connection)
            response.begin()
            return response.status, json.loads(response.read())
        finally:
            stop.set()
            if sender is not None:
                sender.join(timeout=1)


def rgba_fixture(size=(100, 80)):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(image).rectangle(
        (size[0] // 4, size[1] // 4, size[0] * 3 // 4, size[1] * 3 // 4),
        fill=(50, 100, 150, 255),
    )
    return image


def private_exif(orientation=1):
    exif = Image.Exif()
    exif[274] = orientation
    exif[271] = "private-camera-marker"
    exif[34853] = {
        1: "N", 2: tuple(TiffImagePlugin.IFDRational(x) for x in (1, 2, 3)),
        3: "E", 4: tuple(TiffImagePlugin.IFDRational(x) for x in (4, 5, 6)),
    }
    return exif


class PrepareMediaHttpTests(unittest.TestCase):
    def setUp(self):
        self.request_logs = io.StringIO()
        captured = redirect_stdout(self.request_logs)
        captured.__enter__()
        self.addCleanup(captured.__exit__, None, None, None)

    def assert_image_result(self, result, *, mime, size):
        self.assertEqual(set(result), {
            "media_version", "image_b64", "mime", "bytes", "width", "height", "sha256",
        })
        output = base64.b64decode(result["image_b64"], validate=True)
        with Image.open(io.BytesIO(output)) as decoded:
            decoded.load()
            self.assertEqual(decoded.format, {"image/png": "PNG", "image/jpeg": "JPEG"}[mime])
            self.assertEqual(decoded.size, size)
            self.assertFalse(decoded.getexif())
            self.assertFalse({"exif", "icc_profile", "comment", "XML:com.adobe.xmp"} & set(decoded.info))
        self.assertEqual(result["media_version"], 1)
        self.assertEqual(result["mime"], mime)
        self.assertEqual((result["width"], result["height"]), size)
        self.assertEqual(result["bytes"], len(output))
        self.assertLessEqual(len(output), 8 * 1024 * 1024)
        self.assertEqual(result["sha256"], hashlib.sha256(output).hexdigest())
        return output

    def test_authenticated_route_returns_real_clean_jpeg_without_provider_calls(self):
        raw = image_bytes(Image.new("RGB", (40, 20), (100, 120, 140)), "JPEG")
        logs = io.StringIO()
        with local_service() as address, redirect_stdout(logs), patch(
            "urllib.request.urlopen", side_effect=AssertionError("network forbidden")
        ), patch.object(
            service, "build_provider", side_effect=AssertionError("provider forbidden")
        ), patch.object(
            service, "build_vision_provider", side_effect=AssertionError("provider forbidden")
        ), patch.object(
            service, "build_image_standardizer", side_effect=AssertionError("provider forbidden")
        ):
            status, result = post(address, payload_for(raw, "image/jpeg"))
        self.assertEqual(status, 200)
        self.assertEqual(set(result), {
            "media_version", "image_b64", "mime", "bytes", "width", "height", "sha256",
        })
        output = base64.b64decode(result["image_b64"], validate=True)
        with Image.open(io.BytesIO(output)) as image:
            image.load()
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, (40, 20))
        self.assertEqual(result["media_version"], 1)
        self.assertEqual(result["mime"], "image/jpeg")
        self.assertEqual(result["bytes"], len(output))
        self.assertEqual(result["sha256"], hashlib.sha256(output).hexdigest())
        self.assertNotIn(payload_for(raw)["image_b64"], logs.getvalue())

    def test_jpeg_orientation_pixels_and_private_metadata_are_normalized(self):
        image = Image.new("RGB", (120, 80), (200, 20, 20))
        ImageDraw.Draw(image).rectangle((60, 0, 119, 79), fill=(20, 20, 200))
        raw = image_bytes(image, "JPEG", exif=private_exif(6),
                          icc_profile=b"private-profile-marker", comment=b"private-comment-marker")
        with Image.open(io.BytesIO(raw)) as source:
            self.assertEqual(source.getexif()[274], 6)
            self.assertIn(34853, source.getexif())
        with local_service() as address:
            status, result = post(address, payload_for(raw, "image/jpeg"))
        self.assertEqual(status, 200)
        output = self.assert_image_result(result, mime="image/jpeg", size=(80, 120))
        self.assertNotIn(b"private-", output)
        with Image.open(io.BytesIO(output)) as decoded:
            self.assertGreater(decoded.getpixel((40, 20))[0], 150)
            self.assertGreater(decoded.getpixel((40, 100))[2], 150)

    def test_png_text_exif_and_gps_are_removed_and_alpha_survives(self):
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("private-text", "private-text-marker")
        metadata.add_itxt("XML:com.adobe.xmp", "private-xmp-marker")
        raw = image_bytes(rgba_fixture(), pnginfo=metadata, exif=private_exif())
        with local_service() as address:
            status, result = post(address, payload_for(raw))
        self.assertEqual(status, 200)
        output = self.assert_image_result(result, mime="image/png", size=(100, 80))
        self.assertNotIn(b"private-", output)
        with Image.open(io.BytesIO(output)) as decoded:
            self.assertEqual(decoded.mode, "RGBA")
            self.assertEqual(decoded.getpixel((0, 0))[3], 0)
            self.assertEqual(decoded.getpixel((50, 40)), (50, 100, 150, 255))
            self.assertFalse(decoded.text)

    def test_source_palette_transparency_is_preserved(self):
        image = Image.new("P", (20, 10), 0)
        image.putpalette([0, 0, 0, 255, 0, 0] + [0] * 762)
        ImageDraw.Draw(image).rectangle((5, 2, 15, 8), fill=1)
        raw = image_bytes(image, transparency=0)
        with local_service() as address:
            status, result = post(address, payload_for(raw))
        self.assertEqual(status, 200)
        output = self.assert_image_result(result, mime="image/png", size=(20, 10))
        with Image.open(io.BytesIO(output)) as decoded:
            self.assertEqual(decoded.getpixel((0, 0))[3], 0)
            self.assertEqual(decoded.getpixel((10, 5)), (255, 0, 0, 255))

    def test_source_16bit_grayscale_png_preserves_midtones_and_transparency(self):
        samples = (0, 128, 256, 16384, 32768, 32769, 49152, 65535)
        expected_gray = (0, 0, 1, 64, 128, 128, 191, 255)
        image = Image.frombytes("I;16", (8, 1), struct.pack("<8H", *samples))
        with local_service() as address:
            for transparent_sample in (None, 32768):
                with self.subTest(transparent_sample=transparent_sample):
                    options = {} if transparent_sample is None else {"transparency": transparent_sample}
                    raw = image_bytes(image, **options)
                    with Image.open(io.BytesIO(raw)) as source:
                        self.assertEqual(source.mode, "I;16")
                        self.assertEqual(tuple(source.getpixel((x, 0)) for x in range(8)), samples)
                    status, result = post(address, payload_for(raw))
                    self.assertEqual(status, 200)
                    output = self.assert_image_result(result, mime="image/png", size=(8, 1))
                    with Image.open(io.BytesIO(output)) as decoded:
                        self.assertEqual([decoded.getpixel((x, 0)) for x in range(8)], [
                            (gray, gray, gray, 0 if sample == transparent_sample else 255)
                            for sample, gray in zip(samples, expected_gray)
                        ])

    def test_longest_edge_is_bounded_without_upscaling(self):
        with local_service() as address:
            for size, wanted in (((3200, 800), (1600, 400)), ((12, 24), (12, 24))):
                raw = image_bytes(Image.new("RGB", size, "red"), "JPEG")
                status, result = post(address, payload_for(raw, "image/jpeg"))
                self.assertEqual(status, 200)
                self.assert_image_result(result, mime="image/jpeg", size=wanted)

    def test_actual_byte_and_decoded_pixel_limits(self):
        with local_service() as address:
            jpeg = image_bytes(Image.new("RGB", (20, 10)), "JPEG")
            exact_limit = jpeg + b"x" * (8 * 1024 * 1024 - len(jpeg))
            status, result = post(address, payload_for(exact_limit, "image/jpeg"))
            self.assertEqual(status, 200)
            self.assert_image_result(result, mime="image/jpeg", size=(20, 10))
            status, _ = post(address, payload_for(exact_limit + b"x", "image/jpeg"))
            self.assertEqual(status, 413)
            for size, wanted_status in (((4000, 4000), 200), ((4001, 4000), 413)):
                raw = image_bytes(Image.new("RGB", size), "JPEG")
                status, result = post(address, payload_for(raw, "image/jpeg"))
                self.assertEqual(status, wanted_status)
                if status == 200:
                    self.assert_image_result(result, mime="image/jpeg", size=(1600, 1600))

    def test_bad_base64_fake_mime_and_non_images_return_bounded_private_errors(self):
        marker = "private-user-supplied-marker"
        png = image_bytes(rgba_fixture())
        jpeg = image_bytes(Image.new("RGB", (10, 10)), "JPEG")
        cases = [
            {"image_b64": marker}, {"image_b64": "YWJj\n"}, {"image_b64": "YQ==="},
            {"image_b64": "YR=="}, {"image_b64": ""}, {"image_b64": None},
            {"image_b64": "https://example.com/private-image"},
            {"image_b64": "data:image/png;base64," + base64.b64encode(png).decode()},
            {"image_b64": base64.b64encode(marker.encode()).decode()},
            {"mime": "image/jpeg"}, {"mime": [marker]},
            {"image_b64": base64.b64encode(jpeg).decode()},
            {"image_b64": base64.b64encode(png[:40]).decode()},
            {"media_version": True}, {"media_version": 1.0}, {"media_version": 2},
            {"purpose": marker}, {"purpose": [marker]},
            {"image_url": "https://example.com/" + marker},
        ]
        logs = io.StringIO()
        with local_service() as address, redirect_stdout(logs):
            for invalid in cases:
                status, result = post(address, {**payload_for(png), **invalid})
                self.assertEqual(status, 400, invalid.keys())
                encoded_error = json.dumps(result)
                self.assertLess(len(encoded_error), 500)
                self.assertNotIn(marker, encoded_error)
                self.assertNotIn(base64.b64encode(png).decode(), encoded_error)
        self.assertNotIn(marker, logs.getvalue())
        self.assertNotIn(base64.b64encode(png).decode(), logs.getvalue())

    def test_transparent_png_uses_real_alpha_validation(self):
        from stylee.vision.alpha_matte import validate_alpha_png
        with local_service() as address:
            status, result = post(address, payload_for(image_bytes(rgba_fixture()), purpose="transparent"))
            self.assertEqual(status, 200)
            output = self.assert_image_result(result, mime="image/png", size=(100, 80))
            stats = validate_alpha_png(output)
            self.assertGreater(stats.transparent_border_ratio, 0.9)
            invalid_images = [
                Image.new("RGBA", (100, 80), (0, 0, 0, 255)),
                Image.new("RGBA", (100, 80), (0, 0, 0, 0)),
                Image.new("RGB", (100, 80), "white"),
                Image.new("LA", (100, 80), (100, 0)),
            ]
            wrong_border = Image.new("RGBA", (100, 80), (20, 50, 80, 255))
            ImageDraw.Draw(wrong_border).rectangle((20, 20, 70, 60), fill=(0, 0, 0, 0))
            invalid_images.append(wrong_border)
            for image in invalid_images:
                status, _ = post(address, payload_for(image_bytes(image), purpose="transparent"))
                self.assertEqual(status, 400)
            status, _ = post(address, payload_for(
                image_bytes(Image.new("RGB", (20, 20)), "JPEG"), "image/jpeg", "transparent",
            ))
            self.assertEqual(status, 400)

    def test_crop_uses_oriented_coordinates_before_resize(self):
        image = Image.new("RGB", (3200, 800), (200, 20, 20))
        ImageDraw.Draw(image).rectangle((1600, 0, 3199, 799), fill=(20, 20, 200))
        raw = image_bytes(image, "JPEG", exif=private_exif(6))
        with local_service() as address:
            status, result = post(address, payload_for(raw, "image/jpeg", crop_2d=[0, 500, 1000, 1000]))
        self.assertEqual(status, 200)
        output = self.assert_image_result(result, mime="image/jpeg", size=(800, 1600))
        with Image.open(io.BytesIO(output)) as decoded:
            self.assertGreater(decoded.getpixel((400, 200))[2], 150)

    def test_crop_bounds_and_invalid_coordinates(self):
        raw = image_bytes(Image.new("RGB", (101, 51), "red"))
        with local_service() as address:
            status, result = post(address, payload_for(raw, crop_2d=[0, 0, 1000, 1000]))
            self.assertEqual(status, 200)
            self.assert_image_result(result, mime="image/png", size=(101, 51))
            status, result = post(address, payload_for(raw, crop_2d=[0, 0, 1, 1]))
            self.assertEqual(status, 200)
            self.assert_image_result(result, mime="image/png", size=(1, 1))
            for box in (
                None, [], [0, 0, 1000], [False, 0, 1000, 1000], [0, 0, 1001, 1000],
                [-1, 0, 1000, 1000], [500, 0, 500, 1000], [0, 1000, 1000, 0],
                [0, 0, float("nan"), 1000], [0, 0, float("inf"), 1000], ["0", 0, 1000, 1000],
            ):
                status, _ = post(address, payload_for(raw, crop_2d=box))
                self.assertEqual(status, 400)

    def test_transparent_crop_is_validated_again_after_crop(self):
        raw = image_bytes(rgba_fixture())
        with local_service() as address:
            status, _ = post(address, payload_for(raw, purpose="transparent", crop_2d=[250, 250, 700, 700]))
            self.assertEqual(status, 400)
            # Cropping cannot launder an invalid opaque border into a valid source.
            invalid_source = Image.new("RGBA", (200, 200), (100, 50, 20, 255))
            invalid_source.paste(rgba_fixture((100, 100)), (50, 50))
            status, _ = post(address, payload_for(
                image_bytes(invalid_source), purpose="transparent", crop_2d=[250, 250, 750, 750],
            ))
            self.assertEqual(status, 400)

    def test_pillow_bomb_protection_and_output_size_guard(self):
        from stylee.service import media
        raw = image_bytes(rgba_fixture())
        with local_service() as address:
            for bomb_limit in (100, 5000):
                with patch.object(Image, "MAX_IMAGE_PIXELS", bomb_limit):
                    status, _ = post(address, payload_for(raw))
                self.assertEqual(status, 413)
            with patch.object(media, "MAX_OUTPUT_BYTES", 1):
                status, _ = post(address, payload_for(raw))
            self.assertEqual(status, 413)

    def test_unexpected_preparation_exception_never_exposes_input(self):
        raw = image_bytes(rgba_fixture())
        with local_service() as address, patch.object(
            service, "prepare_media", side_effect=RuntimeError("private-exception-marker"),
        ):
            status, result = post(address, payload_for(raw))
        self.assertEqual(status, 500)
        self.assertNotIn("private-exception-marker", json.dumps(result) + self.request_logs.getvalue())
        self.assertLess(len(json.dumps(result)), 500)

    def test_auth_rate_limit_and_verifier_exception_are_bounded(self):
        raw = image_bytes(rgba_fixture())
        with local_service(limit=1) as address:
            status, _ = post(address, payload_for(raw), authorization=None)
            self.assertEqual(status, 401)
            status, _ = post(address, payload_for(raw))
            self.assertEqual(status, 200)
            status, _ = post(address, payload_for(raw))
            self.assertEqual(status, 429)

        class BrokenVerifier:
            def verify(self, authorization):
                raise RuntimeError("private-auth-exception-marker")

        logs = io.StringIO()
        with local_service(verifier=BrokenVerifier()) as address, redirect_stdout(logs):
            status, result = post(address, payload_for(raw))
        self.assertEqual(status, 503)
        self.assertNotIn("private-auth-exception-marker", json.dumps(result) + logs.getvalue())

    def test_content_length_and_json_shape_fail_closed(self):
        with local_service() as address:
            for headers in (
                "Content-Length: -1", "Content-Length: nonsense", "Content-Length: +2",
                "Content-Length: 2\r\nContent-Length: 3", "Content-Length: 1_000",
                "Content-Length: 2\r\nTransfer-Encoding: chunked",
                "Content-Length: " + "9" * 100, "",
            ):
                with self.subTest(headers=headers):
                    try:
                        status, result = raw_post(address, headers)
                    except TimeoutError:
                        self.fail("invalid Content-Length did not produce a bounded rejection")
                    self.assertEqual(status, 400)
                    self.assertLess(len(json.dumps(result)), 500)
            status, _ = raw_post(address, "Content-Length: 15728641")
            self.assertEqual(status, 413)
            with patch.dict(os.environ, {"STYLEE_MAX_BODY_BYTES": "999999999"}):
                status, _ = raw_post(address, "Content-Length: 11185837")
                self.assertEqual(status, 413)
            for value in ([], None, "private-json-value-marker", 1, True):
                status, result = post(address, value)
                self.assertEqual(status, 400)
                self.assertNotIn("private-json-value-marker", json.dumps(result))
            body = b'{"private-json-field-marker": "unterminated'
            status, result = raw_post(address, f"Content-Length: {len(body)}", body)
            self.assertEqual(status, 400)
            self.assertNotIn("private-json-field-marker", json.dumps(result))

    def test_slow_body_has_total_deadline_even_when_bytes_keep_arriving(self):
        with local_service() as address, patch.object(service, "BODY_READ_TIMEOUT_SECONDS", 0.2, create=True):
            started = time.monotonic()
            try:
                status, _ = raw_post(address, "Content-Length: 1000", b"{", trickle=True)
            except TimeoutError:
                self.fail("slow request body exceeded its total deadline")
            self.assertEqual(status, 408)
            self.assertLess(time.monotonic() - started, 1)

    def test_incomplete_body_is_rejected_after_peer_eof(self):
        with local_service() as address, socket.create_connection(address, timeout=2) as connection:
            connection.sendall(b"POST /prepare-media HTTP/1.1\r\nHost: localhost\r\n"
                               b"Authorization: Bearer test-token\r\nContent-Length: 1000\r\n\r\n{}")
            connection.shutdown(socket.SHUT_WR)
            response = http.client.HTTPResponse(connection)
            response.begin()
            self.assertEqual(response.status, 400)
            response.read()


if __name__ == "__main__":
    unittest.main()
