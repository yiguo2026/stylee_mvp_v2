"""model-service 侧 AI 用量埋点：与 App 客户端写同一张 Supabase 表 ai_usage_logs。
纯 stdlib，后台线程 fire-and-forget，埋点失败绝不影响推理主流程。
覆盖 B0/B3/识别/回验(_chat_completion) + 图像标准化(standardize)，eval_harness 自动被记。

启用：设环境变量
  STYLEE_SUPABASE_URL   = https://xxx.supabase.co
  STYLEE_SUPABASE_KEY   = anon key(配 RLS insert 策略) 或 service key
  STYLEE_DEV_TAG        = 你的名字/环境(区分是谁跑的，默认 server)
未设 URL/KEY 时只在本地打印，不 POST。
"""
from __future__ import annotations

import getpass
import json
import os
import socket
import threading
import urllib.request
import urllib.error


def _auto_dev_tag() -> str:
    """自动身份：优先 STYLEE_DEV_TAG；否则用 机器名/用户名（跑服务/eval 的人无感被识别）。"""
    explicit = os.environ.get("STYLEE_DEV_TAG")
    if explicit:
        return explicit
    try:
        return f"{socket.gethostname()}/{getpass.getuser()}"
    except Exception:  # noqa: BLE001
        return "server"


_DEV_TAG = _auto_dev_tag()

# 定价（元/百万tokens；图像 元/张）。DeepSeek 官方实价；Qwen 待填。
_PRICING = {
    "deepseek-v4-flash": {"in_hit": 0.02, "in_miss": 1.0, "out": 2.0},
    "deepseek-v4-pro": {"in_hit": 0.025, "in_miss": 3.0, "out": 6.0},
    "qwen-flash": {"in_hit": 0.0, "in_miss": 0.0, "out": 0.0},   # TODO 填实价
    "qwen-plus": {"in_hit": 0.0, "in_miss": 0.0, "out": 0.0},    # TODO
    "qwen3-vl-plus": {"in_hit": 0.0, "in_miss": 0.0, "out": 0.0},  # TODO
    "qwen-image-edit": {"per_image": 0.0},                        # TODO
    "qwen-image-2.0": {"per_image": 0.0},                         # TODO
    "text-embedding-v4": {"in_miss": 0.0, "out": 0.0},           # TODO 填 embedding 实价
}

_SIGNATURES = [
    ("你是穿搭意图解析器", "recommend-intent"),   # B0
    ("你是资深个人穿搭师", "recommend-gen"),       # B3
    ("你是服装属性识别器", "recognize"),           # 触点A 识别
    ("回验", "verify"),
]


def detect_feature(messages_or_text) -> str:
    """从 system prompt 内容识别功能；未知记 other:<签名>，不漏。"""
    text = ""
    if isinstance(messages_or_text, str):
        text = messages_or_text
    elif isinstance(messages_or_text, list):
        for m in messages_or_text:
            c = m.get("content")
            if isinstance(c, str):
                text += c + " "
            elif isinstance(c, list):
                for blk in c:
                    if isinstance(blk, dict) and isinstance(blk.get("text"), str):
                        text += blk["text"] + " "
    for sig, name in _SIGNATURES:
        if sig in text:
            return name
    return "other:" + text.strip()[:24].replace("\n", " ")


def _cost(model: str, usage: dict) -> float:
    p = _PRICING.get(model)
    if not p:
        return 0.0
    c = 0.0
    if p.get("per_image") and usage.get("image_count"):
        c += p["per_image"] * usage["image_count"]
    prompt = usage.get("prompt_tokens") or 0
    hit = usage.get("prompt_cache_hit_tokens") or (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
    miss = max(0, prompt - hit)
    comp = usage.get("completion_tokens") or 0
    if p.get("in_hit"):
        c += hit * p["in_hit"] / 1e6
    if p.get("in_miss"):
        c += miss * p["in_miss"] / 1e6
    if p.get("out"):
        c += comp * p["out"] / 1e6
    return c


# 用量监控专用库（与 App 主后端解耦）。默认指向模型方自己的 Supabase，env 可覆盖。
# publishable key 公开安全（RLS 仅允许写/读 ai_usage_logs）。
_MON_URL = os.environ.get("STYLEE_SUPABASE_URL") or "https://nseysksfnfcaioixifbx.supabase.co"
_MON_KEY = os.environ.get("STYLEE_SUPABASE_KEY") or "sb_publishable_fBm4EGpa4a1GJL4T2LWKQQ_ISXyIS_Z"


def _post(row: dict) -> None:
    url, key = _MON_URL, _MON_KEY
    if not url or not key:
        return
    try:
        req = urllib.request.Request(
            url.rstrip("/") + "/rest/v1/ai_usage_logs",
            data=json.dumps(row).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "apikey": key,
                     "Authorization": f"Bearer {key}", "Prefer": "return=minimal"})
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:  # noqa: BLE001 — 埋点绝不影响主流程
        print(f"[usage] post failed: {e}")


def log_usage(provider: str, model: str, feature: str, call_type: str,
              usage: dict | None, duration_ms: int, ok: bool,
              request_id: str | None = None) -> None:
    try:
        usage = usage or {}
        cost = _cost(model, usage)
        prompt = usage.get("prompt_tokens")
        comp = usage.get("completion_tokens")
        total = (prompt or 0) + (comp or 0)
        row = {
            "provider": provider, "model": model, "feature": feature, "call_type": call_type,
            "dev_tag": _DEV_TAG, "user_id": None,
            "prompt_tokens": prompt,
            "cached_tokens": usage.get("prompt_cache_hit_tokens") or (usage.get("prompt_tokens_details") or {}).get("cached_tokens"),
            "completion_tokens": comp,
            "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens"),
            "total_tokens": total or None, "image_count": usage.get("image_count"),
            "cost_cny": round(cost, 6), "duration_ms": duration_ms, "ok": ok, "request_id": request_id,
        }
        print(f"[usage] {provider}/{model} {feature} tok={total or '-'} "
              f"img={usage.get('image_count','-')} cost=¥{cost:.5f} {duration_ms}ms {'ok' if ok else 'fail'}")
        threading.Thread(target=_post, args=(row,), daemon=True).start()
    except Exception as e:  # noqa: BLE001
        print(f"[usage] log error: {e}")
