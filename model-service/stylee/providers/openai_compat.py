"""OpenAI-Compatible 真模型 provider —— DeepSeek / Qwen / 任意兼容端点共用一份代码。

只在 B0(parse_intent)和 B3(generate_outfits)打模型。换模型只改 base_url + model + key。
纯 stdlib(urllib,自动走环境代理);不引第三方 SDK,保持"python3 直接跑"。

prompt 构造与 JSON 解析被拆成独立纯函数,可离线用假响应测试(见 test_provider_parse.py),
所以没 key 也能验证"集成的解析链路"是对的;有 key 时直接真跑。
"""
from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.request

from ..usage_log import detect_feature, log_usage
from ..constraints import CandidatePool
from ..contracts import (
    CATEGORY_SLOT,
    Category,
    Formality,
    GapSuggestion,
    LayerRole,
    Outfit,
    OutfitItemRef,
    RequestContext,
    SceneSpec,
    Slot,
)
from ..outfit_policy import allowed_styles_for_scene, build_constraint_policy
from .base import LLMProvider


# ---------------------------------------------------------------------------
# HTTP(stdlib urllib;urlopen 默认读 HTTP(S)_PROXY 环境变量 → 自动走代理)
# ---------------------------------------------------------------------------
class ProviderError(RuntimeError):
    pass


class ProviderTimeoutError(ProviderError):
    pass


def _chat_completion(base_url: str, api_key: str, model: str, messages: list[dict],
                     temperature: float, timeout: int, json_mode: bool) -> str:
    url = base_url.rstrip("/") + "/chat/completions"
    provider = "deepseek" if "deepseek" in url else "qwen"
    payload: dict = {"model": model, "messages": messages, "temperature": temperature}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if provider == "deepseek":
        thinking = os.environ.get("DEEPSEEK_THINKING", "disabled").strip().lower()
        payload["thinking"] = {"type": thinking if thinking in {"enabled", "disabled"} else "disabled"}
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
        if isinstance(e.reason, (TimeoutError, socket.timeout)):
            raise ProviderTimeoutError(f"上游模型调用超时({timeout}s): {url}") from None
        raise ProviderError(f"网络错误 {url}: {e.reason}") from None
    except (TimeoutError, socket.timeout):
        log_usage(provider, model, feature, call_type, None, int((time.time() - t0) * 1000), False)
        raise ProviderTimeoutError(f"上游模型调用超时({timeout}s): {url}") from None
    try:
        choice = body["choices"][0]
        message = choice["message"]
        content = message["content"]
    except (KeyError, IndexError):
        log_usage(provider, model, feature, call_type, body.get("usage"), int((time.time() - t0) * 1000), False, body.get("id"))
        raise ProviderError(f"返回结构异常: {str(body)[:300]}") from None
    usage = body.get("usage") or {}
    print(json.dumps({
        "event": "stylee_upstream_response",
        "provider": provider,
        "feature": feature,
        "model": model,
        "response_id": body.get("id"),
        "finish_reason": choice.get("finish_reason"),
        "content_chars": len(content or ""),
        "reasoning_chars": len(message.get("reasoning_content") or ""),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
    }, ensure_ascii=False, separators=(",", ":")), flush=True)
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
    '{"role":"torso|bottom|outer|feet|accessory",'
    '"layer_role":"base|mid|outer|null","id":"候选池里的真实id"},'
    '{"role":"torso|bottom|outer|feet|accessory","layer_role":"base|mid|outer|null",'
    '"gap":{"category":"上装|下装|连衣裙|外套|鞋|包|帽子|围巾|配饰",'
    '"desc":"补买建议","reason":"理由"}}'
    '],"primary_style":"主风格","secondary_style":"辅风格或空",'
    '"style_tags":[],"occasion":"","reasoning":"一句话理由"}]}'
)


def build_gen_messages(ctx: RequestContext, scene: SceneSpec, pool: CandidatePool,
                       exemplars: list[dict], k: int,
                       violations: list[str] | None = None) -> list[dict]:
    prof = ctx.user_profile
    policy = build_constraint_policy(ctx, scene)
    retry_codes = [
        code for code in (violations or [])
        if isinstance(code, str) and code.startswith(("H_", "D_")) and len(code) <= 64
    ]
    retry_header = (
        f"上轮候选全部未通过代码校验。这是定向重生成，重新生成 {k} 套。\n"
        if retry_codes else ""
    )
    layer_rule = (
        "普通推荐上身最多 2 层；上装用 base|mid，外套用 outer；"
        if policy.enforces("D_UPPER_LAYER_MAX_TWO")
        else "用户明确要求三层；只允许完整且兼容的 base+mid+outer；"
    )
    accessory_rule = (
        "配饰默认最多 2 件且可以为 0 件；不要为了凑数量添加配饰；"
        if policy.enforces("D_ACCESSORY_COUNT_MAX_TWO")
        else "用户明确要求丰富配饰；仍需满足单类绝对数量限制；"
    )
    sys = (
        retry_header
        + "你是资深个人穿搭师。从给定『候选池』里按 id 选用户真实拥有的单品,组成整套搭配。\n"
        "硬规则(必须遵守):\n"
        "1) 已有单品只能引用候选池里出现过的真实 id,同一 id 不重复,绝不编造;\n"
        "2) 全身必须完整覆盖:至少 1 件上装+恰好 1 件下装,或恰好 1 件连衣裙;连衣裙不与上装/下装混穿;\n"
        "3) 上身叠穿最多 3 层;上装用 layer_role=base|mid,外套用 outer;外套至多 1 件;\n"
        "4) 鞋恰好 1 双;包至多 1 个;帽至多 1 顶;\n"
        "5) 某个必需槽位没有合适已有单品时必须用 gap;gap 与已有单品同样参与数量、分层和覆盖约束;\n"
        "默认规则(用户明确要求冲突时，以用户要求为准):\n"
        f"{layer_rule}\n"
        f"{accessory_rule}\n"
        "6) 彩色家族至多 3 种、中性色家族至多 2 种;彩色单品至多 3 件;荧光色单品至多 1 件;\n"
        "7) 单品正式度跨度至多 1 级;主风格属于场景风格池;同套不混用互斥风格;冷天应有外套;\n"
        "生成要求:\n"
        "8) 参考『审美范例』的搭配套路,并兼顾:身材修饰 > 场景适配 > 风格塑造 > 色彩适配;\n"
        "9) 尽量满足:仅 1 个视觉焦点、松紧平衡、腰线清晰、材质不超过 3 种且质感统一、配色 7:2:1、长短有层次;\n"
        "10) gap.desc 只写简短单品名(如‘白色帆布鞋’),最多 12 个汉字,"
        "不要写‘建议购买/选择一件/适合某场景的’等句子。\n"
        f"输出严格 JSON,出 {k} 套且彼此尽量多样。schema:" + _GEN_SCHEMA
    )
    allowed_styles = allowed_styles_for_scene(scene)
    usr = json.dumps({
        "场景规格": {"occasions": scene.occasions, "formality": scene.formality.value,
                   "style_keywords": scene.style_keywords, "vibe": scene.vibe},
        "当前场景可用风格池": sorted(allowed_styles) if allowed_styles is not None else [],
        "用户明确覆盖的默认规则": sorted(policy.overridden_rules),
        "上轮稳定违规错误码": retry_codes,
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


def _as_layer(s: str | None) -> LayerRole | None:
    for layer in LayerRole:
        if layer.value == s:
            return layer
    return None


def parse_outfits_json(data: dict) -> list[Outfit]:
    """把模型 JSON 解析成 Outfit 列表。id 真伪/槽位合法性交给 B4 校验,这里只做结构转换。"""
    outfits: list[Outfit] = []
    for o in data.get("outfits") or []:
        items: list[OutfitItemRef] = []
        for it in o.get("items") or []:
            role = _as_slot(it.get("role", "accessory"))
            layer_role = _as_layer(it.get("layer_role"))
            if it.get("gap"):
                g = it["gap"]
                category = _as_category(g.get("category", "上装"))
                items.append(OutfitItemRef(
                    # gap 槽位由固定品类映射决定；忽略模型可能自相矛盾的 role。
                    role=CATEGORY_SLOT[category], owned=False,
                    suggest=GapSuggestion(category,
                                          g.get("desc", ""), g.get("reason", "")),
                    layer_role=layer_role,
                ))
            elif it.get("id"):
                items.append(OutfitItemRef(
                    role=role, ref=str(it["id"]), owned=True, layer_role=layer_role,
                ))
        if items:
            outfits.append(Outfit(
                items=items,
                style_tags=list(o.get("style_tags") or [])[:3],
                primary_style=o.get("primary_style", "") or "",
                secondary_style=o.get("secondary_style", "") or "",
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

    def regenerate_outfits(self, ctx, scene, pool, exemplars, k, violations) -> list[Outfit]:
        data = self._call(
            build_gen_messages(ctx, scene, pool, exemplars, k, violations=violations),
            self.t_gen,
            self.model_gen,
        )
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
