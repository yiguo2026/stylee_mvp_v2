import os
import json
import urllib.request

from stylee.service.security import RateLimiter, TokenVerifier, allowed_origins, env_bool, register_user
from stylee import usage_log


def test_defaults_and_missing_credentials():
    assert env_bool("STYLEE_TEST_MISSING", True) is True
    assert "https://yiguo2026.github.io" in allowed_origins()
    assert TokenVerifier().verify("Bearer definitely-not-a-token") is None


def test_rate_limit():
    old = os.environ.get("STYLEE_RATE_LIMIT_PER_MINUTE")
    os.environ["STYLEE_RATE_LIMIT_PER_MINUTE"] = "2"
    try:
        limiter = RateLimiter()
        assert limiter.allow("u") is True
        assert limiter.allow("u") is True
        assert limiter.allow("u") is False
    finally:
        if old is None:
            os.environ.pop("STYLEE_RATE_LIMIT_PER_MINUTE", None)
        else:
            os.environ["STYLEE_RATE_LIMIT_PER_MINUTE"] = old


def test_register_requires_server_configuration():
    saved = {k: os.environ.pop(k, None) for k in (
        "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")}
    try:
        status, body = register_user("valid_user", "abcdef")
        assert status == 503 and "configured" in body["error"]
    finally:
        for key, value in saved.items():
            if value is not None:
                os.environ[key] = value


def test_new_supabase_secret_is_never_sent_as_bearer():
    saved = {k: os.environ.get(k) for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY")}
    original = urllib.request.urlopen
    seen = []

    class Response:
        def __init__(self, body=b""):
            self.body = body
        def read(self):
            return self.body
        def close(self):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    def fake(req, timeout=0):
        seen.append({k.lower(): v for k, v in req.header_items()})
        if "/auth/v1/admin/users" in req.full_url:
            return Response(json.dumps({"id": "user-1"}).encode())
        return Response()

    os.environ["SUPABASE_URL"] = "https://example.supabase.co"
    os.environ["SUPABASE_SECRET_KEY"] = "sb_secret_test"
    urllib.request.urlopen = fake
    try:
        status, body = register_user("valid_user", "abcdef")
        assert status == 201 and body["ok"] is True
        assert len(seen) == 2
        assert all(h.get("apikey") == "sb_secret_test" for h in seen)
        assert all("authorization" not in h for h in seen)
    finally:
        urllib.request.urlopen = original
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_usage_monitoring_is_opt_in():
    saved_url, saved_key = usage_log._MON_URL, usage_log._MON_KEY
    original = urllib.request.urlopen
    calls = []
    usage_log._MON_URL = ""
    usage_log._MON_KEY = ""
    urllib.request.urlopen = lambda *args, **kwargs: calls.append((args, kwargs))
    try:
        usage_log._post({"provider": "test"})
        assert calls == []
    finally:
        usage_log._MON_URL = saved_url
        usage_log._MON_KEY = saved_key
        urllib.request.urlopen = original


def main():
    test_defaults_and_missing_credentials()
    test_rate_limit()
    test_register_requires_server_configuration()
    test_new_supabase_secret_is_never_sent_as_bearer()
    test_usage_monitoring_is_opt_in()
    print("ok")


if __name__ == "__main__":
    main()
