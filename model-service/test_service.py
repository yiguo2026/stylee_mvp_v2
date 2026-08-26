import hashlib
import json as _json
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

from stylee.service.adapter import (
    label, model_category, app_category, wardrobe_item, to_request_context,
    compact_recommended_name, outfits_to_app, ingest_to_app, std_to_app
)
from stylee.service.ai_features import normalize_multi_item
from scripts.check_outfit_quality_live import validate_outfit as validate_live_outfit
from stylee.contracts import (
    Category, InputMode, Sleeve, Fit, Season, BodyShape,
    Outfit, OutfitItemRef, GapSuggestion, RecommendationResult, IngestResult,
    StandardizedImage, WardrobeItem, PhotoType, Slot, RequestContext,
)


def test_label_and_category():
    assert label("date") == "约会" and label("french") == "法式" and label("unknown_x") == "unknown_x"
    assert model_category("下装") == Category.BOTTOM
    assert model_category("外星") == Category.TOP        # 未命中默认上装
    assert app_category(Category.SHOES) == "鞋履"
    assert model_category("连体装") == Category.DRESS
    assert model_category("包袋") == Category.BAG


def test_wardrobe_item():
    it = wardrobe_item({"item_id": "i1", "name": "白衬衫", "category": "上装", "color": "白色",
                        "material": "棉", "sleeve_length": "长袖", "fit": "修身",
                        "season": ["春", "秋"], "occasion_tags": ["通勤"]})
    assert it.id == "i1" and it.category == Category.TOP and it.colors == ["白色"]
    assert it.sleeve == Sleeve.LONG and it.fit == Fit.SLIM and it.seasons == [Season.SPRING, Season.AUTUMN]


def test_to_request_context_nl():
    ctx = to_request_context({"input_mode": "nl", "query": "周末约会",
                              "wardrobe": [{"item_id": "i1", "category": "上装", "color": "白色"}],
                              "profile": {"gender": "female", "body_shape": "梨形"},
                              "weather": {"temp_c": 22, "condition": "晴", "time_of_day": "evening"}, "n": 3})
    assert ctx.input_mode == InputMode.NL and ctx.n == 3
    assert ctx.wardrobe[0].id == "i1" and ctx.user_profile.body_shape == BodyShape.PEAR
    assert ctx.weather.temp_c == 22.0 and "周末约会" in ctx.query_text


def test_to_request_context_tags():
    ctx = to_request_context({"input_mode": "tags", "tags": ["date", "french", "temp_cold"], "wardrobe": []})
    assert ctx.input_mode == InputMode.TAGS
    assert ctx.filter_tags.occasion == "约会" and ctx.filter_tags.style == "法式"
    assert ctx.weather.temp_c == 5.0                     # 温度标签覆盖


def test_outfits_to_app():
    o = Outfit(items=[OutfitItemRef(role=Slot.TORSO, ref="i1", owned=True),
                      OutfitItemRef(role=Slot.FEET, owned=False,
                                    suggest=GapSuggestion(Category.SHOES, "小白鞋", "缺鞋"))],
               occasion="约会", reasoning="上紧下松")
    res = RecommendationResult(outfits=[o], trace={
        "rag_mode": "vector",
        "candidate_pool_size": 16,
        "first_pass_valid": 2,
        "rejected_by_rule": {"H_FEET_EXACTLY_ONE": 1},
        "query_overridden_rules": [],
        "retry_triggered": False,
        "retry_candidate_count": 0,
        "retry_duration_ms": 0,
        "recommended_gap_count": 1,
        "fallback_type": "none",
        "not_public": "must-not-leak",
    })
    ctx = RequestContext(input_mode=InputMode.NL, wardrobe=[])
    app = outfits_to_app(res, ctx)
    assert app["outfits"][0]["owned_item_ids"] == ["i1"]
    assert app["outfits"][0]["recommended_items"][0]["category"] == "鞋履"
    assert app["outfits"][0]["comment"] == "上紧下松"
    assert set(app["outfits"][0]) == {
        "name", "owned_item_ids", "recommended_items", "comment",
    }
    assert app["trace"]["rag_mode"] == "vector" and app["trace"]["pool"] == 16
    assert app["trace"]["first_pass_valid"] == 2
    assert app["trace"]["retry_candidate_count"] == 0
    assert app["trace"]["fallback_type"] == "none"
    assert "not_public" not in app["trace"]


def test_compact_recommended_name():
    assert compact_recommended_name(
        "补：建议购买一件适合海岛度假的浅蓝色牛仔短裤", Category.BOTTOM
    ) == "浅蓝色牛仔短裤"
    assert compact_recommended_name(
        "建议选择一双透气轻便的白色帆布鞋", Category.SHOES
    ) == "白色帆布鞋"


def test_ingest_to_app():
    it = WardrobeItem(id="x", category=Category.BOTTOM, colors=["黑色"], material="牛仔", style_tags=["都市"])
    r = IngestResult(item=it, photo_type=PhotoType.FLATLAY, confidence=0.9, needs_review=False, raw={"brand": "A"})
    d = ingest_to_app(r)
    assert d["category"] == "下装" and d["color"] == "黑色" and d["material"] == "牛仔"
    assert d["style"] == "都市" and d["brand"] == "A" and d["photo_type"] == "flatlay" and d["needs_review"] is False


def test_std_to_app():
    assert std_to_app(StandardizedImage(
        image_ref="data:image/png;base64,AAAA",
        method="img2img_alpha",
        verified=True,
        mime="image/png",
        background="transparent",
        alpha_verified=True,
        matte_provider="pillow-border-connected-v1",
        failure_stage=None,
    )) == {
        "image_ref": "data:image/png;base64,AAAA",
        "mime": "image/png",
        "method": "img2img_alpha",
        "verified": True,
        "background": "transparent",
        "alpha_verified": True,
        "matte_provider": "pillow-border-connected-v1",
        "failure_stage": None,
    }


def test_normalize_multi_item_contract():
    item = normalize_multi_item({
        "category": "上装", "color": "白色", "material": "棉",
        "description": "白色T恤", "photo_type": "flat",
    }, 0)
    assert item["photo_type"] == "flatlay" and item["needs_review"] is False
    assert item["confidence"] == 0.95 and item["index"] == 1

    invalid = normalize_multi_item({"category": "?", "photo_type": "?"}, 2)
    assert invalid["category"] == "上装" and invalid["photo_type"] == "on_body"
    assert invalid["needs_review"] is True and invalid["confidence"] == 0.4


def _assert_live_checker_rejects(outfit):
    rejected = False
    try:
        validate_live_outfit("daily", outfit)
    except AssertionError:
        rejected = True
    assert rejected, "live checker should reject malformed layout mapping"


def test_live_checker_rejects_duplicate_owned_and_recommended_keys():
    _assert_live_checker_rejects({
        "owned_item_ids": ["top", "bottom", "shoes"],
        "recommended_items": [],
        "layout_items": [
            {"source": "owned", "item_id": "top", "layout_role": "base"},
            {"source": "owned", "item_id": "top", "layout_role": "bottom"},
            {"source": "owned", "item_id": "shoes", "layout_role": "shoes"},
        ],
    })
    _assert_live_checker_rejects({
        "owned_item_ids": ["top", "bottom", "shoes"],
        "recommended_items": [{}, {}],
        "layout_items": [
            {"source": "owned", "item_id": "top", "layout_role": "base"},
            {"source": "owned", "item_id": "bottom", "layout_role": "bottom"},
            {"source": "owned", "item_id": "shoes", "layout_role": "shoes"},
            {"source": "recommended", "recommended_index": 0, "layout_role": "scarf"},
            {"source": "recommended", "recommended_index": 0, "layout_role": "bag"},
        ],
    })


def test_live_checker_rejects_missing_or_opposite_source_keys():
    base = {
        "owned_item_ids": ["top", "bottom", "shoes"],
        "recommended_items": [{}],
    }
    malformed_entries = [
        {"source": "owned", "layout_role": "base"},
        {"source": "owned", "recommended_index": 0, "layout_role": "base"},
        {"source": "owned", "item_id": "top", "recommended_index": 0, "layout_role": "base"},
        {"source": "recommended", "layout_role": "scarf"},
        {"source": "recommended", "item_id": "top", "layout_role": "scarf"},
        {"source": "recommended", "item_id": "top", "recommended_index": 0, "layout_role": "scarf"},
    ]
    for malformed in malformed_entries:
        _assert_live_checker_rejects({
            **base,
            "layout_items": [
                malformed,
                {"source": "owned", "item_id": "bottom", "layout_role": "bottom"},
                {"source": "owned", "item_id": "shoes", "layout_role": "shoes"},
                {"source": "recommended", "recommended_index": 0, "layout_role": "scarf"},
            ],
        })


from stylee.providers import ProviderTimeoutError
from stylee.service.server import _photo_type, run_server
from stylee.service import gamma as gamma_service


def _headers(response):
    return {name.lower(): value for name, value in response.headers.items()}


def _post_with_headers(url, payload, request_id=None):
    headers = {"Content-Type": "application/json"}
    if request_id:
        headers["X-Request-ID"] = request_id
    req = urllib.request.Request(url, data=_json.dumps(payload).encode(), method="POST",
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, _json.loads(r.read().decode()), _headers(r)
    except urllib.error.HTTPError as e:
        return e.code, _json.loads(e.read().decode()), _headers(e)


def _post(url, payload, request_id=None):
    status, body, _response_headers = _post_with_headers(url, payload, request_id)
    return status, body


def _get_with_headers(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return r.status, _json.loads(r.read().decode()), _headers(r)


def _get(url):
    status, body, _response_headers = _get_with_headers(url)
    return status, body


def _write_rag_fixture(root: Path) -> None:
    (root / "index.meta.json").write_text(_json.dumps({
        "signature": "openai_compat:text-embedding-v4:1024",
        "dim": 1024,
        "count": 3000,
    }), encoding="utf-8")
    (root / "exemplars.jsonl").write_text('{"text":"look"}\n', encoding="utf-8")
    (root / "exemplars.vecs").write_bytes(b"vectors")
    files = {
        name: hashlib.sha256((root / name).read_bytes()).hexdigest()
        for name in ("index.meta.json", "exemplars.jsonl", "exemplars.vecs")
    }
    (root / "manifest.json").write_text(_json.dumps({
        "schema_version": 1,
        "signature": "openai_compat:text-embedding-v4:1024",
        "dim": 1024,
        "count": 3000,
        "files": files,
    }), encoding="utf-8")


def test_standardize_request_normalizes_legacy_flat_lay_to_flatlay():
    assert _photo_type("flat_lay") == PhotoType.FLATLAY


def test_server_smoke():
    original_gamma_import = gamma_service.import_garment
    original_gamma_outfit = gamma_service.outfit
    original_gamma_tryon = gamma_service.tryon
    gamma_service.import_garment = lambda payload: {
        "item": {"name": "白T恤", "category": "上装"},
        "standardized": True, "standardized_image_url": "mock://gamma.png",
    }
    gamma_service.outfit = lambda payload: {
        "outfit": {"name": "Gamma", "comment": "ok", "items": []},
        "trace": {"engine": "gamma"},
    }
    gamma_service.tryon = lambda payload: {
        "image_url": "mock://gamma-tryon.png",
        "trace": {"engine": "gamma", "input_image_count": 2},
    }
    health_environment = {
        "RENDER_GIT_COMMIT": "abc123",
        "RENDER_GIT_BRANCH": "main",
        "RENDER_GIT_REPO_SLUG": "fitzw/style-model",
    }
    original_environment = {
        name: os.environ.get(name)
        for name in (*health_environment, "STYLEE_RAG_INDEX_DIR")
    }
    fixture_directory = TemporaryDirectory()
    fixture_root = Path(fixture_directory.name)
    _write_rag_fixture(fixture_root)
    srv = None
    try:
        os.environ.update(health_environment)
        os.environ["STYLEE_RAG_INDEX_DIR"] = str(fixture_root)
        srv = run_server("127.0.0.1", 8765, "mock")
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        base = "http://127.0.0.1:8765"
        st, b, headers = _get_with_headers(base + "/health")
        assert st == 200 and b["status"] == "ok"
        assert headers["cache-control"] == "no-store"
        assert b["contract_version"] == "2026-08-18"
        assert b["git_sha"] == "abc123"
        assert b["git_branch"] == "main"
        assert b["repo_slug"] == "fitzw/style-model"
        assert b["rag"]["artifact_available"] is True
        assert b["rag"]["count"] == 3000

        st, b, headers = _post_with_headers(
            base + "/recognize",
            {"image_url": "data:image/png;base64,AAAA"},
        )
        assert st == 200 and b["category"] in [c for c in ("上装", "下装", "连衣裙", "外套", "鞋", "包", "帽子", "围巾")]
        assert headers["cache-control"] == "no-store"
        assert "needs_review" in b and "photo_type" in b

        import stylee.service.server as server_service
        original_recognize_many = server_service.ai_features.recognize_many
        server_service.ai_features.recognize_many = lambda image_url: {
            "items": [{"photo_type": "web"}, {"photo_type": "flatlay"}],
            "provider": "trace-test-vlm",
        }
        try:
            st, b = _post(base + "/recognize-multi", {"image_url": "data:image/png;base64,AAAA"})
            assert st == 200
            assert b["trace"]["recognized_item_count"] == 2
            assert b["trace"]["recognized_photo_types"] == ["web", "flatlay"]
            assert b["trace"]["vision_max_pixels"] == 1048576
        finally:
            server_service.ai_features.recognize_many = original_recognize_many

        st, b = _post(base + "/standardize",
                      {"image_url": "mock://x", "photo_type": "flatlay", "item": {"category": "上装"}})
        assert st == 200 and b["method"] == "cutout_alpha"
        assert b["image_ref"].startswith("data:image/png;base64,")
        assert b["mime"] == "image/png" and b["background"] == "transparent"
        assert b["verified"] is True and b["alpha_verified"] is True
        assert b["matte_provider"] == "mock-alpha-matte-v1" and b["failure_stage"] is None

        st, b = _post(base + "/standardize",
                      {"image_url": "mock://x", "photo_type": "flat", "item": {"category": "上装"}})
        assert st == 200 and b["method"] == "cutout_alpha"
        assert b["image_ref"].startswith("data:image/png;base64,")
        assert b["mime"] == "image/png" and b["background"] == "transparent"
        assert b["verified"] is True and b["alpha_verified"] is True

        st, b = _post(base + "/recommend", {
            "input_mode": "nl", "query": "周末约会", "n": 2,
            "wardrobe": [
                {"item_id": "t1", "category": "上装", "color": "白色", "material": "棉"},
                {"item_id": "b1", "category": "下装", "color": "黑色", "material": "牛仔"},
                {"item_id": "s1", "category": "鞋", "color": "白色", "material": "皮"},
            ]}, request_id="req-smoke-recommend")
        assert st == 200 and isinstance(b["outfits"], list) and len(b["outfits"]) >= 1
        assert b["trace"]["request_id"] == "req-smoke-recommend"
        assert b["trace"]["stage_ms"]["B0.parse_intent"] >= 0
        assert b["trace"]["stage_ms"]["B3.generate_outfits"] >= 0
        assert b["trace"]["first_pass_valid"] >= 0
        assert b["trace"]["retry_candidate_count"] >= 0
        assert b["trace"]["fallback_type"] in {"none", "deterministic", "failed"}
        assert isinstance(b["trace"]["layout_items_emitted"], int)
        assert isinstance(b["trace"]["layout_contract_build_error_count"], int)
        for outfit in b["outfits"]:
            assert {"name", "owned_item_ids", "recommended_items", "comment"} <= set(outfit)
            if "layout_items" in outfit:
                validate_live_outfit("daily", outfit)
                assert len(outfit["layout_items"]) == (
                    len(outfit["owned_item_ids"]) + len(outfit["recommended_items"])
                )
                assert all(
                    item["source"] in {"owned", "recommended"}
                    and isinstance(item["layout_role"], str)
                    for item in outfit["layout_items"]
                )

        original_recommend = server_service.recommend
        server_service.recommend = lambda *args, **kwargs: (_ for _ in ()).throw(
            TimeoutError("provider deadline exceeded"))
        try:
            st, b = _post(base + "/recommend", {
                "input_mode": "nl", "query": "周末约会", "n": 2, "wardrobe": [],
            }, request_id="req-smoke-timeout")
            assert st == 504
            assert b["request_id"] == "req-smoke-timeout"
            assert b["stage"] == "recommend_pipeline"
            assert b["error_type"] == "TimeoutError"
        finally:
            server_service.recommend = original_recommend

        original_build_vision_provider = server_service.build_vision_provider

        class TimeoutVisionProvider:
            name = "timeout-vlm"

            def recognize(self, image_url):
                raise ProviderTimeoutError("upstream recognition timed out")

            def verify(self, image_url, expected):
                return {"drift": False, "reason": ""}

        server_service.build_vision_provider = lambda timeout: TimeoutVisionProvider()
        try:
            st, b = _post(
                base + "/recognize",
                {"image_url": "data:image/png;base64,AAAA"},
                request_id="req-recognize-timeout",
            )
            assert st == 504
            assert b["request_id"] == "req-recognize-timeout"
            assert b["stage"] == "A1.vision_recognize"
            assert b["error_type"] == "ProviderTimeoutError"
            assert "category" not in b
        finally:
            server_service.build_vision_provider = original_build_vision_provider

        class EmptyVisionProvider:
            name = "empty-vlm"

            def recognize(self, image_url):
                return {}

            def verify(self, image_url, expected):
                return {"drift": False, "reason": ""}

        server_service.build_vision_provider = lambda timeout: EmptyVisionProvider()
        try:
            st, b = _post(
                base + "/recognize",
                {"image_url": "data:image/png;base64,AAAA"},
                request_id="req-recognize-empty",
            )
            assert st == 502
            assert b["request_id"] == "req-recognize-empty"
            assert b["stage"] == "A1.vision_recognize"
            assert b["error_type"] == "VisionError"
            assert "category" not in b
        finally:
            server_service.build_vision_provider = original_build_vision_provider

        st, b = _post(base + "/gamma/import", {"image_url": "mock://x"})
        assert st == 200 and b["standardized"] is True

        st, b = _post(base + "/gamma/outfit", {"instruction": "海岛度假"})
        assert st == 200 and b["trace"]["engine"] == "gamma"

        st, b = _post(base + "/gamma/tryon", {
            "image_url": "mock://person", "items": [{"name": "白T恤", "category": "上装"}],
        })
        assert st == 200 and b["trace"]["engine"] == "gamma"

        st, b = _post(base + "/nope", {})
        assert st == 404
    finally:
        if srv is not None:
            srv.shutdown()
        fixture_directory.cleanup()
        for name, value in original_environment.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        gamma_service.import_garment = original_gamma_import
        gamma_service.outfit = original_gamma_outfit
        gamma_service.tryon = original_gamma_tryon


def main():
    test_label_and_category()
    test_wardrobe_item()
    test_to_request_context_nl()
    test_to_request_context_tags()
    test_outfits_to_app()
    test_ingest_to_app()
    test_std_to_app()
    test_normalize_multi_item_contract()
    test_live_checker_rejects_duplicate_owned_and_recommended_keys()
    test_live_checker_rejects_missing_or_opposite_source_keys()
    test_standardize_request_normalizes_legacy_flat_lay_to_flatlay()
    test_server_smoke()
    print("ok")


if __name__ == "__main__":
    main()
