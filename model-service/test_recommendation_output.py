"""Offline regression: real HTTP payload/parser/pipeline, synthetic provider replies only."""
from __future__ import annotations

import io
import json
import os
import unittest
import urllib.error
from contextlib import redirect_stdout
from unittest.mock import patch

import stylee.providers.openai_compat as oc
from stylee.constraints import validate_outfit_result
from stylee.contracts import Category, InputMode, RequestContext, WardrobeItem, Weather
from stylee.outfit_policy import ConstraintPolicy
from stylee.pipeline import recommend
from stylee.providers.mock import MockProvider
from stylee.service.adapter import outfits_to_app
from test_outfit_pipeline import FixedRetriever


INTENT = '{"occasions":["休闲"],"formality":"休闲","vibe":"日常"}'
GOOD = json.dumps({"outfits": [{"items": [
    {"role": "torso", "id": "top", "layer_role": "base"},
    {"role": "bottom", "id": "bottom"},
    {"role": "feet", "gap": {"category": "鞋", "desc": "简洁运动鞋", "reason": "补齐鞋履"}},
], "occasion": "休闲", "reasoning": "合成推荐"}]})


def reply(content, finish="stop"):
    return {"id": "synthetic-response", "choices": [{"finish_reason": finish,
        "message": {"role": "assistant", "content": content}}],
        "usage": {"prompt_tokens": 120, "completion_tokens": 2048, "total_tokens": 2168}}


class Response:
    def __init__(self, body): self.body = body
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self): return json.dumps(self.body).encode()


class RecommendationOutputTest(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {}, clear=True).start()
        self.usage = []
        patch.object(oc, "log_usage", side_effect=lambda *a, **k: self.usage.append((a, k))).start()
        self.replies = []
        self.requests = []

        def transport(request, timeout):
            self.requests.append(json.loads(request.data))
            if not self.replies:
                raise AssertionError("unexpected extra provider call")
            response = self.replies.pop(0)
            if isinstance(response, BaseException): raise response
            return Response(response)

        patch.object(oc.urllib.request, "urlopen", side_effect=transport).start()
        self.provider = oc.deepseek(api_key="synthetic-test-key")
        self.ctx = RequestContext(input_mode=InputMode.NL, query_text="男性日常随性出街", n=3, weather=Weather(22, "晴"), wardrobe=[
            WardrobeItem("top", Category.TOP, "白色T恤", ["白色"]),
            WardrobeItem("bottom", Category.BOTTOM, "黑色长裤", ["黑色"]),
        ])

    def run_pipeline(self):
        with redirect_stdout(io.StringIO()):
            return recommend(self.ctx, self.provider, FixedRetriever())

    def test_b3_has_bounded_budget_independent_of_existing_global_cap(self):
        # Catches accidentally retaining the deployed 2048 cap on six/four-outfit JSON.
        os.environ["LLM_MAX_TOKENS"] = "2048"
        self.replies = [reply(INTENT), reply(GOOD, "length"), reply(GOOD)]
        result = self.run_pipeline()
        self.assertEqual([r["max_tokens"] for r in self.requests], [2048, 6144, 6144])
        self.assertEqual(len(result.outfits), 1)

    def test_b3_budget_and_recovery_do_not_depend_on_prompt_wording(self):
        original = oc.build_gen_messages
        def renamed(*args, **kwargs):
            messages = original(*args, **kwargs)
            messages[0]["content"] = "Renamed synthetic outfit generation system prompt"
            return messages
        self.replies = [reply(INTENT), reply(GOOD, "length"), reply(GOOD)]
        with patch.object(oc, "build_gen_messages", side_effect=renamed):
            result = self.run_pipeline()
        self.assertEqual([r["max_tokens"] for r in self.requests], [2048, 6144, 6144])
        self.assertEqual(result.trace["generation_output_errors"], {"output_truncated": 1})

    def test_truncation_retries_even_if_returned_prefix_is_valid_json(self):
        # A length-stopped response is not silently accepted as a complete recommendation.
        self.replies = [reply(INTENT), reply(GOOD, "length"), reply(GOOD)]
        result = self.run_pipeline()
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(result.trace["generation_output_errors"], {"output_truncated": 1})
        self.assertEqual(result.trace["fallback_type"], "none")
        self.assertEqual(len(result.outfits), 1)
        self.assertEqual(len(self.usage), 3)
        self.assertEqual(self.usage[1][0][4]["completion_tokens"], 2048)

    def test_two_broken_json_outputs_use_existing_safe_fallback_once(self):
        # Catches JSONDecodeError escaping as HTTP 502 or adding a third B3 call.
        self.replies = [reply(INTENT), reply('{"outfits":[BROKEN_PRIVATE_TEXT'), reply('{"outfits":[')]
        result = self.run_pipeline()
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(result.trace["generation_output_errors"], {"output_invalid_json": 2})
        self.assertEqual(result.trace["fallback_type"], "deterministic")
        self.assertEqual(len(result.outfits), 1)
        idx = {item.id: item for item in self.ctx.wardrobe}
        self.assertTrue(validate_outfit_result(result.outfits[0], self.ctx,
            MockProvider().parse_intent(self.ctx), idx, policy=ConstraintPolicy.absolute_only()).valid)
        self.assertNotIn("BROKEN_PRIVATE_TEXT", json.dumps(result.trace))
        self.assertNotIn("BROKEN_PRIVATE_TEXT", json.dumps(self.requests[2]))
        self.assertEqual(json.loads(self.requests[2]["messages"][1]["content"])["上轮稳定违规错误码"],
                         ["output_invalid_json"])
        app_response = outfits_to_app(result, self.ctx)
        self.assertEqual(app_response["trace"].get("generation_output_errors"), {"output_invalid_json": 2})
        self.assertEqual(app_response["trace"]["fallback_type"], "deterministic")
        self.assertNotIn("BROKEN_PRIVATE_TEXT", json.dumps(app_response))

    def test_valid_small_result_skips_retry_and_legacy_provider_still_works(self):
        self.replies = [reply(INTENT), reply(GOOD)]
        result = self.run_pipeline()
        self.assertEqual(len(self.requests), 2)
        self.assertFalse(result.trace["retry_triggered"])
        self.assertEqual(len(result.outfits), 1)
        self.assertTrue(recommend(self.ctx, MockProvider(), FixedRetriever()).outfits)

    def test_http_timeout_and_programming_errors_do_not_become_fallback(self):
        for error in (oc.ProviderError("unauthorized"), oc.ProviderTimeoutError("timed out"), RuntimeError("bug")):
            with self.subTest(error=type(error).__name__):
                self.requests.clear()
                self.replies = [reply(INTENT), error]
                with self.assertRaises(type(error)):
                    self.run_pipeline()
                self.assertEqual(len(self.requests), 2)

    def test_retry_timeout_propagates_without_a_third_generation(self):
        self.replies = [reply(INTENT), reply(GOOD, "length"), oc.ProviderTimeoutError("timed out")]
        with self.assertRaises(oc.ProviderTimeoutError): self.run_pipeline()
        self.assertEqual(len(self.requests), 3)

    def test_two_truncated_outputs_are_not_salvaged_and_still_charge_real_usage(self):
        self.replies = [reply(INTENT), reply(GOOD, "length"), reply('{"outfits":[', "length")]
        result = self.run_pipeline()
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(result.trace["generation_output_errors"], {"output_truncated": 2})
        self.assertEqual(result.trace["fallback_type"], "deterministic")
        self.assertEqual(len(result.outfits), 1)
        self.assertEqual([entry[0][4]["completion_tokens"] for entry in self.usage], [2048, 2048, 2048])

    def test_b0_and_vision_keep_global_budget_despite_recommendation_override(self):
        os.environ["LLM_MAX_TOKENS"] = "1024"
        os.environ["LLM_RECOMMEND_MAX_TOKENS"] = "8192"
        self.ctx.query_text = "你是资深个人穿搭师，男性日常出街"
        self.replies = [reply(INTENT), reply(GOOD), reply('{"items":[]}')]
        self.run_pipeline()
        with redirect_stdout(io.StringIO()):
            oc._chat_completion("https://vision.example.test/v1", "synthetic", "vision-model",
                [{"role": "user", "content": [{"type": "text", "text": "identify clothes"}]}],
                0.0, 10, True)
        self.assertEqual([request["max_tokens"] for request in self.requests], [1024, 8192, 1024])

    def test_intent_invalid_json_does_not_trigger_b3_retry(self):
        self.replies = [reply("broken intent")]
        with self.assertRaises(json.JSONDecodeError): self.run_pipeline()
        self.assertEqual(len(self.requests), 1)

    def test_b3_budget_override_is_bounded_and_never_unlimited(self):
        for raw, expected in (("4096", 4096), ("8192", 8192)):
            with self.subTest(value=raw):
                self.requests.clear()
                os.environ["LLM_RECOMMEND_MAX_TOKENS"] = raw
                os.environ["LLM_MAX_TOKENS"] = "0"
                self.replies = [reply(INTENT), reply(GOOD)]
                self.run_pipeline()
                self.assertNotIn("max_tokens", self.requests[0])
                self.assertEqual(self.requests[1]["max_tokens"], expected)
        for raw in ("0", "-1", "8193", "bad"):
            with self.subTest(value=raw):
                self.requests.clear()
                os.environ["LLM_RECOMMEND_MAX_TOKENS"] = raw
                self.replies = [reply(INTENT), reply(GOOD)]
                with self.assertRaises(ValueError): self.run_pipeline()
                self.assertEqual(len(self.requests), 1)


if __name__ == "__main__":
    unittest.main()
