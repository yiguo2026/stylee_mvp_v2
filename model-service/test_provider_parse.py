#!/usr/bin/env python3
"""离线测试真模型 provider 的 prompt 构造 + JSON 解析(无需 key/网络)。

    python3 test_provider_parse.py

证明:模型一旦按约定 schema 返回 JSON,我们能正确解析回 dataclass 并走完整 pipeline;
且 B4 能挡掉"引用不存在 id"的幻觉。有 key 时把假响应换成真调用即可。
"""
from __future__ import annotations

from stylee import recommend
from stylee.constraints import build_candidate_pool, validate_outfit
from stylee.contracts import Formality, InputMode, Slot
from stylee.pipeline import _item_index, _signature
from stylee.providers import ProviderError, deepseek, qwen
from stylee.providers.openai_compat import (
    OpenAICompatProvider,
    build_gen_messages,
    build_intent_messages,
    parse_intent_json,
    parse_outfits_json,
)
from stylee.sampledata import scenarios
from stylee.scoring import score_outfit


def _check(cond: bool, msg: str) -> None:
    assert cond, f"FAIL: {msg}"
    print(f"  ✓ {msg}")


class _FakeProvider(OpenAICompatProvider):
    """绕过网络:用预置 JSON 顶替模型响应,复用真 provider 的解析路径。"""
    def __init__(self, intent_json: dict, gen_json: dict):
        self.base_url, self.model, self.api_key, self.name = "x", "fake", "x", "fake"
        self.t_intent = self.t_gen = 0.0
        self.timeout, self.json_mode = 5, True
        self._intent, self._gen = intent_json, gen_json

    def parse_intent(self, ctx):
        return parse_intent_json(self._intent)

    def generate_outfits(self, ctx, scene, pool, exemplars, k):
        return parse_outfits_json(self._gen)


def main() -> None:
    name, ctx = scenarios()[0]  # 场景 A:约会晚间 22°C
    print(f"[1] Prompt 构造 — {name}")
    intent_msgs = build_intent_messages(ctx)
    _check(len(intent_msgs) == 2 and intent_msgs[0]["role"] == "system", "意图 prompt = system+user")
    _check("formality" in intent_msgs[0]["content"], "意图 prompt 含输出 schema")

    # 解析意图
    scene = parse_intent_json({"occasions": ["约会"], "formality": "半正式",
                               "style_keywords": ["法式"], "hard_avoids": [], "vibe": "外滩约会"})
    _check(scene.formality == Formality.SMART_CASUAL and "约会" in scene.occasions,
           "意图 JSON → SceneSpec 正确")

    # B1 候选池 + 生成 prompt
    pool = build_candidate_pool(ctx, scene)
    gen_msgs = build_gen_messages(ctx, scene, pool, [{"recipe": "针织+半裙+单鞋"}], k=3)
    torso_id = pool.get(Slot.TORSO)[0].id
    _check(torso_id in gen_msgs[1]["content"], "生成 prompt 含候选池真实 id")
    _check("绝不编造" in gen_msgs[0]["content"], "生成 prompt 强调不许编造 id")

    print("\n[2] 响应解析 → Outfit,并走 B4 校验 + 打分")
    bottom_id = pool.get(Slot.BOTTOM)[0].id
    feet_id = pool.get(Slot.FEET)[0].id
    good = {"outfits": [{"items": [
        {"role": "torso", "id": torso_id},
        {"role": "bottom", "id": bottom_id},
        {"role": "feet", "id": feet_id},
    ], "style_tags": ["法式"], "occasion": "约会", "reasoning": "测试"}]}
    outfits = parse_outfits_json(good)
    _check(len(outfits) == 1 and outfits[0].owned_refs() == [torso_id, bottom_id, feet_id],
           "合法 JSON → Outfit(引用真实 id)")
    idx = _item_index(ctx.wardrobe)
    _check(validate_outfit(outfits[0], ctx, scene, idx) == [], "合法套通过 B4 校验")
    sc = score_outfit(outfits[0], ctx, scene, idx)
    _check(0 <= sc.body_fit <= 1 and 0 <= sc.color_harmony <= 1, "四维打分在 [0,1]")

    print("\n[3] 幻觉防护 — 引用不存在 id 被 B4 拒")
    bad = {"outfits": [{"items": [
        {"role": "torso", "id": "ZZZ_不存在"},
        {"role": "bottom", "id": bottom_id},
        {"role": "feet", "id": feet_id},
    ]}]}
    bad_outfit = parse_outfits_json(bad)[0]
    errs = validate_outfit(bad_outfit, ctx, scene, idx)
    _check(any("不存在" in e for e in errs), f"幻觉 id 被拒:{errs[0]}")

    print("\n[4] 缺口建议解析")
    gap = {"outfits": [{"items": [
        {"role": "torso", "id": torso_id},
        {"role": "bottom", "id": bottom_id},
        {"role": "feet", "gap": {"category": "鞋", "desc": "小白鞋", "reason": "缺鞋"}},
    ]}]}
    go = parse_outfits_json(gap)[0]
    _check(go.has_gap() and go.items[-1].suggest.desc == "小白鞋", "gap JSON → GapSuggestion")

    # gap 的 role 不能由模型任意填写；两个下装即使其中一个伪装成 accessory，
    # 也必须按 category 归为 bottom 并被硬校验拒绝。
    duplicated_bottom = {"outfits": [{"items": [
        {"role": "torso", "gap": {"category": "上装", "desc": "白色T恤", "reason": "清爽"}},
        {"role": "bottom", "gap": {"category": "下装", "desc": "牛仔短裤", "reason": "轻便"}},
        {"role": "accessory", "gap": {"category": "下装", "desc": "另一条短裤", "reason": "错误重复"}},
        {"role": "feet", "gap": {"category": "鞋", "desc": "帆布鞋", "reason": "舒适"}},
    ]}]}
    dup_outfit = parse_outfits_json(duplicated_bottom)[0]
    dup_errors = validate_outfit(dup_outfit, ctx, scene, idx)
    _check(any("下身(BOTTOM)应恰好 1 件,实为 2" in e for e in dup_errors),
           "重复下装即使 role 伪装成 accessory 也被 B4 拒绝")

    another_gap = parse_outfits_json({"outfits": [{"items": [
        {"role": "torso", "gap": {"category": "上装", "desc": "亚麻衬衫", "reason": "透气"}},
        {"role": "bottom", "gap": {"category": "下装", "desc": "白色短裤", "reason": "轻便"}},
        {"role": "feet", "gap": {"category": "鞋", "desc": "凉鞋", "reason": "海边"}},
    ]}]} )[0]
    _check(_signature(go) != _signature(another_gap),
           "不同的全推荐方案拥有不同签名，不会被空 owned id 折叠")

    print("\n[5] FakeProvider 走完整 pipeline(复用真 provider 解析路径)")
    fake = _FakeProvider(
        intent_json={"occasions": ["约会"], "formality": "半正式",
                     "style_keywords": ["法式"], "vibe": "外滩约会"},
        gen_json=good,
    )
    res = recommend(ctx, fake)
    _check(res.trace["rejected_illegal"] == 0 and len(res.outfits) >= 1,
           f"端到端出 {len(res.outfits)} 套,非法 {res.trace['rejected_illegal']}")

    print("\n[6] 便捷构造 / 缺 key 行为")
    try:
        deepseek(api_key="")
        _check(False, "应抛 ProviderError")
    except ProviderError:
        _check(True, "无 key 时 deepseek() 抛 ProviderError")
    p = deepseek(api_key="sk-test", model="deepseek-chat")
    _check("api.deepseek.com" in p.base_url and p.name == "deepseek", "deepseek() base_url/model 正确")
    q = qwen(api_key="sk-test")
    _check("dashscope" in q.base_url, "qwen() 指向 dashscope 兼容端点")

    print("\n全部通过 ✅  (有 key 后 `python3 run_demo.py deepseek` 即真跑)")


if __name__ == "__main__":
    main()
