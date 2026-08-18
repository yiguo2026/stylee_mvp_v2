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
from ..vision.alpha_matte import PillowAlphaMatteProcessor
from ..vision.mock import MockAlphaMatteProcessor, MockImageStandardizer
from . import adapter
from . import ai_features
from . import gamma
from .request_trace import RequestTrace, error_status, normalize_request_id
from .security import RateLimiter, TokenVerifier, allowed_origins, env_bool

_CORS = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Expose-Headers": "X-Request-ID",
}


def _photo_type(value):
    value = {"flat": "flatlay", "flat_lay": "flatlay", "product": "web"}.get(value, value)
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

    def _send(self, status: int, payload: dict, request_id: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            if request_id:
                self.send_header("X-Request-ID", request_id)
            for k, v in self._cors().items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            print(json.dumps({
                "event": "stylee_client_disconnected",
                "path": self.path,
                "request_id": request_id,
                "status": status,
            }, ensure_ascii=False, separators=(",", ":")), flush=True)

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
        request_id = normalize_request_id(self.headers.get("X-Request-ID"))
        trace = RequestTrace(
            feature=self.path.strip("/").replace("/", "_") or "unknown",
            request_id=request_id,
            path=self.path,
        )
        origin = (self.headers.get("Origin") or "").rstrip("/")
        if origin and origin not in self.origins:
            trace.emit(403)
            self._send(403, {"error": "origin not allowed", "request_id": request_id}, request_id)
            return
        user_id = "local"
        if self.require_auth:
            user_id = self.verifier.verify(self.headers.get("Authorization") or "") or ""
            if not user_id:
                trace.emit(401)
                self._send(401, {"error": "valid user access token required", "request_id": request_id}, request_id)
                return
        subject = user_id or self.client_address[0]
        if not self.limiter.allow(subject):
            trace.emit(429)
            self._send(429, {"error": "rate limit exceeded", "request_id": request_id}, request_id)
            return
        try:
            with trace.stage("request.parse_json"):
                n = int(self.headers.get("Content-Length") or 0)
                if n > int(os.environ.get("STYLEE_MAX_BODY_BYTES", "15728640")):
                    trace.emit(413)
                    self._send(413, {"error": "request too large", "request_id": request_id}, request_id)
                    return
                payload = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception as e:  # noqa: BLE001
            trace.emit(400, e)
            self._send(400, {"error": f"bad json: {e}", "request_id": request_id}, request_id)
            return

        error = None
        try:
            if self.path == "/recommend":
                response = self._recommend(payload, trace)
            elif self.path == "/recognize":
                response = self._recognize(payload, trace)
            elif self.path == "/standardize":
                response = self._standardize(payload, trace)
            elif self.path == "/recognize-multi":
                multi_timeout = int(os.environ.get("VL_MULTI_TIMEOUT_SECONDS", "50"))
                trace.annotate(
                    upstream_timeout_seconds=multi_timeout,
                    vision_max_pixels=ai_features.multi_max_pixels(),
                )
                with trace.stage("A1.multi_vision_recognize"):
                    response = ai_features.recognize_many(_image_url(payload))
                input_info = response.pop("input_info", {}) if isinstance(response, dict) else {}
                items = response.get("items") if isinstance(response, dict) else None
                photo_types = [
                    str(item.get("photo_type"))
                    for item in items or []
                    if isinstance(item, dict) and item.get("photo_type")
                ]
                trace.annotate(
                    provider=response.get("provider"),
                    recognized_item_count=len(items) if isinstance(items, list) else 0,
                    recognized_photo_types=photo_types,
                    recognition_input_bytes=input_info.get("encoded_bytes"),
                    recognition_input_width=input_info.get("width"),
                    recognition_input_height=input_info.get("height"),
                    recognition_input_compressed=input_info.get("compressed"),
                )
            elif self.path == "/intent":
                with trace.stage("intent.model_call"):
                    response = ai_features.intent(str(payload.get("query") or ""))
            elif self.path == "/reason":
                with trace.stage("reason.model_call"):
                    response = ai_features.reason(payload)
            elif self.path == "/product-extract":
                with trace.stage("product_extract.model_call"):
                    response = ai_features.product(payload)
            elif self.path == "/tryon-suggestion":
                with trace.stage("tryon_suggestion.model_call"):
                    response = ai_features.tryon_suggestion(payload)
            elif self.path == "/tryon-image":
                payload["image_url"] = _image_url(payload)
                with trace.stage("tryon_image.model_call"):
                    response = {"image_ref": ai_features.tryon_image(payload)}
            elif self.path == "/gamma/import":
                with trace.stage("gamma.import"):
                    response = gamma.import_garment(payload)
            elif self.path == "/gamma/outfit":
                with trace.stage("gamma.outfit"):
                    response = gamma.outfit(payload)
            elif self.path == "/gamma/tryon":
                with trace.stage("gamma.tryon"):
                    response = gamma.tryon(payload)
            else:
                trace.emit(404)
                self._send(404, {"error": "not found", "request_id": request_id}, request_id)
                return
        except Exception as e:  # noqa: BLE001
            error = e
            status = error_status(e)
            response = trace.error_summary(e)
        else:
            status = 200
            if isinstance(response, dict):
                existing_trace = response.get("trace")
                if not isinstance(existing_trace, dict):
                    existing_trace = {}
                    response["trace"] = existing_trace
                existing_trace.update(trace.response_summary())

        trace.emit(status, error)
        self._send(status, response, request_id)

    def _recommend(self, payload: dict, trace: RequestTrace) -> dict:
        with trace.stage("request_adapter"):
            ctx = adapter.to_request_context(payload)
        with trace.stage("provider_init"):
            provider = build_provider(self.provider_name)
        trace.annotate(
            provider=provider.name,
            model_intent=getattr(provider, "model_intent", None),
            model_generation=getattr(provider, "model_gen", None),
            upstream_timeout_seconds=getattr(provider, "timeout", None),
        )
        with trace.stage("rag_init"):
            retriever = default_retriever()
        trace.annotate(rag_mode=getattr(retriever, "mode", "keyword"))
        with trace.stage("recommend_pipeline"):
            result = recommend(ctx, provider, retriever, stage_timer=trace.stage)
        trace.annotate(
            rag_mode=result.trace.get("rag_mode"),
            rag_fallback=result.trace.get("rag_fallback"),
        )
        if isinstance(result.trace.get("rag_fallback"), dict):
            trace.record_fallback_info(result.trace["rag_fallback"])
        with trace.stage("response_adapter"):
            response = adapter.outfits_to_app(result, ctx)
        response["trace"]["provider"] = provider.name
        return response

    def _recognize(self, payload: dict, trace: RequestTrace) -> dict:
        recognize_timeout = int(os.environ.get("VL_RECOGNIZE_TIMEOUT_SECONDS", "15"))
        with trace.stage("vision_provider_init"):
            provider = build_vision_provider(timeout=recognize_timeout)
        trace.annotate(provider=provider.name, upstream_timeout_seconds=recognize_timeout)
        result = recognize_item(
            _image_url(payload), provider,
            stage_timer=trace.stage,
            on_fallback=trace.record_fallback,
            strict=True,
        )
        with trace.stage("response_adapter"):
            response = adapter.ingest_to_app(result)
        response["provider"] = provider.name
        return response

    def _standardize(self, payload: dict, trace: RequestTrace) -> dict:
        d = payload.get("item") or {}
        with trace.stage("request_adapter"):
            item = WardrobeItem(id=str(d.get("item_id", "")),
                                category=adapter.model_category(d.get("category")),
                                subcategory=str(d.get("description") or "")[:100],
                                colors=[d["color"]] if d.get("color") else [],
                                material=str(d.get("material") or "")[:100])
        # Standardization is sequential: edit, then visual verification. Bound
        # verification separately so a slow verifier cannot double total time.
        verify_timeout = int(os.environ.get("VL_VERIFY_TIMEOUT_SECONDS", "20"))
        edit_timeout = int(os.environ.get("IMG_EDIT_TIMEOUT_SECONDS", "60"))
        with trace.stage("vision_provider_init"):
            vision = build_vision_provider(timeout=verify_timeout)
            standardizer = build_image_standardizer(timeout=edit_timeout)
            matte_processor = (
                MockAlphaMatteProcessor()
                if isinstance(standardizer, MockImageStandardizer)
                else PillowAlphaMatteProcessor()
            )
        trace.annotate(
            provider=standardizer.name,
            verifier=vision.name,
            matte_provider=matte_processor.name,
        )
        si = standardize_item(_image_url(payload), item, _photo_type(payload.get("photo_type")),
                              vision, standardizer, matte_processor, stage_timer=trace.stage,
                              on_fallback=trace.record_fallback)
        with trace.stage("response_adapter"):
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
