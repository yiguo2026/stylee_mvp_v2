"""HTTP boundary security for the model service (stdlib only).

Production requests carry the user's Supabase access token.  We validate it
with Supabase Auth instead of accepting a shared secret that would have to be
embedded in the Expo bundle.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
import re
from collections import defaultdict, deque


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class TokenVerifier:
    def __init__(self) -> None:
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.anon_key = (os.environ.get("SUPABASE_PUBLISHABLE_KEY")
                         or os.environ.get("SUPABASE_ANON_KEY", ""))
        self._cache: dict[str, tuple[float, str]] = {}
        self._lock = threading.Lock()

    def verify(self, authorization: str) -> str | None:
        if not authorization.lower().startswith("bearer "):
            return None
        token = authorization.split(" ", 1)[1].strip()
        if not token or not self.url or not self.anon_key:
            return None
        now = time.time()
        with self._lock:
            hit = self._cache.get(token)
            if hit and hit[0] > now:
                return hit[1]
        req = urllib.request.Request(
            self.url + "/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": self.anon_key},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                user_id = str(json.loads(resp.read().decode("utf-8")).get("id") or "")
        except (urllib.error.HTTPError, urllib.error.URLError, ValueError):
            return None
        if not user_id:
            return None
        with self._lock:
            self._cache[token] = (now + 60, user_id)
            if len(self._cache) > 1000:
                self._cache = {k: v for k, v in self._cache.items() if v[0] > now}
        return user_id


class RateLimiter:
    def __init__(self) -> None:
        self.limit = max(1, int(os.environ.get("STYLEE_RATE_LIMIT_PER_MINUTE", "20")))
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, subject: str) -> bool:
        now = time.time()
        cutoff = now - 60
        with self._lock:
            hits = self._hits[subject]
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


def allowed_origins() -> set[str]:
    configured = os.environ.get("STYLEE_ALLOWED_ORIGINS", "")
    values = {x.strip().rstrip("/") for x in configured.split(",") if x.strip()}
    return values or {
        "http://localhost:8081", "http://127.0.0.1:8081",
        "https://yiguo2026.github.io",
    }


def register_user(username: str, password: str) -> tuple[int, dict]:
    """Create the synthetic-email account with the service role kept server-side."""
    if not re.fullmatch(r"[A-Za-z0-9_]+", username or "") or len(password) < 6:
        return 200, {"ok": False, "error": "invalid username or password"}
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = (os.environ.get("SUPABASE_SECRET_KEY")
                   or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    if not url or not service_key:
        return 503, {"error": "registration service is not configured"}
    email = f"{username}@users.stylee.app"
    body = json.dumps({"email": email, "password": password, "email_confirm": True}).encode()
    admin_headers = {"Content-Type": "application/json", "apikey": service_key}
    if not service_key.startswith("sb_secret_"):
        admin_headers["Authorization"] = f"Bearer {service_key}"
    req = urllib.request.Request(
        url + "/auth/v1/admin/users", data=body, method="POST",
        headers=admin_headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            user = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        e.read()
        if e.code in {400, 409, 422}:
            return 200, {"ok": False, "error": "username already exists"}
        return e.code, {"error": "authentication service rejected the request"}
    except urllib.error.URLError:
        return 502, {"error": "authentication service unavailable"}
    user_id = str(user.get("id") or "")
    if user_id:
        profile = json.dumps({"user_id": user_id, "username": username, "nickname": username}).encode()
        profile_headers = {"Content-Type": "application/json", "apikey": service_key,
                           "Prefer": "return=minimal"}
        if not service_key.startswith("sb_secret_"):
            profile_headers["Authorization"] = f"Bearer {service_key}"
        profile_req = urllib.request.Request(
            url + "/rest/v1/users", data=profile, method="POST",
            headers=profile_headers,
        )
        try:
            urllib.request.urlopen(profile_req, timeout=10).close()
        except (urllib.error.HTTPError, urllib.error.URLError):
            pass
    return 201, {"ok": bool(user_id)}
