import base64
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Event
import time
import urllib.parse
from unittest.mock import patch

from PIL import Image

from scripts import release_smoke
from scripts.release_smoke import SmokeError, load_smoke_environment, run_release_smoke
from stylee.vision import alpha_matte


ROOT = Path(__file__).resolve().parent
TOKEN = "supabase-access-token-must-not-log"
ANON_KEY = "supabase-anon-key-must-not-log"
EMAIL = "release-smoke@example.invalid"
PASSWORD = "release-smoke-password-must-not-log"
APPROVED_IMAGE_URL = (
    "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/"
    "tryon-private-result-must-not-log.png"
)


def _valid_png():
    output = io.BytesIO()
    Image.new("RGB", (8, 8), "navy").save(output, format="PNG")
    return output.getvalue()


def _valid_jpeg():
    image = Image.new("RGB", (64, 64))
    pixels = image.load()
    for y in range(64):
        for x in range(64):
            pixels[x, y] = ((x * 7 + y * 3) % 256, (x * 5) % 256, (y * 11) % 256)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=85)
    return output.getvalue()


def _trusted_image_reader(ref, timeout_seconds):
    assert ref == APPROVED_IMAGE_URL
    assert 0 < timeout_seconds <= 20
    return _valid_png()


def _trace(request_id):
    return {
        "request_id": request_id,
        "duration_ms": 17,
        "stage_ms": {"provider": 16},
        "degraded": False,
    }


def _responses(recognition_provider="qwen3-vl-flash"):
    return [
        _Response({
            "access_token": TOKEN,
            "token_type": "bearer",
            "expires_in": 3600,
            "refresh_token": "refresh-token-must-not-log",
        }, "supabase-auth-request"),
        _Response({
            "items": [{
                "category": "上装",
                "color": "白色",
                "material": "棉",
                "description": "白色衬衫",
                "photo_type": "web",
                "needs_review": False,
                "confidence": 0.95,
            }],
            "provider": recognition_provider,
            "provider_payload": "recognition-provider-payload-must-not-log",
            "trace": _trace("release-smoke-recognize-multi"),
        }, "release-smoke-recognize-multi"),
        _Response({
            "image_ref": "data:image/png;base64,standardized-image-must-not-log",
            "mime": "image/png",
            "method": "direct_alpha",
            "verified": True,
            "background": "transparent",
            "alpha_verified": True,
            "visible_bounds": {
                "left": 0.1,
                "top": 0.2,
                "width": 0.5,
                "height": 0.6,
            },
            "matte_provider": "pillow-border-connected-v1",
            "failure_stage": None,
            "provider": "qwen-image-edit",
            "trace": _trace("release-smoke-standardize"),
        }, "release-smoke-standardize"),
        _Response({
            "outfits": [{
                "name": "通勤方案",
                "owned_item_ids": ["smoke-top", "smoke-bottom", "smoke-shoes"],
                "recommended_items": [],
                "comment": "真实模型搭配",
            }],
            "trace": {
                **_trace("release-smoke-recommend"),
                "provider": "deepseek-v4-flash",
                "rag_mode": "vector",
                "first_pass_valid": 1,
            },
        }, "release-smoke-recommend"),
        _Response({
            "image_ref": APPROVED_IMAGE_URL,
            "trace": _trace("release-smoke-tryon-image"),
        }, "release-smoke-tryon-image"),
    ]


class _Response:
    status = 200

    def __init__(self, payload, request_id):
        self.payload = payload
        self.headers = {"X-Request-ID": request_id}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def read(self, limit=None):
        body = json.dumps(self.payload).encode()
        assert limit is None or len(body) <= limit
        return body


def _fixture_files(directory):
    root = Path(directory)
    garment = root / "garment.png"
    person = root / "person.jpg"
    garment.write_bytes(b"project-owned-garment-image")
    person.write_bytes(b"project-owned-person-image")
    return garment, person


def _run(responses):
    requests = []

    def opener(request, timeout):
        assert timeout > 0
        requests.append(request)
        return responses.pop(0)

    with TemporaryDirectory() as directory:
        garment, person = _fixture_files(directory)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = run_release_smoke(
                service_url="https://service.example",
                supabase_url="https://project.supabase.co",
                supabase_anon_key=ANON_KEY,
                email=EMAIL,
                password=PASSWORD,
                garment_fixture=garment,
                person_fixture=person,
                opener=opener,
                provider_image_reader=_trusted_image_reader,
            )
        return result, requests, output.getvalue(), garment.read_bytes(), person.read_bytes()


def test_release_smoke_request_sequence_auth_contract_and_log_redaction():
    result, requests, output, garment_bytes, person_bytes = _run(_responses())
    assert result == {
        "status": "ok",
        "stages": ["auth", "recognize-multi", "standardize", "recommend", "tryon-image"],
    }

    parsed_urls = [urllib.parse.urlsplit(request.full_url) for request in requests]
    assert [url.path for url in parsed_urls] == [
        "/auth/v1/token",
        "/recognize-multi",
        "/standardize",
        "/recommend",
        "/tryon-image",
    ]
    assert urllib.parse.parse_qs(parsed_urls[0].query) == {"grant_type": ["password"]}

    auth_headers = {name.lower(): value for name, value in requests[0].header_items()}
    assert auth_headers["apikey"] == ANON_KEY
    auth_body = json.loads(requests[0].data)
    assert auth_body == {"email": EMAIL, "password": PASSWORD}

    for request in requests[1:]:
        headers = {name.lower(): value for name, value in request.header_items()}
        assert headers["authorization"] == f"Bearer {TOKEN}"
        assert headers["content-type"] == "application/json"

    recognize_body = json.loads(requests[1].data)
    standardize_body = json.loads(requests[2].data)
    tryon_body = json.loads(requests[4].data)
    assert base64.b64decode(recognize_body["image_b64"]) == garment_bytes
    assert base64.b64decode(standardize_body["image_b64"]) == garment_bytes
    assert standardize_body["item"]["category"] == "上装"
    assert base64.b64decode(tryon_body["image_b64"]) == person_bytes

    records = [json.loads(line) for line in output.splitlines() if line]
    assert [record["stage"] for record in records] == result["stages"]
    allowed_keys = {"status", "request_id", "stage", "duration_ms", "contract"}
    assert all(set(record) <= allowed_keys for record in records)
    assert all(record["contract"] == "ok" for record in records)
    for sensitive in (
        TOKEN,
        ANON_KEY,
        EMAIL,
        PASSWORD,
        base64.b64encode(garment_bytes).decode(),
        base64.b64encode(person_bytes).decode(),
        "recognition-provider-payload-must-not-log",
        "standardized-image-must-not-log",
        "tryon-private-result-must-not-log",
    ):
        assert sensitive not in output


def test_release_smoke_rejects_mock_provider_contract():
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        try:
            _run(_responses(recognition_provider="mock"))
            assert False, "mock provider output must block release"
        except SmokeError as error:
            assert error.code == "recognize-multi_mock_provider"
    assert TOKEN not in output.getvalue()


def _expect_smoke_error(responses, expected_code):
    try:
        _run(responses)
        assert False, f"{expected_code} must block release"
    except SmokeError as error:
        assert error.code == expected_code


def test_release_smoke_rejects_invalid_endpoint_contracts():
    responses = _responses()
    responses[0].payload["expires_in"] = 7200
    _expect_smoke_error(responses, "auth_invalid_short_lived_token")

    responses = _responses()
    responses[2].payload["verified"] = False
    _expect_smoke_error(responses, "standardize_invalid_contract")

    responses = _responses()
    responses[3].payload["trace"]["rag_mode"] = "fallback"
    _expect_smoke_error(responses, "recommend_degraded_contract")

    responses = _responses()
    responses[4].payload["image_ref"] = ""
    _expect_smoke_error(responses, "tryon-image_missing_real_image")


def test_release_smoke_requires_normalized_visible_bounds():
    invalid_bounds = [
        None,
        {"left": 0.0, "top": 0.0, "width": 0.0, "height": 1.0},
        {"left": 0.8, "top": 0.0, "width": 0.3, "height": 1.0},
        {"left": float("nan"), "top": 0.0, "width": 1.0, "height": 1.0},
        {"left": "0", "top": 0.0, "width": 1.0, "height": 1.0},
        {"left": False, "top": 0.0, "width": 1.0, "height": 1.0},
    ]
    for bounds in invalid_bounds:
        responses = _responses()
        if bounds is None:
            responses[2].payload.pop("visible_bounds")
        else:
            responses[2].payload["visible_bounds"] = bounds
        _expect_smoke_error(responses, "standardize_invalid_contract")


def test_tryon_validation_rejects_example_and_disallowed_hosts():
    for image_ref in (
        "https://example.test/canned.png",
        "https://disallowed.invalid/result.png",
    ):
        try:
            release_smoke._validate_tryon({"image_ref": image_ref})
            assert False, "disallowed try-on image host must block release"
        except SmokeError as error:
            assert error.code == "tryon-image_untrusted_image"


def test_tryon_validation_rejects_malformed_provider_bytes():
    try:
        release_smoke._validate_tryon(
            {"image_ref": APPROVED_IMAGE_URL},
            provider_image_reader=lambda _ref, _timeout: b"not-an-image",
        )
        assert False, "invalid provider image bytes must block release"
    except SmokeError as error:
        assert error.code == "tryon-image_invalid_image"


def test_tryon_validation_fully_decodes_and_rejects_truncated_jpeg():
    truncated = _valid_jpeg()[:-1]
    with Image.open(io.BytesIO(truncated)) as image:
        image.verify()
    try:
        with Image.open(io.BytesIO(truncated)) as image:
            image.load()
        assert False, "fixture must expose the verify-versus-load regression"
    except OSError:
        pass

    try:
        release_smoke._validate_tryon(
            {"image_ref": APPROVED_IMAGE_URL},
            provider_image_reader=lambda _ref, _timeout: truncated,
        )
        assert False, "truncated JPEG must block release"
    except SmokeError as error:
        assert error.code == "tryon-image_invalid_image"


def test_tryon_validation_accepts_approved_provider_image_boundary():
    raw = _valid_jpeg()

    def reader(ref, timeout_seconds):
        return alpha_matte.read_provider_image_ref(
            ref,
            timeout_seconds=timeout_seconds,
            allowed_hosts=(),
            resolver=lambda _host, _port: ["93.184.216.34"],
            transport=lambda _url, _ip, _timeout: alpha_matte.ProviderHttpResponse(
                status=200,
                headers={"Content-Length": str(len(raw))},
                body=raw,
            ),
        )

    release_smoke._validate_tryon(
        {"image_ref": APPROVED_IMAGE_URL},
        provider_image_reader=reader,
    )


def test_release_smoke_enforces_strict_outer_deadline():
    opener_finished = Event()

    def blocking_opener(_request, timeout):
        assert timeout > 0
        time.sleep(0.3)
        opener_finished.set()
        return _responses()[0]

    with TemporaryDirectory() as directory:
        garment, person = _fixture_files(directory)
        started = time.monotonic()
        with contextlib.redirect_stdout(io.StringIO()):
            with patch.object(
                release_smoke,
                "OVERALL_TIMEOUT_SECONDS",
                0.05,
                create=True,
            ):
                try:
                    run_release_smoke(
                        service_url="https://service.example",
                        supabase_url="https://project.supabase.co",
                        supabase_anon_key=ANON_KEY,
                        email=EMAIL,
                        password=PASSWORD,
                        garment_fixture=garment,
                        person_fixture=person,
                        opener=blocking_opener,
                    )
                    assert False, "overall smoke deadline must fail closed"
                except SmokeError as error:
                    assert error.code == "release_smoke_deadline_exceeded"
        elapsed = time.monotonic() - started

    assert elapsed < 0.2, f"smoke outer deadline was not enforced: {elapsed:.3f}s"
    assert not opener_finished.is_set(), "release smoke waited for the blocked opener"


def test_release_smoke_requires_all_step_scoped_secrets():
    try:
        load_smoke_environment({})
        assert False, "missing smoke secrets must fail before network access"
    except SmokeError as error:
        assert error.code == "missing_smoke_secrets"

    configured = load_smoke_environment({
        "STYLEE_SMOKE_SUPABASE_URL": "https://project.supabase.co",
        "STYLEE_SMOKE_SUPABASE_ANON_KEY": ANON_KEY,
        "STYLEE_SMOKE_EMAIL": EMAIL,
        "STYLEE_SMOKE_PASSWORD": PASSWORD,
    })
    assert configured["supabase_url"] == "https://project.supabase.co"
    assert configured["email"] == EMAIL


def test_release_smoke_uses_small_project_owned_fixtures():
    garment = ROOT / "fixtures" / "release-smoke" / "garment.png"
    person = ROOT / "fixtures" / "release-smoke" / "person.jpg"
    assert garment.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
    assert person.read_bytes().startswith(b"\xff\xd8")
    assert garment.stat().st_size <= 100_000
    assert person.stat().st_size <= 200_000


def test_release_smoke_cli_can_import_repository_package():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "release_smoke.py"), "--help"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr[-1000:]


def main():
    test_release_smoke_request_sequence_auth_contract_and_log_redaction()
    test_release_smoke_rejects_mock_provider_contract()
    test_release_smoke_rejects_invalid_endpoint_contracts()
    test_release_smoke_requires_normalized_visible_bounds()
    test_tryon_validation_rejects_example_and_disallowed_hosts()
    test_tryon_validation_rejects_malformed_provider_bytes()
    test_tryon_validation_fully_decodes_and_rejects_truncated_jpeg()
    test_tryon_validation_accepts_approved_provider_image_boundary()
    test_release_smoke_enforces_strict_outer_deadline()
    test_release_smoke_requires_all_step_scoped_secrets()
    test_release_smoke_uses_small_project_owned_fixtures()
    test_release_smoke_cli_can_import_repository_package()
    print("ok")


if __name__ == "__main__":
    main()
