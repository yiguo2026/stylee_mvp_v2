"""Offline whole-photo try-on contract; synthetic image and provider fixtures only."""
import base64
import io
import json
import socket
import threading
import unittest
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from unittest.mock import patch

from PIL import Image, ImageDraw

from stylee.service import ai_features
from stylee.service.server import run_server


def encoded_image(color, fmt="PNG", size=(24, 32)):
    output = io.BytesIO()
    Image.new("RGB", size, color).save(output, format=fmt)
    return base64.b64encode(output.getvalue()).decode("ascii")


PERSON = encoded_image("beige")
SOURCE = encoded_image("blue")
PAYLOAD = {"image_b64": PERSON, "mime": "image/png",
           "source_image_b64": SOURCE, "source_mime": "image/png", "scene": "office"}
PERSON_REF = "data:image/png;base64," + PERSON
SOURCE_REF = "data:image/png;base64," + SOURCE
RESULT = "https://result.invalid/tryon.png"
GOOD = {"has_text_or_watermark": False, "source_has_clothing": True,
        "identity_match": True, "whole_outfit_match": True, "detail_match": True,
        "single_person": True, "reason": ""}


class PhotoTryOnTests(unittest.TestCase):
    def setUp(self):
        # Never read a real provider key or permit an accidental paid request.
        self.env = patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": "synthetic-only"})
        self.env.start()
        self.addCleanup(self.env.stop)
        connect = socket.socket.connect
        def local_only(sock, address):
            if not isinstance(address, tuple) or address[0] not in ("127.0.0.1", "::1"):
                raise AssertionError("external network forbidden in photo fixtures")
            return connect(sock, address)
        network = patch.object(socket.socket, "connect", local_only)
        network.start()
        self.addCleanup(network.stop)
        urlopen = urllib.request.urlopen
        def local_url_only(request, *args, **kwargs):
            url = request.full_url if isinstance(request, urllib.request.Request) else request
            if urlsplit(url).hostname not in ("127.0.0.1", "::1", "localhost"):
                raise AssertionError("external HTTP forbidden even via a loopback proxy")
            return urlopen(request, *args, **kwargs)
        http = patch.object(urllib.request, "urlopen", local_url_only)
        http.start()
        self.addCleanup(http.stop)

    def test_whole_source_and_own_identity_reach_generation_and_three_image_quality(self):
        generated, quality = [], []
        def generate(images, prompt, feature):
            generated.append((images, prompt, feature))
            return RESULT
        def chat(_base, _key, _model, messages, *_args):
            quality.append(messages)
            return json.dumps(GOOD)
        with patch.object(ai_features, "_chat_completion", chat), \
             patch.object(ai_features, "verify_tryon_output", side_effect=AssertionError("legacy verifier forbidden")):
            self.assertEqual(ai_features.tryon_image({**PAYLOAD, "prompt": "injected override",
                                                     "image_url": "https://untrusted.invalid/other-person.png"}, generate=generate), RESULT)
        self.assertEqual(generated[0][0], [PERSON_REF, SOURCE_REF])
        self.assertEqual(generated[0][2], "tryon_photo")
        self.assertIn("唯一人物", generated[0][1])
        self.assertIn("整套", generated[0][1])
        self.assertIn("身份", generated[0][1])
        self.assertIn("办公室", generated[0][1])
        self.assertNotIn("injected override", generated[0][1])
        refs = [part["image_url"]["url"] for part in quality[0][1]["content"] if part["type"] == "image_url"]
        self.assertEqual(refs, [PERSON_REF, SOURCE_REF, RESULT])

    def test_invalid_or_mixed_inputs_never_start_a_producer(self):
        cases = [
            {**PAYLOAD, "items": []},
            {**PAYLOAD, "image_url": PERSON_REF, "items": [{"name": "shirt"}]},
            {**PAYLOAD, "source_image_b64": ""}, {**PAYLOAD, "source_image_b64": "AA=="},
            {**PAYLOAD, "source_image_b64": "%%%="}, {**PAYLOAD, "source_image_b64": 12},
            {**PAYLOAD, "source_mime": "image/jpeg"}, {**PAYLOAD, "source_mime": "image/svg+xml"},
            {**PAYLOAD, "image_b64": ""}, {**PAYLOAD, "mime": "image/jpeg"},
            {key: value for key, value in PAYLOAD.items() if key != "source_mime"},
            {key: value for key, value in PAYLOAD.items() if key != "source_image_b64"},
            {**PAYLOAD, "source_image_b64": "A" * (7 * 1024 * 1024)},
            {**PAYLOAD, "source_image_b64": encoded_image("blue", size=(4001, 4000))},
        ]
        for payload in cases:
            with self.subTest(keys=list(payload), mime=payload.get("source_mime")):
                calls = []
                with self.assertRaises(ai_features.TryOnFailed):
                    ai_features.tryon_image(payload, generate=lambda *_: calls.append(1) or RESULT,
                                            verify=lambda *_: {"ok": True})
                self.assertEqual(calls, [])

    def test_supported_formats_are_preserved_without_cropping_or_normalization(self):
        for fmt, mime in (("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")):
            source = encoded_image("blue", fmt=fmt)
            calls = []
            def generate(images, *_args):
                calls.append(images)
                return RESULT
            with patch.object(ai_features, "_chat_completion", return_value=json.dumps(GOOD)):
                self.assertEqual(ai_features.tryon_image({**PAYLOAD, "source_image_b64": source, "source_mime": mime}, generate=generate), RESULT)
            self.assertEqual(calls[0], [PERSON_REF, f"data:{mime};base64,{source}"])

    def test_animated_or_truncated_photos_are_rejected_before_generation(self):
        animation = io.BytesIO()
        Image.new("RGB", (24, 32), "blue").save(
            animation, format="PNG", save_all=True,
            append_images=[Image.new("RGB", (24, 32), "red")], duration=100, loop=0)
        corrupt = base64.b64decode(SOURCE)[:40]
        bad_crc = bytearray(base64.b64decode(SOURCE))
        idat = bad_crc.index(b"IDAT")
        crc_offset = idat + 4 + int.from_bytes(bad_crc[idat - 4:idat], "big")
        bad_crc[crc_offset] ^= 1
        for raw in (animation.getvalue(), corrupt, bad_crc):
            calls = []
            with self.assertRaises(ai_features.TryOnFailed):
                ai_features.tryon_image({**PAYLOAD, "source_image_b64": base64.b64encode(raw).decode()},
                                        generate=lambda *_: calls.append(1) or RESULT)
            self.assertEqual(calls, [])

    def test_photo_quality_requires_every_check_and_stops_after_two_rejections(self):
        for field in GOOD.keys() - {"reason"}:
            bad = {**GOOD, field: not GOOD[field]}
            calls = []
            with self.subTest(field=field), patch.object(ai_features, "_chat_completion", return_value=json.dumps(bad)):
                with self.assertRaises(ai_features.TryOnFailed):
                    ai_features.tryon_image(PAYLOAD, generate=lambda *_: calls.append(1) or RESULT)
            self.assertEqual(len(calls), 2)

    def test_quality_unknown_or_malformed_does_not_retry(self):
        for reply in ("{}", "[]", json.dumps({**GOOD, "identity_match": "true"}), TimeoutError("private-detail")):
            calls = []
            def chat(*_args):
                if isinstance(reply, Exception):
                    raise reply
                return reply
            with patch.object(ai_features, "_chat_completion", chat):
                with self.assertRaises(ai_features.TryOnFailed) as caught:
                    ai_features.tryon_image(PAYLOAD, generate=lambda *_: calls.append(1) or RESULT)
            self.assertEqual(len(calls), 1)
            self.assertNotIn("private-detail", str(caught.exception))

    def test_generation_unknown_never_retries_or_verifies(self):
        for reply in (None, "", TimeoutError("private-detail")):
            calls = []
            def generate(*_args):
                calls.append(1)
                if isinstance(reply, Exception):
                    raise reply
                return reply
            with patch.object(ai_features, "_chat_completion") as chat:
                with self.assertRaises(ai_features.TryOnOutcomeUnknown):
                    ai_features.tryon_image(PAYLOAD, generate=generate)
            self.assertEqual(len(calls), 1)
            chat.assert_not_called()

    def test_photo_provider_payload_preserves_existing_print_and_numbers(self):
        requests, usage = [], []
        shirt = Image.new("RGB", (96, 128), "white")
        drawing = ImageDraw.Draw(shirt)
        drawing.polygon([(8, 24), (32, 8), (64, 8), (88, 24), (76, 48),
                         (68, 40), (68, 116), (28, 116), (28, 40), (20, 48)], fill="blue")
        drawing.text((39, 54), "12", fill="white")
        output = io.BytesIO()
        shirt.save(output, format="PNG")
        printed_source = base64.b64encode(output.getvalue()).decode()
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return None
            def read(self):
                return json.dumps({"output": {"choices": [{"message": {
                    "content": [{"image": RESULT}]}}]}, "usage": {}}).encode()
        def send(request, timeout):
            requests.append((json.loads(request.data), timeout))
            return Response()
        with patch.object(ai_features.urllib.request, "urlopen", send), \
             patch.object(ai_features, "log_usage", side_effect=lambda *args: usage.append(args)), \
             patch.object(ai_features, "_chat_completion", return_value=json.dumps(GOOD)):
            self.assertEqual(ai_features.tryon_image({**PAYLOAD, "source_image_b64": printed_source}), RESULT)
        sent, timeout = requests[0]
        self.assertEqual(sent["input"]["messages"][0]["content"][1],
                         {"image": "data:image/png;base64," + printed_source})
        prompt = sent["input"]["messages"][0]["content"][-1]["text"]
        self.assertIn("已有的文字、Logo、字母和数字印花必须原样保留", prompt)
        negative = sent["parameters"]["negative_prompt"]
        for generic_ban in ("文字", "字母", "数字", "Logo"):
            self.assertNotIn(generic_ban, negative.split("，"))
        self.assertIn("新增水印", negative)
        self.assertIn("新增伪文字", negative)
        self.assertFalse(sent["parameters"]["watermark"])
        self.assertEqual(timeout, 35)
        self.assertEqual(usage[0][2:4], ("tryon", "image"))

    def test_photo_provider_failures_keep_original_tryon_outcome_and_billing(self):
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": ""}), \
             patch.object(ai_features.urllib.request, "urlopen") as send:
            with self.assertRaises(ai_features.TryOnFailed):
                ai_features.edit_image([PERSON_REF, SOURCE_REF], "photo", "tryon_photo")
            send.assert_not_called()
        for fault in (urllib.error.URLError("private-detail"), OSError("private-detail")):
            usage = []
            with patch.object(ai_features.urllib.request, "urlopen", side_effect=fault) as send, \
                 patch.object(ai_features, "log_usage", side_effect=lambda *args: usage.append(args)):
                with self.assertRaises(ai_features.TryOnOutcomeUnknown) as caught:
                    ai_features.edit_image([PERSON_REF, SOURCE_REF], "photo", "tryon_photo")
                self.assertEqual(send.call_count, 1)
                self.assertEqual(usage[0][2:4], ("tryon", "image"))
                self.assertNotIn("private-detail", str(caught.exception))

    def test_photo_http_success_and_terminal_errors_keep_request_correlation(self):
        server = run_server("127.0.0.1", 0, "mock")
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            for result, expected_state in ((RESULT, None), (TimeoutError("private-detail"), "unknown"),
                                           (ai_features.TryOnFailed("safe failure"), "failed")):
                def generate(*_args):
                    if isinstance(result, Exception):
                        raise result
                    return result
                with patch.object(ai_features, "edit_image", generate), \
                     patch.object(ai_features, "_chat_completion", return_value=json.dumps(GOOD)):
                    request = urllib.request.Request(
                        f"http://127.0.0.1:{server.server_address[1]}/tryon-image",
                        data=json.dumps(PAYLOAD).encode(), method="POST",
                        headers={"Content-Type": "application/json", "X-Request-ID": "10000000-0000-4000-8000-000000000002"})
                    try:
                        response = urllib.request.urlopen(request, timeout=5)
                    except urllib.error.HTTPError as error:
                        response = error
                    with response:
                        body = json.loads(response.read())
                if expected_state:
                    self.assertEqual(body["request_id"], "10000000-0000-4000-8000-000000000002")
                    self.assertEqual(body["execution_state"], expected_state)
                    self.assertFalse(body["retryable"])
                else:
                    self.assertEqual(body["image_ref"], RESULT)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
