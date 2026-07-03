"""本地推理服务:stdlib http.server 暴露 recommend/recognize/standardize。

契约适配在 adapter.py;key 全在服务端 env;无 key 走 mock。CORS 放开供本地 App 调。
"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ..contracts import PhotoType, WardrobeItem
from ..ingest import recognize_item, standardize_item
from ..pipeline import recommend
from ..providers import build_provider
from ..rag import default_retriever
from ..vision import build_image_standardizer, build_vision_provider
from . import adapter

_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}


def _photo_type(value):
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

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        for k, v in _CORS.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        for k, v in _CORS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            n = int(self.headers.get("Content-Length") or 0)
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
            else:
                self._send(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})

    def _recommend(self, payload: dict) -> dict:
        ctx = adapter.to_request_context(payload)
        result = recommend(ctx, build_provider(self.provider_name), default_retriever())
        return adapter.outfits_to_app(result, ctx)

    def _recognize(self, payload: dict) -> dict:
        return adapter.ingest_to_app(recognize_item(_image_url(payload), build_vision_provider()))

    def _standardize(self, payload: dict) -> dict:
        d = payload.get("item") or {}
        item = WardrobeItem(id=str(d.get("item_id", "")),
                            category=adapter.model_category(d.get("category")),
                            colors=[d["color"]] if d.get("color") else [])
        si = standardize_item(_image_url(payload), item, _photo_type(payload.get("photo_type")),
                              build_vision_provider(), build_image_standardizer())
        return adapter.std_to_app(si)

    def log_message(self, *a) -> None:   # 静音默认访问日志
        pass


def run_server(host: str = "127.0.0.1", port: int = 8000,
               provider_name: str = "mock") -> ThreadingHTTPServer:
    Handler.provider_name = provider_name
    return ThreadingHTTPServer((host, port), Handler)
