#!/usr/bin/env python3
"""离线测 _chat_completion 的 HTTP 载荷护栏 + 用量埋点接线(无需 key/真网络)。

    python3 test_provider_http.py

证明:①每次调用都带 max_tokens 上限(防推理模型无上限烧钱),LLM_MAX_TOKENS=0 可关;
②payload 用的是传入的 model;③deepseek() 默认 B0/B3 都是 flash(不再默认烧 Pro);
④埋点已接线:成功/失败都会调用 usage_log.log_usage(不影响主流程)。
"""
from __future__ import annotations

# 先把监控库指到死地址:埋点线程 POST 会被拒,绝不污染真实监控库。
import os
os.environ["STYLEE_SUPABASE_URL"] = "http://127.0.0.1:9"

import json
import io
import urllib.request
from contextlib import redirect_stdout

import stylee.providers.openai_compat as oc
from stylee.providers import ProviderError, ProviderTimeoutError, deepseek


def _check(cond: bool, msg: str) -> None:
    assert cond, f"FAIL: {msg}"
    print(f"  ✓ {msg}")


class _FakeResp:
    def __init__(self, body: dict):
        self._b = json.dumps(body).encode("utf-8")

    def read(self) -> bytes:
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _patched_urlopen(capture: dict, resp_body: dict):
    # 只截 chat/completions 的载荷;埋点的监控 POST 用同一 urlopen,回个空壳不参与断言。
    def fake(req, timeout=0):
        if "chat/completions" in req.full_url:
            capture["payload"] = json.loads(req.data.decode("utf-8"))
            return _FakeResp(resp_body)
        return _FakeResp({})
    return fake


def main() -> None:
    ok_body = {"id": "req-1",
               "choices": [{"message": {"content": '{"outfits":[]}'}}],
               "usage": {"prompt_tokens": 10, "completion_tokens": 5}}
    orig = urllib.request.urlopen
    orig_log_usage = oc.log_usage
    try:
        print("[1] max_tokens 护栏默认封顶")
        cap: dict = {}
        urllib.request.urlopen = _patched_urlopen(cap, ok_body)
        out = oc._chat_completion("https://api.deepseek.com/v1", "k", "deepseek-v4-flash",
                                  [{"role": "user", "content": "hi"}], 0.7, 30, True)
        _check(out == '{"outfits":[]}', "返回 content 正确")
        _check(cap["payload"].get("max_tokens") == 2048, "payload 默认带 max_tokens=2048")
        _check(cap["payload"]["model"] == "deepseek-v4-flash", "payload 用传入的 model")
        _check(cap["payload"].get("thinking") == {"type": "disabled"},
               "DeepSeek 结构化请求默认关闭思考模式")

        print("\n[2] LLM_MAX_TOKENS=0 可关闭封顶")
        os.environ["LLM_MAX_TOKENS"] = "0"
        cap2: dict = {}
        urllib.request.urlopen = _patched_urlopen(cap2, ok_body)
        oc._chat_completion("https://api.deepseek.com/v1", "k", "deepseek-v4-flash",
                            [{"role": "user", "content": "hi"}], 0.7, 30, True)
        _check("max_tokens" not in cap2["payload"], "置 0 时不下发 max_tokens")
        del os.environ["LLM_MAX_TOKENS"]

        print("\n[3] deepseek() 成本默认:B0/B3 都是 flash")
        p = deepseek(api_key="sk-test")
        _check(p.model_intent == "deepseek-v4-flash", "model_intent 默认 flash")
        _check(p.model_gen == "deepseek-v4-flash", "model_gen 默认 flash(不再默认烧 Pro)")

        print("\n[4] 埋点已接线:HTTP 错误也记一笔(不抛埋点异常)")
        def boom(req, timeout=0):
            raise urllib.error.URLError("refused")
        urllib.request.urlopen = boom
        try:
            oc._chat_completion("https://api.deepseek.com/v1", "k", "deepseek-v4-flash",
                                [{"role": "user", "content": "hi"}], 0.7, 30, True)
            _check(False, "应抛 ProviderError")
        except ProviderError:
            _check(True, "网络失败抛 ProviderError(埋点已在其间调用,未额外报错)")

        print("\n[5] socket 超时被分类并记录失败埋点")
        usage_calls = []
        oc.log_usage = lambda *args, **kwargs: usage_calls.append((args, kwargs))
        urllib.request.urlopen = lambda req, timeout=0: (_ for _ in ()).throw(
            TimeoutError("socket timed out"))
        try:
            oc._chat_completion("https://api.deepseek.com/v1", "k", "deepseek-v4-flash",
                                [{"role": "user", "content": "hi"}], 0.7, 12, True)
            _check(False, "应抛 ProviderTimeoutError")
        except ProviderTimeoutError:
            _check(True, "超时抛 ProviderTimeoutError")
        _check(len(usage_calls) == 1, "超时写入一次失败埋点")

        print("\n[6] 上游响应只记录安全元数据")
        truncated_body = {
            "id": "req-truncated",
            "choices": [{
                "finish_reason": "length",
                "message": {"content": "", "reasoning_content": "internal reasoning"},
            }],
            "usage": {"prompt_tokens": 2571, "completion_tokens": 2048, "total_tokens": 4619},
        }
        urllib.request.urlopen = _patched_urlopen({}, truncated_body)
        output = io.StringIO()
        with redirect_stdout(output):
            oc._chat_completion(
                "https://api.deepseek.com/v1", "k", "deepseek-v4-flash",
                [{"role": "user", "content": "hi"}], 0.7, 30, True,
            )
        metadata_lines = [
            json.loads(line) for line in output.getvalue().splitlines()
            if line.startswith("{") and '"event":"stylee_upstream_response"' in line
        ]
        _check(len(metadata_lines) == 1, "每次响应输出一条上游元数据")
        metadata = metadata_lines[0]
        _check(metadata["finish_reason"] == "length", "记录 finish_reason")
        _check(metadata["content_chars"] == 0, "记录空正文长度")
        _check(metadata["reasoning_chars"] == 18, "只记录推理长度，不记录推理内容")
        _check(metadata["completion_tokens"] == 2048, "记录 completion token")
    finally:
        urllib.request.urlopen = orig
        oc.log_usage = orig_log_usage

    print("\n全部通过 ✅")


if __name__ == "__main__":
    main()
