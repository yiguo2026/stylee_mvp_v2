"""GAP1 tests: real recommendation code with only HTTP/RAG side effects replaced."""
from __future__ import annotations

from copy import deepcopy
import io
import json
import unittest
from email.message import Message
from types import SimpleNamespace
from unittest.mock import patch

from stylee.contracts import Category, GapSuggestion, RecommendationResult, SceneSpec, Slot
from stylee.constraints import build_candidate_pool, validate_outfit_result
from stylee.pipeline import _item_index, _validate_and_score
from stylee.outfit_policy import ConstraintPolicy
from stylee.providers.openai_compat import OpenAICompatProvider, build_gen_messages, parse_outfits_json
from stylee.service.adapter import to_request_context, outfits_to_app
from stylee.service.server import Handler
from stylee.service.request_trace import RequestTrace


CANDIDATE = {"candidate_id": "public:1", "name": "黑色长裤", "category": "下装", "color": "黑色"}
PAYLOAD = {"input_mode": "nl", "query": "日常休闲", "n": 1, "weather": {"temp_c": 22}, "wardrobe": [
    {"item_id": "top", "name": "白色T恤", "category": "上装", "color": "白色"},
    {"item_id": "shoes", "name": "白色帆布鞋", "category": "鞋履", "color": "白色"},
]}


def payload(rows=None):
    value = deepcopy(PAYLOAD)
    value["public_candidates"] = deepcopy([CANDIDATE] if rows is None else rows)
    return value


def model_result(candidate_id="public:1", **gap):
    return {"outfits": [{"items": [
        {"role": "torso", "id": "top", "layer_role": "base"},
        {"role": "bottom", "gap": {"category": "下装", "desc": "模型写的长裤", "reason": "补齐下装", "candidate_id": candidate_id, **gap}},
        {"role": "feet", "id": "shoes"},
    ], "occasion": "休闲", "style_tags": [], "reasoning": "测试"}]}


class FixedRetriever:
    mode = "fixed"
    last_mode = "fixed"
    last_fallback = None

    def retrieve(self, scene, k, season):
        return [{"recipe": "test exemplar"}]


class PublicCandidatesTest(unittest.TestCase):
    def test_input_is_independent_immutable_and_does_not_expand_owned_wardrobe(self):
        source = payload()
        ctx = to_request_context(source)
        self.assertEqual([row.id for row in ctx.wardrobe], ["top", "shoes"])
        self.assertEqual(ctx.public_candidates[0].candidate_id, "public:1")
        source["public_candidates"][0]["name"] = "mutated"
        self.assertEqual(ctx.public_candidates[0].name, "黑色长裤")
        with self.assertRaises((AttributeError, TypeError)):
            ctx.public_candidates[0].name = "mutated"

    def test_missing_and_empty_inputs_keep_old_prompts_and_wire_shape(self):
        legacy, empty = to_request_context(PAYLOAD), to_request_context(payload([]))
        scene = SceneSpec()
        self.assertEqual(build_gen_messages(legacy, scene, build_candidate_pool(legacy, scene), [], 2),
                         build_gen_messages(empty, scene, build_candidate_pool(empty, scene), [], 2))
        drafts = parse_outfits_json(model_result())
        result = RecommendationResult(drafts)
        self.assertEqual(outfits_to_app(result, legacy), outfits_to_app(result, empty))
        self.assertNotIn("candidate_id", outfits_to_app(result, legacy)["outfits"][0]["recommended_items"][0])

    def test_invalid_input_is_rejected_before_provider_initialization(self):
        bad = [None, {}, "url", [None], [CANDIDATE, CANDIDATE],
               [{**CANDIDATE, "candidate_id": ""}], [{**CANDIDATE, "candidate_id": "x" * 129}],
               [{**CANDIDATE, "candidate_id": "https://example.test/photo"}],
               [{**CANDIDATE, "candidate_id": "a\n"}], [{**CANDIDATE, "candidate_id": 1}],
               [{**CANDIDATE, "presentation": {"kind": "private_asset"}}],
               [{**CANDIDATE, "url": "https://example.test/photo"}],
               [{**CANDIDATE, "category": "帽子"}], [{**CANDIDATE, "category": "bad"}],
               [{**CANDIDATE, "name": " "}], [{**CANDIDATE, "name": "衣" * 201}],
               [{**CANDIDATE, "color": None}], [{**CANDIDATE, "color": "x" * 201}],
               [{**CANDIDATE, "candidate_id": f"p:{i}"} for i in range(65)]]
        handler = Handler.__new__(Handler)
        with patch("stylee.service.server.build_provider", side_effect=AssertionError("must not initialize provider")):
            for rows in bad:
                with self.subTest(rows=type(rows).__name__):
                    value = payload(); value["public_candidates"] = rows
                    with self.assertRaisesRegex(ValueError, "^invalid_public_candidates$"):
                        handler._recommend(value, RequestTrace("recommend"))

    def test_inclusive_row_id_and_fact_limits(self):
        rows = [{**CANDIDATE, "candidate_id": "a" * 128 if i == 0 else f"p:{i}", "name": "衣" * 200, "color": ""} for i in range(64)]
        ctx = to_request_context(payload(rows))
        self.assertEqual(len(ctx.public_candidates), 64)
        self.assertEqual(ctx.public_candidates[0].candidate_id, "a" * 128)

    def test_color_length_matches_the_edge_utf16_string_limit(self):
        to_request_context(payload([{**CANDIDATE, "color": "🟦" * 100}]))
        with self.assertRaisesRegex(ValueError, "^invalid_public_candidates$"):
            to_request_context(payload([{**CANDIDATE, "color": "🟦" * 101}]))

    def test_http_bad_candidates_have_fixed_400_without_echoing_input(self):
        handler = Handler.__new__(Handler)
        handler.path, handler.require_auth = "/recommend", False
        handler.headers = Message()
        handler.headers["X-Request-ID"] = "gap-offline-test"
        body = json.dumps(payload([{**CANDIDATE, "candidate_id": "https://example.test/private"}])).encode()
        handler.headers["Content-Length"] = str(len(body))
        handler.rfile = io.BytesIO(body)
        handler.connection = SimpleNamespace(gettimeout=lambda: None, settimeout=lambda value: None)
        handler.limiter = SimpleNamespace(allow=lambda subject: True)
        responses = []
        handler._send = lambda status, data, request_id: responses.append((status, data))
        with patch("stylee.service.server.build_provider", side_effect=AssertionError("must not initialize provider")), \
             patch.object(RequestTrace, "emit"), patch.dict("os.environ", {}, clear=True):
            handler.do_POST()
        self.assertEqual(responses, [(400, {"error": "invalid_public_candidates", "request_id": "gap-offline-test"})])

    def test_legacy_result_serialization_omits_absent_identity(self):
        drafts = parse_outfits_json(model_result())
        gap = RecommendationResult(drafts).to_dict()["outfits"][0]["items"][1]["suggest"]
        self.assertEqual(set(gap), {"category", "desc", "reason"})

    def test_retry_provider_keeps_same_candidates_and_bound_gap_facts(self):
        ctx = to_request_context(payload())
        provider = OpenAICompatProvider("https://provider.example.test/v1", "synthetic-model", "synthetic-key")
        scene = SceneSpec()
        bodies = []

        def call(messages, temperature, model, *, outfit_output=False):
            bodies.append(json.loads(messages[1]["content"]))
            return model_result(category="鞋")

        with patch.object(provider, "_call", side_effect=call):
            drafts = provider.regenerate_outfits(ctx, scene, build_candidate_pool(ctx, scene), [], 2, ["H_FEET_EXACTLY_ONE"])
        self.assertEqual(bodies[0]["public_candidates"], [CANDIDATE])
        self.assertEqual(bodies[0]["上轮稳定违规错误码"], ["H_FEET_EXACTLY_ONE"])
        self.assertEqual(drafts[0].items[1].suggest.category, Category.BOTTOM)
        self.assertEqual(drafts[0].items[1].suggest.candidate_id, "public:1")

    def test_prompt_keeps_public_choices_out_of_owned_pool_and_rag(self):
        ctx = to_request_context(payload())
        scene = SceneSpec()
        messages = build_gen_messages(ctx, scene, build_candidate_pool(ctx, scene), [{"recipe": "unchanged"}], 2)
        body = json.loads(messages[1]["content"])
        self.assertEqual(body["public_candidates"], [CANDIDATE])
        self.assertNotIn("public:1", json.dumps(body["候选池(按槽位)"], ensure_ascii=False))
        self.assertEqual(body["审美范例"], [{"recipe": "unchanged"}])
        self.assertIn("candidate_id", messages[0]["content"])

    def test_parser_binds_facts_before_category_and_layout_validation(self):
        ctx = to_request_context(payload())
        drafts = parse_outfits_json(model_result(category="鞋", desc="红色运动鞋"), ctx=ctx)
        gap = drafts[0].items[1]
        self.assertFalse(gap.owned)
        self.assertEqual(gap.role, Slot.BOTTOM)
        self.assertEqual(gap.suggest.category, Category.BOTTOM)
        self.assertEqual(gap.suggest.candidate_id, "public:1")
        self.assertIn("黑色长裤", gap.suggest.desc)
        self.assertTrue(validate_outfit_result(drafts[0], ctx, SceneSpec(), _item_index(ctx.wardrobe)).valid)
        app = outfits_to_app(RecommendationResult(drafts), ctx)["outfits"][0]
        self.assertEqual(app["recommended_items"][0], {**CANDIDATE, "description": "补齐下装"})
        self.assertEqual(app["layout_items"][1], {"source": "recommended", "recommended_index": 0, "layout_role": "bottom"})

    def test_unknown_ids_and_names_cannot_grant_identity(self):
        ctx = to_request_context(payload())
        for candidate_id in (None, "", "public:2", "other:public:1", "https://example.test", 4, {}):
            drafts = parse_outfits_json(model_result(candidate_id, desc="黑色长裤"), ctx=ctx)
            item = outfits_to_app(RecommendationResult(drafts), ctx)["outfits"][0]["recommended_items"][0]
            self.assertNotIn("candidate_id", item)
            self.assertEqual(item["name"], "黑色长裤")
        fake_owned = model_result(); fake_owned["outfits"][0]["items"][1] = {"role": "bottom", "id": "public:1"}
        draft = parse_outfits_json(fake_owned, ctx=ctx)[0]
        self.assertIn("H_OWNED_REF_EXISTS", validate_outfit_result(draft, ctx, SceneSpec(), _item_index(ctx.wardrobe)).error_codes)

    def test_all_app_categories_keep_catalog_facts_and_existing_layout_roles(self):
        for category, name, internal, role in [
            ("上装", "棉质T恤", Category.TOP, "base"),
            ("下装", "长裤", Category.BOTTOM, "bottom"),
            ("连体装", "连衣裙", Category.DRESS, "dress"),
            ("外套", "风衣", Category.OUTERWEAR, "outer"),
            ("鞋履", "帆布鞋", Category.SHOES, "shoes"),
            ("包袋", "托特包", Category.BAG, "bag"),
            ("帽巾", "针织帽", Category.HAT, "hat"),
            ("帽巾", "丝巾", Category.SCARF, "scarf"),
            ("配饰", "项链", Category.ACCESSORY, "accessory"),
        ]:
            with self.subTest(category=category, name=name):
                selected = {**CANDIDATE, "name": name, "category": category, "color": "蓝色"}
                ctx = to_request_context(payload([selected]))
                draft = parse_outfits_json(model_result(category="下装"), ctx=ctx)[0]
                self.assertEqual(draft.items[1].suggest.category, internal)
                app = outfits_to_app(RecommendationResult([draft]), ctx)["outfits"][0]
                self.assertEqual(app["recommended_items"][0], {**selected, "description": "补齐下装"})
                self.assertEqual(app["layout_items"][1]["layout_role"], role)

    def test_pipeline_rebinds_alternate_provider_facts_before_b4(self):
        ctx = to_request_context(payload())
        draft = parse_outfits_json(model_result())[0]
        draft.items[1].suggest = GapSuggestion(Category.SHOES, "错误的鞋", "补齐下装", candidate_id="public:1")
        draft.items[1].role = Slot.FEET
        valid, rejected, count, gaps, clashes = _validate_and_score([draft], ctx, SceneSpec(), _item_index(ctx.wardrobe), ConstraintPolicy.absolute_only())
        self.assertEqual(count, 0)
        self.assertEqual(len(valid), 1)
        self.assertEqual(valid[0].items[1].role, Slot.BOTTOM)
        self.assertEqual(valid[0].items[1].suggest.desc, "黑色长裤")

    def test_captured_category_must_still_pass_body_coverage_checks(self):
        ctx = to_request_context(payload([{**CANDIDATE, "category": "鞋履", "name": "帆布鞋"}]))
        draft = parse_outfits_json(model_result(category="下装"), ctx=ctx)[0]
        checked = validate_outfit_result(draft, ctx, SceneSpec(), _item_index(ctx.wardrobe))
        self.assertFalse(checked.valid)
        self.assertIn("H_FEET_EXACTLY_ONE", checked.error_codes)

    def test_real_handler_provider_http_parser_pipeline_adapter_offline(self):
        handler = Handler.__new__(Handler)
        handler.provider_name = "synthetic"
        provider = OpenAICompatProvider("https://provider.example.test/v1", "synthetic-model", "synthetic-key", name="synthetic")
        calls = []

        def http(request, timeout):
            body = json.loads(request.data)
            calls.append(body)
            content = {"occasions": ["休闲"], "formality": "休闲", "style_keywords": [], "hard_avoids": [], "vibe": "日常"} if len(calls) == 1 else model_result()
            return io.BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps(content)}, "finish_reason": "stop"}]}).encode())

        with patch("stylee.service.server.build_provider", return_value=provider), \
             patch("stylee.service.server.default_retriever", return_value=FixedRetriever()), \
             patch("urllib.request.urlopen", side_effect=http), \
             patch("stylee.providers.openai_compat.log_usage"), \
             patch.dict("os.environ", {}, clear=True):
            result = handler._recommend(payload(), RequestTrace("recommend"))
        self.assertEqual(len(calls), 2)
        generation = json.loads(calls[1]["messages"][1]["content"])
        self.assertEqual(generation["public_candidates"], [CANDIDATE])
        self.assertEqual(result["outfits"][0]["recommended_items"][0], {**CANDIDATE, "description": "补齐下装"})
        self.assertEqual(result["outfits"][0]["owned_item_ids"], ["top", "shoes"])
        self.assertEqual(result["trace"]["fallback_type"], "none")
        self.assertFalse(result["trace"]["retry_triggered"])


if __name__ == "__main__":
    unittest.main()
