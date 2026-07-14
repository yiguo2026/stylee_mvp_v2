"""本地推理服务:stdlib http.server 暴露 recommend/recognize/standardize。

契约适配在 adapter.py;key 全在服务端 env;无 key 走 mock。CORS 放开供本地 App 调。
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ..contracts import PhotoType, WardrobeItem
from ..ingest import recognize_item, standardize_item
from ..pipeline import recommend
from ..providers import build_provider
from ..rag import default_retriever
from ..vision import build_image_standardizer, build_vision_provider
from . import adapter
from . import ai_features
from . import gamma
from .security import RateLimiter, TokenVerifier, allowed_origins, env_bool

_CORS = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}


def _photo_type(value):
    value = {"flat": "flatlay", "product": "web"}.get(value, value)
    for p in PhotoType:
        if p.value == value:
            return p
    return PhotoType.ON_BODY


def _image_url(payload: dict) -> str:
    if payload.get("image_url"):
        return payload["image_url"]
    if payload.get("image_b64"):
        return f"data:{payload.get('mime', 'image/jpeg')};base64,{payload['image_b64']}"
    return ""


class Handler(BaseHTTPRequestHandler):
    provider_name = "mock"
    require_auth = False
    verifier = TokenVerifier()
    limiter = RateLimiter()
    origins = allowed_origins()

    def _cors(self) -> dict[str, str]:
        origin = (self.headers.get("Origin") or "").rstrip("/")
        headers = dict(_CORS)
        if origin and origin in self.origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Vary"] = "Origin"
        return headers

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        for k, v in self._cors().items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        for k, v in self._cors().items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        origin = (self.headers.get("Origin") or "").rstrip("/")
        if origin and origin not in self.origins:
            self._send(403, {"error": "origin not allowed"})
            return
        user_id = "local"
        if self.require_auth:
            user_id = self.verifier.verify(self.headers.get("Authorization") or "") or ""
            if not user_id:
                self._send(401, {"error": "valid user access token required"})
                return
        subject = user_id or self.client_address[0]
        if not self.limiter.allow(subject):
            self._send(429, {"error": "rate limit exceeded"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > int(os.environ.get("STYLEE_MAX_BODY_BYTES", "15728640")):
                self._send(413, {"error": "request too large"})
                return
            payload = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception as e:  # noqa: BLE001
            self._send(400, {"error": f"bad json: {e}"})
            return
        try:
            if self.path == "/recommend":
                self._send(200, self._recommend(payload))
            elif self.path == "/recognize":
                self._send(200, self._recognize(payload))
            elif self.path == "/standardize":
                self._send(200, self._standardize(payload))
            elif self.path == "/recognize-multi":
                self._send(200, ai_features.recognize_many(_image_url(payload)))
            elif self.path == "/intent":
                self._send(200, ai_features.intent(str(payload.get("query") or "")))
            elif self.path == "/reason":
                self._send(200, ai_features.reason(payload))
            elif self.path == "/product-extract":
                self._send(200, ai_features.product(payload))
            elif self.path == "/tryon-suggestion":
                self._send(200, ai_features.tryon_suggestion(payload))
            elif self.path == "/tryon-image":
                payload["image_url"] = _image_url(payload)
                self._send(200, {"image_ref": ai_features.tryon_image(payload)})
            elif self.path == "/gamma/import":
                self._send(200, gamma.import_garment(payload))
            elif self.path == "/gamma/outfit":
                self._send(200, gamma.outfit(payload))
            elif self.path == "/gamma/tryon":
                self._send(200, gamma.tryon(payload))
            else:
                self._send(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})

    def _recommend(self, payload: dict) -> dict:
        ctx = adapter.to_request_context(payload)
        provider = build_provider(self.provider_name)
        result = recommend(ctx, provider, default_retriever())
        response = adapter.outfits_to_app(result, ctx)
        response["trace"]["provider"] = provider.name
        return response

    def _recognize(self, payload: dict) -> dict:
        provider = build_vision_provider()
        response = adapter.ingest_to_app(recognize_item(_image_url(payload), provider))
        response["provider"] = provider.name
        return response

    def _standardize(self, payload: dict) -> dict:
        d = payload.get("item") or {}
        item = WardrobeItem(id=str(d.get("item_id", "")),
                            category=adapter.model_category(d.get("category")),
                            subcategory=str(d.get("description") or "")[:100],
                            colors=[d["color"]] if d.get("color") else [],
                            material=str(d.get("material") or "")[:100])
        # Standardization is sequential: edit, then visual verification. Bound
        # verification separately so a slow verifier cannot double total time.
        verify_timeout = int(os.environ.get("VL_VERIFY_TIMEOUT_SECONDS", "20"))
        edit_timeout = int(os.environ.get("IMG_EDIT_TIMEOUT_SECONDS", "60"))
        vision = build_vision_provider(timeout=verify_timeout)
        standardizer = build_image_standardizer(timeout=edit_timeout)
        si = standardize_item(_image_url(payload), item, _photo_type(payload.get("photo_type")),
                              vision, standardizer)
        response = adapter.std_to_app(si)
        response["provider"] = standardizer.name
        return response

    def log_message(self, *a) -> None:   # 静音默认访问日志
        pass


def run_server(host: str = "127.0.0.1", port: int = 8000,
               provider_name: str = "mock") -> ThreadingHTTPServer:
    Handler.provider_name = provider_name
    default_auth = host not in {"127.0.0.1", "localhost", "::1"}
    Handler.require_auth = env_bool("STYLEE_REQUIRE_AUTH", default_auth)
    Handler.verifier = TokenVerifier()
    Handler.limiter = RateLimiter()
    Handler.origins = allowed_origins()
    return ThreadingHTTPServer((host, port), Handler)
