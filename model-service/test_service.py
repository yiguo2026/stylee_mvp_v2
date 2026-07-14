from stylee.service.adapter import (
    label, model_category, app_category, wardrobe_item, to_request_context,
    compact_recommended_name, outfits_to_app, ingest_to_app, std_to_app
)
from stylee.service.ai_features import normalize_multi_item
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
    res = RecommendationResult(outfits=[o], trace={"rag_mode": "vector", "candidate_pool_size": 16})
    ctx = RequestContext(input_mode=InputMode.NL, wardrobe=[])
    app = outfits_to_app(res, ctx)
    assert app["outfits"][0]["owned_item_ids"] == ["i1"]
    assert app["outfits"][0]["recommended_items"][0]["category"] == "鞋履"
    assert app["outfits"][0]["comment"] == "上紧下松"
    assert app["trace"]["rag_mode"] == "vector" and app["trace"]["pool"] == 16


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
    assert std_to_app(StandardizedImage(image_ref="http://o/x.png", method="img2img", verified=True)) == {
        "image_ref": "http://o/x.png", "method": "img2img", "verified": True}


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


import json as _json
import threading
import urllib.error
import urllib.request
from stylee.service.server import run_server
from stylee.service import gamma as gamma_service


def _post(url, payload):
    req = urllib.request.Request(url, data=_json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, _json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, _json.loads(e.read().decode())


def _get(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return r.status, _json.loads(r.read().decode())


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
    srv = run_server("127.0.0.1", 8765, "mock")
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        base = "http://127.0.0.1:8765"
        st, b = _get(base + "/health")
        assert st == 200 and b["status"] == "ok"

        st, b = _post(base + "/recognize", {"image_url": "data:image/png;base64,AAAA"})
        assert st == 200 and b["category"] in [c for c in ("上装", "下装", "连衣裙", "外套", "鞋", "包", "帽子", "围巾")]
        assert "needs_review" in b and "photo_type" in b

        st, b = _post(base + "/standardize",
                      {"image_url": "mock://x", "photo_type": "flatlay", "item": {"category": "上装"}})
        assert st == 200 and b["method"] == "cutout"

        st, b = _post(base + "/standardize",
                      {"image_url": "mock://x", "photo_type": "flat", "item": {"category": "上装"}})
        assert st == 200 and b["method"] == "cutout"

        st, b = _post(base + "/recommend", {
            "input_mode": "nl", "query": "周末约会", "n": 2,
            "wardrobe": [
                {"item_id": "t1", "category": "上装", "color": "白色", "material": "棉"},
                {"item_id": "b1", "category": "下装", "color": "黑色", "material": "牛仔"},
                {"item_id": "s1", "category": "鞋", "color": "白色", "material": "皮"},
            ]})
        assert st == 200 and isinstance(b["outfits"], list) and len(b["outfits"]) >= 1

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
        srv.shutdown()
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
    test_server_smoke()
    print("ok")


if __name__ == "__main__":
    main()
