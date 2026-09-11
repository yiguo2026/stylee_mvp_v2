"""Offline applicability checks; unknown sleeve is not an invented garment fact."""
import json
import unittest
from unittest.mock import patch

from stylee.service import ai_features
from stylee.service.gamma import normalize_tryon_items

GOOD = dict(has_text_or_watermark=False, garment_match=True, detail_match=True,
            sleeve_match=True, sleeveless_not_straps=True, reason="")


class SleeveTests(unittest.TestCase):
    def verify(self, items, answer):
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": "synthetic-only"}), \
             patch.object(ai_features, "_chat_completion", return_value=json.dumps(answer)) as chat, \
             patch("socket.socket.connect", side_effect=AssertionError("network forbidden")):
            result = ai_features.verify_tryon_output("https://synthetic.invalid/result.png", normalize_tryon_items(items))
        return result, chat.call_args.args[3]

    def test_missing_empty_and_invalid_sleeve_stay_unknown_and_do_not_fail_sleeve_gate(self):
        for value in (None, "", "未知", "中袖"):
            with self.subTest(value=value):
                items = [{"name": "白上衣", "category": "上装", "sleeve_length": value},
                         {"name": "黑长裤", "category": "下装"}]
                self.assertIsNone(normalize_tryon_items(items)[0]["sleeve_length"])
                result, messages = self.verify(items, {**GOOD, "sleeve_match": False, "sleeveless_not_straps": False})
                self.assertTrue(result["ok"])
                expected = json.loads(messages[1]["content"][0]["text"].split(":", 1)[1])
                self.assertFalse(expected[0]["sleeve_check_applicable"])

    def test_known_sleeve_still_fails_mismatch_in_a_mixed_outfit(self):
        items = [{"name": "衬衫", "category": "上装", "sleeve_length": "长袖"},
                 {"name": "裤子", "category": "下装"}]
        result, messages = self.verify(items, {**GOOD, "sleeve_match": False})
        self.assertFalse(result["ok"])
        expected = json.loads(messages[1]["content"][0]["text"].split(":", 1)[1])
        self.assertTrue(expected[0]["sleeve_check_applicable"])
        self.assertFalse(expected[1]["sleeve_check_applicable"])
        self.assertEqual(result["failed_checks"], ["sleeve_match"])

    def test_no_sleeveless_item_does_not_require_the_sleeveless_special_check(self):
        result, _ = self.verify([{"name": "短袖上衣", "sleeve_length": "短袖"}],
                                {**GOOD, "sleeveless_not_straps": False})
        self.assertTrue(result["ok"])

    def test_explicit_sleeveless_cannot_turn_into_straps(self):
        result, _ = self.verify([{"name": "无袖连衣裙", "sleeve_length": "无袖"}],
                                {**GOOD, "sleeveless_not_straps": False})
        self.assertFalse(result["ok"])

    def test_unknown_sleeve_never_bypasses_text_garment_or_detail_checks(self):
        for field, value in (("has_text_or_watermark", True), ("garment_match", False), ("detail_match", False)):
            with self.subTest(field=field):
                result, _ = self.verify([{"name": "上衣"}], {**GOOD, field: value})
                self.assertFalse(result["ok"])
                self.assertEqual(result["failed_checks"], [field])

    def test_applicable_check_must_be_boolean_but_unused_checks_can_be_absent(self):
        answer = {key: value for key, value in GOOD.items() if key not in ("sleeve_match", "sleeveless_not_straps")}
        result, _ = self.verify([{"name": "上衣"}], answer)
        self.assertTrue(result["ok"])
        with self.assertRaises(ai_features.TryOnFailed):
            self.verify([{"name": "上衣", "sleeve_length": "短袖"}], answer)

    def test_terminal_failure_records_fixed_check_names_without_free_text_or_urls(self):
        with patch.dict(ai_features.os.environ, {"DASHSCOPE_API_KEY": "synthetic-only"}), \
             patch.object(ai_features, "_chat_completion", return_value=json.dumps({**GOOD, "garment_match": False,
                 "reason": "private-person https://private.invalid/photo?token=secret"})), \
             patch("socket.socket.connect", side_effect=AssertionError("network forbidden")):
            calls = []
            def generate(*_args):
                calls.append(1)
                return "https://synthetic.invalid/result.png"
            with self.assertRaises(ai_features.TryOnFailed) as raised:
                ai_features.tryon_image({"image_url": "synthetic-person", "items": [{"name": "白上衣"}]}, generate=generate)
        self.assertEqual(len(calls), 2)
        self.assertIn("garment_match", str(raised.exception))
        self.assertNotIn("private-person", str(raised.exception))
        self.assertNotIn("token=", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
