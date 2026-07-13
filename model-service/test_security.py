import os
import urllib.request

from stylee.service.security import RateLimiter, TokenVerifier, allowed_origins, env_bool
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
    test_usage_monitoring_is_opt_in()
    print("ok")


if __name__ == "__main__":
    main()
