"""OpenAI-Compatible 真模型 provider —— DeepSeek / Qwen / 任意兼容端点共用一份代码。

只在 B0(parse_intent)和 B3(generate_outfits)打模型。换模型只改 base_url + model + key。
纯 stdlib(urllib,自动走环境代理);不引第三方 SDK,保持"python3 直接跑"。

prompt 构造与 JSON 解析被拆成独立纯函数,可离线用假响应测试(见 test_provider_parse.py),
所以没 key 也能验证"集成的解析链路"是对的;有 key 时直接真跑。
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

from ..usage_log import detect_feature, log_usage
from ..constraints import CandidatePool
from ..contracts import (
    Category,
    Formality,
    GapSuggestion,
    Outfit,
    OutfitItemRef,
    RequestContext,
    SceneSpec,
    Slot,
)
from .base import LLMProvider


# ---------------------------------------------------------------------------
# HTTP(stdlib urllib;urlopen 默认读 HTTP(S)_PROXY 环境变量 → 自动走代理)
# ---------------------------------------------------------------------------
class ProviderError(RuntimeError):
    pass


def _chat_completion(base_url: str, api_key: str, model: str, messages: list[dict],
                     temperature: float, timeout: int, json_mode: bool) -> str:
    url = base_url.rstrip("/") + "/chat/completions"
    payload: dict = {"model": model, "messages": messages, "temperature": temperature}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    # 成本护栏：所有文本/视觉 chat 输出 token 封顶。可用 LLM_MAX_TOKENS 调整，0=不封顶。
    max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "2048"))
    if max_tokens > 0:
        payload["max_tokens"] = max_tokens
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {api_key}"},
    )
    # 用量埋点上下文
    provider = "deepseek" if "deepseek" in url else "qwen"
    feature = detect_feature(messages)
    call_type = "vision" if any(isinstance(m.get("content"), list) for m in messages) else "chat"
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log_usage(provider, model, feature, call_type, None, int((time.time() - t0) * 1000), False)
        detail = e.read().decode("utf-8", "replace")[:400]
        raise ProviderError(f"HTTP {e.code} from {url}: {detail}") from None
    except urllib.error.URLError as e:
        log_usage(provider, model, feature, call_type, None, int((time.time() - t0) * 1000), False)
        raise ProviderError(f"网络错误 {url}: {e.reason}") from None
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        log_usage(provider, model, feature, call_type, body.get("usage"), int((time.time() - t0) * 1000), False, body.get("id"))
        raise ProviderError(f"返回结构异常: {str(body)[:300]}") from None
    log_usage(provider, model, feature, call_type, body.get("usage"), int((time.time() - t0) * 1000), True, body.get("id"))
    return content


def _extract_json(content: str) -> dict:
    """容错解析:剥掉 ```json 代码围栏,取第一个 {...} 块。"""
    s = content.strip()
    if s.startswith("```"):
        s = s.split("```", 2)[1]
        if s.startswith("json"):
            s = s[4:]
        s = s.strip().rstrip("`").strip()
    start, end = s.find("{"), s.rfind("}")
    if start != -1 and end != -1:
        s = s[start:end + 1]
    return json.loads(s)


# ---------------------------------------------------------------------------
# Prompt 构造(纯函数,可单测)
# ---------------------------------------------------------------------------
_INTENT_SCHEMA = (
    '{"occasions":[],"formality":"休闲|半正式|正式",'
    '"style_keywords":[],"hard_avoids":[],"vibe":""}'
)


def build_intent_messages(ctx: RequestContext) -> list[dict]:
    if ctx.query_text:
        ask = f"用户自然语言需求:「{ctx.query_text}」"
    else:
        ft = ctx.filter_tags
        ask = f"用户选的标签:场合={ft.occasion} 风格={ft.style} 色系={ft.color}"
    prof = ctx.user_profile
    sys = ("你是穿搭意图解析器。把用户的穿搭需求解析成结构化场景规格。"
           "只输出 JSON,schema:" + _INTENT_SCHEMA +
           "。formality 三选一;occasions/style_keywords 用中文关键词;vibe 一句话氛围。")
    usr = (f"{ask}\n天气:{ctx.weather.temp_c}°C {ctx.weather.condition} "
           f"{ctx.weather.time_of_day}\n用户风格偏好:{prof.style_prefs}")
    return [{"role": "system", "content": sys}, {"role": "user", "content": usr}]


def _pool_table(pool: CandidatePool) -> dict:
    table: dict[str, list[dict]] = {}
    for slot, items in pool.by_slot.items():
        table[slot.value] = [{
            "id": it.id, "品类": it.category.value, "子类": it.subcategory,
            "颜色": it.colors, "材质": it.material,
            "袖长": it.sleeve.value if it.sleeve else None,
            "版型": it.fit.value if it.fit else None,
            "风格": it.style_tags, "保暖档": it.warmth,
        } for it in items]
    return table


_GEN_SCHEMA = (
    '{"outfits":[{"items":['
    '{"role":"torso|bottom|outer|feet|accessory","id":"候选池里的真实id"},'
    '{"role":"feet","gap":{"category":"鞋","desc":"补买建议","reason":"理由"}}'
    '],"style_tags":[],"occasion":"","reasoning":"一句话理由"}]}'
)


def build_gen_messages(ctx: RequestContext, scene: SceneSpec, pool: CandidatePool,
                       exemplars: list[dict], k: int) -> list[dict]:
    prof = ctx.user_profile
    sys = (
        "你是资深个人穿搭师。从给定『候选池』里按 id 选用户真实拥有的单品,组成整套搭配。\n"
        "硬规则(必须遵守):\n"
        "1) 只能引用候选池里出现过的 id,绝不编造不存在的单品;\n"
        "2) 上身恰好 1 件(上装 或 连衣裙);若选连衣裙则不要下装,否则下装恰好 1 件;\n"
        "3) 鞋恰好 1 双;外套至多 1 件(冷天/需外套时要有);配饰可选;\n"
        "4) 某个必需槽位候选池为空时,用 gap 给出补买建议(不要硬塞不合适的);\n"
        "5) 参考给的『审美范例』的搭配套路,但只用用户自己的衣物;\n"
        "6) 兼顾:身材修饰 > 场景适配 > 风格塑造 > 色彩适配。\n"
        f"输出严格 JSON,出 {k} 套且彼此尽量多样。schema:" + _GEN_SCHEMA
    )
    usr = json.dumps({
        "场景规格": {"occasions": scene.occasions, "formality": scene.formality.value,
                   "style_keywords": scene.style_keywords, "vibe": scene.vibe},
        "天气": {"温度": ctx.weather.temp_c, "状况": ctx.weather.condition,
               "时段": ctx.weather.time_of_day},
        "用户": {"体型": prof.body_shape.value if prof.body_shape else None,
               "肤色": prof.skin_tone, "性别": prof.gender},
        "候选池(按槽位)": _pool_table(pool),
        "凑不齐的必需槽位": [s.value for s in pool.gap_slots],
        "审美范例": exemplars,
        "要几套": k,
    }, ensure_ascii=False)
    return [{"role": "system", "content": sys}, {"role": "user", "content": usr}]


# ---------------------------------------------------------------------------
# 响应解析(纯函数,可单测)
# ---------------------------------------------------------------------------
def _as_formality(s: str) -> Formality:
    for f in Formality:
        if f.value == s:
            return f
    return Formality.CASUAL


def parse_intent_json(data: dict) -> SceneSpec:
    return SceneSpec(
        occasions=list(data.get("occasions") or []),
        formality=_as_formality(data.get("formality", "休闲")),
        style_keywords=list(data.get("style_keywords") or []),
        hard_avoids=list(data.get("hard_avoids") or []),
        vibe=data.get("vibe", "") or "",
    )


def _as_slot(s: str) -> Slot:
    for sl in Slot:
        if sl.value == s:
            return sl
    return Slot.ACCESSORY


def _as_category(s: str) -> Category:
    for c in Category:
        if c.value == s:
            return c
    return Category.TOP


def parse_outfits_json(data: dict) -> list[Outfit]:
    """把模型 JSON 解析成 Outfit 列表。id 真伪/槽位合法性交给 B4 校验,这里只做结构转换。"""
    outfits: list[Outfit] = []
    for o in data.get("outfits") or []:
        items: list[OutfitItemRef] = []
        for it in o.get("items") or []:
            role = _as_slot(it.get("role", "accessory"))
            if it.get("gap"):
                g = it["gap"]
                items.append(OutfitItemRef(
                    role=role, owned=False,
                    suggest=GapSuggestion(_as_category(g.get("category", "上装")),
                                          g.get("desc", ""), g.get("reason", "")),
                ))
            elif it.get("id"):
                items.append(OutfitItemRef(role=role, ref=str(it["id"]), owned=True))
        if items:
            outfits.append(Outfit(
                items=items,
                style_tags=list(o.get("style_tags") or [])[:3],
                occasion=o.get("occasion", "") or "",
                reasoning=o.get("reasoning", "") or "",
            ))
    return outfits


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------
class OpenAICompatProvider(LLMProvider):
    def __init__(self, base_url: str, model: str, api_key: str, name: str = "",
                 model_intent: str | None = None, model_gen: str | None = None,
                 temperature_intent: float = 0.2, temperature_gen: float = 0.7,
                 timeout: int = 60, json_mode: bool = True):
        if not api_key:
            raise ProviderError(f"{name or model}: 缺少 api_key(设置对应环境变量)")
        self.base_url = base_url
        self.model = model
        # 两档路由:B0 意图用便宜模型(Flash),B3 生成用强模型(Pro)。默认都回退到 model。
        self.model_intent = model_intent or model
        self.model_gen = model_gen or model
        self.api_key = api_key
        self.name = name or model
        self.t_intent = temperature_intent
        self.t_gen = temperature_gen
        self.timeout = timeout
        self.json_mode = json_mode

    def _call(self, messages: list[dict], temperature: float, model: str) -> dict:
        content = _chat_completion(self.base_url, self.api_key, model, messages,
                                   temperature, self.timeout, self.json_mode)
        return _extract_json(content)

    def parse_intent(self, ctx: RequestContext) -> SceneSpec:
        # 标签路径其实不需要模型,但真 provider 也支持;成本敏感可在 pipeline 外做 code 短路
        data = self._call(build_intent_messages(ctx), self.t_intent, self.model_intent)
        return parse_intent_json(data)

    def generate_outfits(self, ctx, scene, pool, exemplars, k) -> list[Outfit]:
        data = self._call(build_gen_messages(ctx, scene, pool, exemplars, k),
                          self.t_gen, self.model_gen)
        return parse_outfits_json(data)


# ---------------------------------------------------------------------------
# 便捷构造:读环境变量(model 名可被 env 覆盖,以适配你账号实际开放的型号)
# ---------------------------------------------------------------------------
def deepseek(model: str | None = None, api_key: str | None = None) -> OpenAICompatProvider:
    # 默认 B0/B3 都用 Flash，避免无意烧 Pro；质量评测需要时显式设置 DEEPSEEK_MODEL_GEN。
    override = model or os.environ.get("DEEPSEEK_MODEL")
    return OpenAICompatProvider(
        base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        model=override or "deepseek-v4-flash",
        model_intent=os.environ.get("DEEPSEEK_MODEL_INTENT", override or "deepseek-v4-flash"),
        model_gen=os.environ.get("DEEPSEEK_MODEL_GEN", override or "deepseek-v4-flash"),
        api_key=api_key or os.environ.get("DEEPSEEK_API_KEY", ""),
        name="deepseek",
    )


def qwen(model: str | None = None, api_key: str | None = None) -> OpenAICompatProvider:
    # 注:Qwen 在本架构里主职是触点 A 的视觉(Qwen3-VL/image);此处是"用 Qwen 文本模型
    # 当触点 B 主脑"的可选项(如 DeepSeek 暂不可用时顶替),用文本模型而非 VL。
    override = model or os.environ.get("QWEN_MODEL")
    return OpenAICompatProvider(
        base_url=os.environ.get(
            "DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        model=override or "qwen-plus",
        model_intent=os.environ.get("QWEN_MODEL_INTENT", override or "qwen-flash"),
        model_gen=os.environ.get("QWEN_MODEL_GEN", override or "qwen-plus"),
        api_key=api_key or os.environ.get("DASHSCOPE_API_KEY")
        or os.environ.get("QWEN_API_KEY", ""),
        name="qwen",
    )
