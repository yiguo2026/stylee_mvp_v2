"""Offline try-on outcome classification; no credentials or provider calls."""
import io
import json
import http.client
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

from stylee.service import ai_features
from stylee.service.server import run_server

PAYLOAD = {"image_url": "data:image/png;base64,AA==", "items": [{"name": "白衬衫", "category": "上装"}]}


class Response:
    def __init__(self, body): self.body = body
    def __enter__(self): return self
    def __exit__(self, *_args): return None
    def read(self):
        if isinstance(self.body, Exception): raise self.body
        return self.body


class TryOnOutcomeTests(unittest.TestCase):
    def run_fault(self, failure, want):
        calls, verified = [], []
        def send(*_args, **_kwargs):
            calls.append(1)
            if isinstance(failure, Response): return failure
            raise failure
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": "synthetic-only"}), \
             patch.object(ai_features.urllib.request, "urlopen", send), \
             patch.object(ai_features, "log_usage"):
            with self.assertRaises(Exception) as raised:
                ai_features.tryon_image(PAYLOAD, verify=lambda *_: verified.append(1) or {"ok": False})
        self.assertEqual(type(raised.exception).__name__, want)
        self.assertEqual(len(calls), 1, "an uncertain/rejected request must not generate a second image")
        self.assertEqual(verified, [], "no result cannot be treated as an aesthetic rejection")
        self.assertNotIn("private-detail", str(raised.exception))

    def test_transport_and_response_unknown_never_retry_generation(self):
        faults = [
            urllib.error.URLError("private-detail"),
            TimeoutError("private-detail"),
            ConnectionResetError("private-detail"),
            urllib.error.HTTPError("https://provider.invalid", 502, "private-detail", {}, io.BytesIO()),
            Response(b"not json private-detail"),
            Response(b"{}"),
            Response(b'{"output":{"choices":[{"message":{"content":[{"image":""}]}}]}}'),
            Response(http.client.IncompleteRead(b"private-detail", 100)),
        ]
        for fault in faults:
            with self.subTest(fault=type(fault).__name__): self.run_fault(fault, "TryOnOutcomeUnknown")

    def test_provider_status_alone_is_not_a_stop_receipt_and_never_retries(self):
        for code in (400, 401, 403, 413, 415, 422, 429):
            with self.subTest(status=code):
                self.run_fault(urllib.error.HTTPError("https://provider.invalid", code, "private-detail", {}, io.BytesIO()), "TryOnOutcomeUnknown")

    def test_missing_key_fails_before_any_network(self):
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": ""}), patch.object(ai_features.urllib.request, "urlopen") as send:
            with self.assertRaises(Exception) as raised: ai_features.tryon_image(PAYLOAD)
        self.assertEqual(type(raised.exception).__name__, "TryOnFailed")
        send.assert_not_called()

    def test_only_real_quality_rejection_keeps_the_existing_second_attempt(self):
        calls = []
        def generate(*_args):
            calls.append(1)
            return "https://result.invalid/image.png"
        with self.assertRaises(Exception) as raised:
            ai_features.tryon_image(PAYLOAD, generate=generate, verify=lambda *_: {"ok": False, "reason": "quality"})
        self.assertEqual(type(raised.exception).__name__, "TryOnFailed")
        self.assertEqual(len(calls), 2)

    def test_quality_transport_failure_does_not_request_a_second_image(self):
        calls = []
        def generate(*_args): calls.append(1); return "https://result.invalid/image.png"
        def verify(*_args): raise TimeoutError("private-detail")
        with self.assertRaises(Exception) as raised: ai_features.tryon_image(PAYLOAD, generate=generate, verify=verify)
        self.assertEqual(type(raised.exception).__name__, "TryOnFailed")
        self.assertEqual(len(calls), 1)
        self.assertNotIn("private-detail", str(raised.exception))

    def test_empty_generated_reference_never_enters_quality_retry(self):
        calls = []
        def generate(*_args): calls.append(1); return ""
        with self.assertRaises(Exception) as raised:
            ai_features.tryon_image(PAYLOAD, generate=generate, verify=lambda *_: {"ok": False})
        self.assertEqual(type(raised.exception).__name__, "TryOnOutcomeUnknown")
        self.assertEqual(len(calls), 1)

    def test_real_quality_verifier_invalid_output_does_not_trigger_regeneration(self):
        for content in ('{}', '{"has_text_or_watermark":"false","garment_match":true}', '[]'):
            with self.subTest(content=content):
                calls = []
                def generate(*_args): calls.append(1); return "https://result.invalid/image.png"
                with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": "synthetic-only"}), \
                     patch.object(ai_features, "_chat_completion", return_value=content):
                    with self.assertRaises(ai_features.TryOnFailed):
                        ai_features.tryon_image(PAYLOAD, generate=generate)
                self.assertEqual(len(calls), 1, "invalid verifier payload is not an explicit image-quality rejection")

    def test_missing_quality_configuration_does_not_trigger_regeneration(self):
        calls = []
        def generate(*_args): calls.append(1); return "https://result.invalid/image.png"
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": ""}):
            with self.assertRaises(ai_features.TryOnFailed):
                ai_features.tryon_image(PAYLOAD, generate=generate)
        self.assertEqual(len(calls), 1)

    def test_non_tryon_edit_failure_keeps_legacy_empty_result_behavior(self):
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": "synthetic-only"}), \
             patch.object(ai_features.urllib.request, "urlopen", side_effect=urllib.error.URLError("synthetic")), \
             patch.object(ai_features, "log_usage"):
            self.assertEqual(ai_features.edit_image("data:image", "prompt", "other"), "")

    def test_http_response_correlates_explicit_outcome_without_authorizing_a_new_start(self):
        server = run_server("127.0.0.1", 0, "mock")
        worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
        try:
            for name, state in (("TryOnOutcomeUnknown", "unknown"), ("TryOnFailed", "failed")):
                error_type = getattr(ai_features, name, None)
                self.assertIsNotNone(error_type)
                with patch.object(ai_features, "tryon_image", side_effect=error_type("safe outcome")):
                    request = urllib.request.Request(
                        "http://127.0.0.1:%s/tryon-image" % server.server_address[1],
                        data=json.dumps(PAYLOAD).encode(), method="POST",
                        headers={"Content-Type": "application/json", "X-Request-ID": "10000000-0000-4000-8000-000000000001"})
                    with self.assertRaises(urllib.error.HTTPError) as raised: urllib.request.urlopen(request, timeout=5)
                    with raised.exception as response: body = json.loads(response.read())
                self.assertEqual(body["execution_state"], state)
                self.assertEqual(body["request_id"], "10000000-0000-4000-8000-000000000001")
                self.assertEqual(body["error_type"], name)
                self.assertFalse(body["retryable"])
        finally:
            server.shutdown(); server.server_close(); worker.join(timeout=5)


if __name__ == "__main__": unittest.main()
