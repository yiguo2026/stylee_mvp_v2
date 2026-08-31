# Stylee 穿搭质量、配饰规格与语义布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产推荐默认只返回可靠的一至两层上身和零至两件协调配饰，并通过向后兼容的 `layout_items` 让 App 完整、居中地展示模型返回的二至八件合法结果。

**Architecture:** Canonical `fitzw/style-model` 先用确定性事实、B4 规则和响应适配器建立唯一业务语义，再由 App 的映射层消费可选角色，最后由纯 TypeScript 布局策略把角色放入 `core/head/neck/carry/micro/foot` 区域。现有响应字段、旧 App、旧服务和历史图片继续兼容；模型不返回坐标，App 不重新判断穿搭审美，也不改变模型返回的 n。

**Tech Stack:** Python 3.12 stdlib service、Pillow 12.3.0、当前仓库 Expo `~54.0.0` / React Native 0.81.5、TypeScript 5.8、Node `node:test`、Stylee Design System v3.8、Bash/Git 双仓镜像治理。

**Spec:** `docs/superpowers/specs/2026-08-26-outfit-quality-accessory-layout-design.md`

## Global Constraints

- 修改任何 TS/TSX 前，按 AGENTS.md 完整阅读 `https://docs.expo.dev/versions/v55.0.0/`。本仓库当前仍固定 Expo `~54.0.0`；本任务不升级 Expo，只使用当前 SDK 54 已支持且不与 v55 迁移方向冲突的 `View/Image/Pressable/StyleSheet` 基础 API。若实现确需 v55-only API，停止并单独确认升级范围。
- UI 实施前完整阅读 `docs/STYLEE_DESIGN_SYSTEM_CONTEXT.md`、`design-tokens/README.md` 和 `src/design-system/README.md`；canonical token 仍是 `design-tokens/stylee-v3.8.tokens.json`。
- `fitzw/style-model` 是模型服务唯一可编辑源；本仓库 `model-service/` 只能由已提交且干净的 canonical SHA 生成。
- 当前机器尚无 `/Users/bytedance/Documents/style-model` 克隆。执行时若仍缺失，使用授权的 `gh repo clone fitzw/style-model /Users/bytedance/Documents/style-model` 获取，不得先改 vendored copy。
- 执行时先使用 `superpowers:using-git-worktrees`。Canonical 分支固定为 `codex/outfit-quality-semantic-layout`，工作树固定为 `/private/tmp/style-model-outfit-quality`；App 分支同名，工作树固定为 `/private/tmp/stylee-app-outfit-quality`。
- 主 App 工作树 `/Users/bytedance/Documents/styleetest1` 当前有六个未提交布局文件和未跟踪 `design-qa.md`。不得 reset、checkout、stash、删除或自动提交这些文件；在隔离 App 工作树中依据已确认规格重新实现，并把现有 diff 仅作为已批准间距、鞋尺寸和居中效果的参考。
- 保留 `owned_item_ids`、`recommended_items`、`comment` 的字段名、语义和顺序；`layout_items` 必须是可选增强字段。
- `H_UPPER_LAYER_RANGE` 始终为 `1..3`；普通请求由 `D_UPPER_LAYER_MAX_TWO` 限制为最多两层，只有明确三层请求可覆盖该默认规则。
- 两件普通上装事实不足时整套拒绝，不在 B4 中静默删减；默认配饰为 `0..2`，鞋不计入配饰，不为凑 n 添加配饰。
- App 必须显示模型返回的全部合法 n 件，不随机抽取、不补齐、不删除；`foot` 只允许鞋，取消 `accessory-band`。
- 不新增模型调用、数据库字段、图片批量重处理、设计 token 或一次性颜色/间距常量。
- 不 push、不部署 Render、不修改 `EXPO_PUBLIC_STYLEE_API`，除非用户另行明确批准。

## File and Interface Map

Canonical model-service：

- `stylee/outfit_policy.py` — 单品事实、Query 规则级 override、层间兼容和配饰协调纯函数。
- `stylee/constraints.py` — B4 绝对/默认规则执行和稳定错误码。
- `stylee/contracts.py` — `LayerRole` 的服务端校验/对外布局语义说明，不增加坐标契约。
- `stylee/providers/openai_compat.py` — B3 schema、默认两层/两配饰提示和定向重生成提示。
- `stylee/service/adapter.py` — App 请求事实映射、帽/围巾判别、`layout_items` 一一映射和 trace。
- `stylee/outfit_fallback.py` — 保持最小核心组合，不添加非必要配饰。
- `test_outfit_constraints.py` — 事实、层级、兼容和配饰规则。
- `test_outfit_pipeline.py` — 零合法重试、最小保底和稳定错误码。
- `test_provider_parse.py` — provider prompt/schema/解析回归。
- `test_outfit_adapter.py` — 新建；请求映射和响应 `layout_items` 契约。
- `test_service.py`、`test_request_trace.py` — HTTP 响应兼容和 trace 回归。

App：

- `model-service/`、`model-service/UPSTREAM_COMMIT` — 由 canonical 已提交 SHA 生成。
- `src/types/index.ts` — `OutfitLayoutRole` 以及已有/建议单品的可选角色。
- `src/lib/styleeMapping.ts` — `RecommendLayoutItem` schema、局部降级、请求 `style_tags` 和角色映射。
- `src/lib/styleeMapping.test.ts` — 旧/新/坏响应兼容性。
- `src/app/outfit/result.tsx` — 将映射后的角色传给 `StyleeOutfitCanvas`，不改变集合。
- `src/lib/outfitCanvasLayout.ts` — 纯语义区域布局、碰撞恢复、整体 fit/center 和尺寸政策。
- `src/lib/outfitCanvasLayout.test.ts` — 二至八件、区域独占、间距、中心和尺寸回归。
- `src/design-system/StyleeOutfitCanvas.tsx` — 按 placement 渲染，保留 `contain`、可访问性和点击行为。
- `src/design-system/outfitCanvasComponent.test.ts` — 共享组件契约。
- `scripts/check-outfit-fixture-alpha.py` — 新建；用 Pillow 验证四张透明 fixture 的 alpha 可见边界。
- `src/data/outfitLayoutDemoFixtures.ts` — 新建；固定的、通过响应契约表达的合法结果和明确压力样例。
- `src/app/outfit-layout-demo.tsx`、`src/lib/outfitLayoutDemoRoute.test.ts` — 合法固定响应 fixture 演示和“结构压力测试”证据边界。
- `src/design-system/README.md` — 用语义区域替换旧底部配饰带说明。

---

### Task 1: Canonical 单品事实与 Query override

**Files:**

- Modify: Canonical `stylee/outfit_policy.py`
- Modify: Canonical `test_outfit_constraints.py`

**Interfaces:**

- Produces: `GarmentKind`、`ClosureMode`、`ThicknessBand`。
- Produces: `ItemFacts.garment_kind`、`closure_mode`、`thickness_band`、`seasons`。
- Produces: `layer_pair_compatible(base: ItemFacts, mid: ItemFacts) -> bool`。
- Produces: `ConstraintPolicy.enforces(code)` 对四个新 `D_` 规则生效。
- Consumes later: Task 2 的层级校验、Task 3 的配饰协调、Task 4 的响应角色映射。

- [ ] **Step 1: 建立两个隔离工作树并证明主工作树未被改动**

如果 `/Users/bytedance/Documents/style-model` 不存在，先运行：

```bash
gh repo clone fitzw/style-model /Users/bytedance/Documents/style-model
```

如果目录已存在，先确认主工作树干净并更新 canonical main：

```bash
git -C /Users/bytedance/Documents/style-model status --short
git -C /Users/bytedance/Documents/style-model fetch origin
git -C /Users/bytedance/Documents/style-model pull --ff-only origin main
```

Expected: 更新前 status 为空；`pull --ff-only` 不产生本地合并提交。然后创建声明依赖的隔离 Python 环境：

```bash
python3 -m venv /Users/bytedance/Documents/style-model/.venv
/Users/bytedance/Documents/style-model/.venv/bin/python -m pip install -r /Users/bytedance/Documents/style-model/requirements.txt
```

然后通过 `superpowers:using-git-worktrees` 建立：

```bash
git -C /Users/bytedance/Documents/style-model worktree add -b codex/outfit-quality-semantic-layout /private/tmp/style-model-outfit-quality main
git -C /Users/bytedance/Documents/styleetest1 worktree add -b codex/outfit-quality-semantic-layout /private/tmp/stylee-app-outfit-quality main
```

检查：

```bash
git -C /Users/bytedance/Documents/styleetest1 status --short
git -C /private/tmp/style-model-outfit-quality status --short
git -C /private/tmp/stylee-app-outfit-quality status --short
```

Expected: 主 App 工作树仍显示原有六个修改文件和 `design-qa.md`；两个新工作树均干净。

- [ ] **Step 2: 写失败测试，锁定事实词表和显式 override**

在 canonical `test_outfit_constraints.py` 添加：

```python
from stylee.outfit_policy import (
    ClosureMode,
    GarmentKind,
    ThicknessBand,
    build_item_facts,
    layer_pair_compatible,
)


def test_layer_facts_are_conservative_and_directional() -> None:
    tee = build_item_facts(_item("tee", Category.TOP, "白色T恤"))
    shirt = build_item_facts(_item("shirt", Category.TOP, "白色衬衫"))
    overshirt = build_item_facts(_item("overshirt", Category.TOP, "牛仔衬衫外套"))
    cardigan = build_item_facts(_item("cardigan", Category.TOP, "羊毛开衫"))
    turtleneck = build_item_facts(_item("turtle", Category.TOP, "厚高领毛衣"))

    assert tee.garment_kind is GarmentKind.TEE
    assert shirt.garment_kind is GarmentKind.SHIRT
    assert overshirt.garment_kind is GarmentKind.OVERSHIRT
    assert cardigan.closure_mode is ClosureMode.OPENABLE
    assert turtleneck.thickness_band is ThicknessBand.THICK
    assert layer_pair_compatible(tee, cardigan) is True
    assert layer_pair_compatible(turtleneck, shirt) is False


def test_only_explicit_queries_override_new_default_rules() -> None:
    ordinary_ctx, scene, _ = _context("日常通勤")
    ordinary = build_constraint_policy(ordinary_ctx, scene)
    assert ordinary.enforces("D_UPPER_LAYER_MAX_TWO")
    assert ordinary.enforces("D_ACCESSORY_COUNT_MAX_TWO")

    explicit_ctx, scene, _ = _context("我要三层叠穿和丰富配饰")
    explicit = build_constraint_policy(explicit_ctx, scene)
    assert not explicit.enforces("D_UPPER_LAYER_MAX_TWO")
    assert not explicit.enforces("D_ACCESSORY_COUNT_MAX_TWO")
```

- [ ] **Step 3: 运行测试并确认按预期失败**

Run:

```bash
cd /private/tmp/style-model-outfit-quality
python3 test_outfit_constraints.py
```

Expected: FAIL，缺少 `GarmentKind`、`ClosureMode`、`ThicknessBand` 或新规则 override。

- [ ] **Step 4: 实现最小事实词表和方向性兼容函数**

在 `stylee/outfit_policy.py` 增加并复用以下精确接口：

```python
class GarmentKind(str, Enum):
    TEE = "tee"
    SHIRT = "shirt"
    OVERSHIRT = "overshirt"
    CARDIGAN = "cardigan"
    KNIT_VEST = "knit_vest"
    TURTLENECK = "turtleneck"
    SWEATER = "sweater"
    SWEATSHIRT = "sweatshirt"
    OUTER = "outer"
    DRESS = "dress"
    UNKNOWN = "unknown"


class ClosureMode(str, Enum):
    OPENABLE = "openable"
    CLOSED = "closed"
    UNKNOWN = "unknown"


class ThicknessBand(str, Enum):
    THIN = "thin"
    MEDIUM = "medium"
    THICK = "thick"
    UNKNOWN = "unknown"


def layer_pair_compatible(base: ItemFacts, mid: ItemFacts) -> bool:
    allowed = {
        GarmentKind.TEE: {GarmentKind.CARDIGAN, GarmentKind.KNIT_VEST,
                          GarmentKind.OVERSHIRT, GarmentKind.SWEATER,
                          GarmentKind.SWEATSHIRT},
        GarmentKind.SHIRT: {GarmentKind.CARDIGAN, GarmentKind.KNIT_VEST,
                            GarmentKind.SWEATER},
        GarmentKind.TURTLENECK: {GarmentKind.CARDIGAN, GarmentKind.KNIT_VEST,
                                 GarmentKind.OVERSHIRT},
    }
    if base.garment_kind is GarmentKind.UNKNOWN or mid.garment_kind is GarmentKind.UNKNOWN:
        return False
    if LayerRole.BASE not in base.layer_capabilities or LayerRole.MID not in mid.layer_capabilities:
        return False
    return mid.garment_kind in allowed.get(base.garment_kind, set())
```

按“衬衫外套/overshirt → 开衫 → 背心 → 高领 → T 恤 → 卫衣 → 毛衣 → 普通衬衫”的顺序识别，避免“衬衫外套”先被普通“衬衫”命中。`ItemFacts` 新字段必须带默认值以保持旧调用兼容：

```python
garment_kind: GarmentKind = GarmentKind.UNKNOWN
closure_mode: ClosureMode = ClosureMode.UNKNOWN
thickness_band: ThicknessBand = ThicknessBand.UNKNOWN
seasons: frozenset[Season] = frozenset()
```

识别和层级能力使用以下确定性 helper；名称和材质均为空时保持 `UNKNOWN`，不得调用模型补齐：

```python
def _garment_kind(item: WardrobeItem) -> GarmentKind:
    name = item.subcategory.lower()
    if item.category is Category.OUTERWEAR:
        return GarmentKind.OUTER
    if item.category is Category.DRESS:
        return GarmentKind.DRESS
    if item.category is not Category.TOP:
        return GarmentKind.UNKNOWN
    ordered = (
        (("衬衫外套", "overshirt", "shacket"), GarmentKind.OVERSHIRT),
        (("开衫", "cardigan"), GarmentKind.CARDIGAN),
        (("针织背心", "毛衣背心", "knit vest"), GarmentKind.KNIT_VEST),
        (("高领", "turtleneck"), GarmentKind.TURTLENECK),
        (("t恤", "t-shirt", "tee"), GarmentKind.TEE),
        (("卫衣", "sweatshirt", "hoodie"), GarmentKind.SWEATSHIRT),
        (("毛衣", "针织衫", "sweater"), GarmentKind.SWEATER),
        (("衬衫", "shirt"), GarmentKind.SHIRT),
    )
    for tokens, kind in ordered:
        if any(token in name for token in tokens):
            return kind
    return GarmentKind.UNKNOWN


def _layer_capabilities(category: Category, kind: GarmentKind) -> frozenset[LayerRole]:
    if category is Category.OUTERWEAR:
        return frozenset({LayerRole.OUTER})
    if category is Category.DRESS:
        return frozenset({LayerRole.BASE})
    if category is not Category.TOP:
        return frozenset()
    roles = {LayerRole.BASE}
    if kind in {
        GarmentKind.OVERSHIRT, GarmentKind.CARDIGAN, GarmentKind.KNIT_VEST,
        GarmentKind.SWEATER, GarmentKind.SWEATSHIRT,
    }:
        roles.add(LayerRole.MID)
    return frozenset(roles)


def _closure_mode(kind: GarmentKind) -> ClosureMode:
    if kind in {GarmentKind.OVERSHIRT, GarmentKind.CARDIGAN}:
        return ClosureMode.OPENABLE
    if kind in {
        GarmentKind.TEE, GarmentKind.KNIT_VEST, GarmentKind.TURTLENECK,
        GarmentKind.SWEATER, GarmentKind.SWEATSHIRT,
    }:
        return ClosureMode.CLOSED
    return ClosureMode.UNKNOWN


def _thickness_band(item: WardrobeItem, kind: GarmentKind) -> ThicknessBand:
    text = f"{item.subcategory} {item.material}".lower()
    if any(token in text for token in ("厚", "羊绒", "羊毛", "摇粒绒")) or item.warmth >= 3:
        return ThicknessBand.THICK
    if kind in {GarmentKind.TEE, GarmentKind.SHIRT} or item.warmth == 0:
        return ThicknessBand.THIN
    if kind is not GarmentKind.UNKNOWN:
        return ThicknessBand.MEDIUM
    return ThicknessBand.UNKNOWN
```

`build_item_facts` 在现有颜色、正式度、风格和帽型计算前先执行 `kind = _garment_kind(item)`，返回值中的相关字段固定为：

```python
return ItemFacts(
    layer_capabilities=_layer_capabilities(item.category, kind),
    garment_kind=kind,
    closure_mode=_closure_mode(kind),
    thickness_band=_thickness_band(item, kind),
    seasons=frozenset(item.seasons),
    color_families=frozenset(color_families),
    neutral_families=frozenset(neutral_families),
    fluorescent=fluorescent_fact,
    formality_level=formality,
    styles=styles,
    definite_hat=definite_hat,
)
```

把以下规则加入 `ALL_DEFAULT_RULES`，并在 `build_constraint_policy` 只用明确短语生成 override：

```python
"D_UPPER_LAYER_MAX_TWO",
"D_LAYER_COMPAT",
"D_ACCESSORY_COUNT_MAX_TWO",
"D_ACCESSORY_COHERENCE",
```

明确短语集合固定为：

```python
three_layer_terms = ("三层叠穿", "三层穿搭", "三件叠穿", "多层叠穿")
special_layer_terms = ("衬衫敞开", "敞穿衬衫", "高领配衬衫")
rich_accessory_terms = ("丰富配饰", "多配饰", "配饰叠搭", "多件配饰")
explicit_accessory_terms = ("戴这顶帽", "加围巾", "搭这个包", "用这件配饰")

if any(term in text for term in three_layer_terms):
    overridden.add("D_UPPER_LAYER_MAX_TWO")
if any(term in text for term in special_layer_terms):
    overridden.add("D_LAYER_COMPAT")
if any(term in text for term in rich_accessory_terms):
    overridden.add("D_ACCESSORY_COUNT_MAX_TWO")
if any(term in text for term in explicit_accessory_terms):
    overridden.add("D_ACCESSORY_COHERENCE")
```

- [ ] **Step 5: 运行事实和既有约束测试**

Run:

```bash
python3 test_outfit_constraints.py
python3 test_outfit_pipeline.py
```

Expected: 两个脚本均打印 `ok`；现有颜色、正式度、天气和 fallback 测试不回归。

- [ ] **Step 6: 提交 canonical 事实层**

```bash
git add stylee/outfit_policy.py test_outfit_constraints.py
git commit -m "feat(outfit): derive conservative layering facts"
```

### Task 2: Canonical B4 上身角色和兼容校验

**Files:**

- Modify: Canonical `stylee/constraints.py`
- Modify: Canonical `test_outfit_constraints.py`
- Modify: Canonical `test_outfit_pipeline.py`

**Interfaces:**

- Consumes: Task 1 `ItemFacts` 和 `layer_pair_compatible`。
- Produces: `H_LAYER_ROLE_STRUCTURE`、`D_UPPER_LAYER_MAX_TWO`、`D_LAYER_COMPAT`。
- Produces: `authoritative_item_or_gap(ref, category, item_index) -> WardrobeItem`，供层级和 Task 3 配饰共同使用。
- Preserves: `H_UPPER_LAYER_RANGE = 1..3` 和旧输出单上装/外套缺失 `layer_role` 的可推断兼容。

- [ ] **Step 1: 写失败测试，区分绝对三层上限和默认两层规则**

将旧 `test_three_upper_layers_pass_and_four_fail` 改为：

```python
def test_three_layers_require_explicit_query_and_four_always_fail() -> None:
    three = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.TORSO, "top-2", LayerRole.MID),
        _owned(Slot.OUTER, "outer-1", LayerRole.OUTER),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ], style_tags=["法式慵懒"])
    assert "D_UPPER_LAYER_MAX_TWO" in _codes(three)
    assert "D_UPPER_LAYER_MAX_TWO" not in _codes(three, query="我要三层叠穿")
    assert "H_UPPER_LAYER_RANGE" not in _codes(three, query="我要三层叠穿")

    four = Outfit(items=three.items + [
        _owned(Slot.TORSO, "top-3", LayerRole.MID),
    ])
    assert "H_UPPER_LAYER_RANGE" in _codes(four, query="我要多层叠穿")


def test_layer_role_structure_is_absolute() -> None:
    duplicate_base = Outfit(items=[
        _owned(Slot.TORSO, "top-1", LayerRole.BASE),
        _owned(Slot.TORSO, "top-2", LayerRole.BASE),
        _owned(Slot.BOTTOM, "bottom-1"),
        _owned(Slot.FEET, "shoe-1"),
    ])
    assert "H_LAYER_ROLE_STRUCTURE" in _codes(duplicate_base, query="我要特殊叠穿")


def test_unknown_or_conflicting_second_top_is_rejected() -> None:
    wardrobe = [
        _item("turtle", Category.TOP, "厚高领毛衣"),
        _item("shirt", Category.TOP, "普通白衬衫"),
        _item("bottom", Category.BOTTOM, "黑色长裤"),
        _item("shoe", Category.SHOES, "黑色乐福鞋"),
    ]
    outfit = Outfit(items=[
        _owned(Slot.TORSO, "turtle", LayerRole.BASE),
        _owned(Slot.TORSO, "shirt", LayerRole.MID),
        _owned(Slot.BOTTOM, "bottom"),
        _owned(Slot.FEET, "shoe"),
    ])
    assert "D_LAYER_COMPAT" in _codes(outfit, wardrobe=wardrobe)
    assert "D_LAYER_COMPAT" not in _codes(
        outfit, query="高领配衬衫，衬衫敞开穿", wardrobe=wardrobe,
    )
```

- [ ] **Step 2: 运行测试并确认新规则失败**

Run: `python3 test_outfit_constraints.py`

Expected: FAIL，因为当前 B4 只计算上身件数，不校验角色结构或兼容矩阵。

- [ ] **Step 3: 在 B4 先归一化角色，再执行三层规则**

在 `validate_outfit_result` 的权威品类解析完成后，建立上身引用列表，并按以下顺序校验：

```python
upper = [(ref, category) for ref, category in categories
         if category in {Category.TOP, Category.DRESS, Category.OUTERWEAR}]
top_refs = [ref for ref, category in upper if category is Category.TOP]
effective_roles: list[tuple[OutfitItemRef, Category, LayerRole]] = []
layer_structure_errors: list[str] = []

for ref, category in upper:
    if category is Category.TOP:
        role = ref.layer_role
        if role is None and len(top_refs) == 1:
            role = LayerRole.BASE
        if role not in {LayerRole.BASE, LayerRole.MID}:
            layer_structure_errors.append("上装必须是唯一可判定的 base 或 mid")
            continue
        effective_roles.append((ref, category, role))
    elif category is Category.DRESS:
        if ref.layer_role not in {None, LayerRole.BASE}:
            layer_structure_errors.append("连体装只能承担 base")
            continue
        effective_roles.append((ref, category, LayerRole.BASE))
    else:
        if ref.layer_role not in {None, LayerRole.OUTER}:
            layer_structure_errors.append("外套只能承担 outer")
            continue
        effective_roles.append((ref, category, LayerRole.OUTER))

role_values = [role for _, _, role in effective_roles]
if len(role_values) != len(set(role_values)):
    layer_structure_errors.append("base、mid、outer 每层至多一件")
if LayerRole.MID in role_values and LayerRole.BASE not in role_values:
    layer_structure_errors.append("mid 必须依附 base")
for ref, category in categories:
    if (
        category not in {Category.TOP, Category.DRESS, Category.OUTERWEAR}
        and ref.layer_role is not None
    ):
        layer_structure_errors.append(f"{category.value}不能声明上身层级")
if layer_structure_errors:
    add("H_LAYER_ROLE_STRUCTURE", "；".join(dict.fromkeys(layer_structure_errors)))

upper_layers = len(upper)
if not 1 <= upper_layers <= 3:
    add("H_UPPER_LAYER_RANGE", f"上身叠穿应为 1-3 层,实为 {upper_layers}")

if upper_layers > 2 and policy.enforces("D_UPPER_LAYER_MAX_TWO"):
    add("D_UPPER_LAYER_MAX_TWO", "普通推荐上身最多 2 层")

base_ref = next((ref for ref, category, role in effective_roles
                 if category is Category.TOP and role is LayerRole.BASE), None)
mid_ref = next((ref for ref, category, role in effective_roles
                if category is Category.TOP and role is LayerRole.MID), None)
if base_ref and mid_ref and policy.enforces("D_LAYER_COMPAT"):
    base_top = authoritative_item_or_gap(base_ref, Category.TOP, item_index)
    mid_top = authoritative_item_or_gap(mid_ref, Category.TOP, item_index)
    if not layer_pair_compatible(build_item_facts(base_top), build_item_facts(mid_top)):
        add("D_LAYER_COMPAT", "基础层与中间层缺少可靠叠穿关系")
```

非上身品类若带 `layer_role`，在同一结构循环外追加 `H_LAYER_ROLE_STRUCTURE`。

gap 上装使用 `GapSuggestion.desc/category` 构造仅供事实派生的临时 `WardrobeItem`；不得把模型自报角色当成权威品类。B4 只拒绝整套，不修改 `outfit.items`。在 `constraints.py` 添加以下 helper，并从 `contracts` 导入 `ItemSource`：

```python
def authoritative_item_or_gap(
    ref: OutfitItemRef,
    category: Category,
    item_index: dict[str, WardrobeItem],
) -> WardrobeItem:
    if ref.owned and ref.ref in item_index:
        return item_index[ref.ref]
    description = ref.suggest.desc if ref.suggest else ""
    return WardrobeItem(
        id="",
        category=category,
        subcategory=description,
        source=ItemSource.AI_SUGGEST,
    )
```

- [ ] **Step 4: 更新 pipeline 测试，证明错误码进入一次定向重生成**

在 `wardrobe()` 增加两个测试单品：

```python
WardrobeItem("turtle", Category.TOP, "厚高领毛衣", ["黑色"], seasons=all_seasons),
WardrobeItem("shirt", Category.TOP, "普通白衬衫", ["白色"], seasons=all_seasons),
```

再添加首轮全部触发 `D_LAYER_COMPAT`、第二轮返回基础组合的完整案例：

```python
def invalid_layer_pair() -> Outfit:
    return Outfit(items=[
        OutfitItemRef(Slot.TORSO, "turtle", layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.TORSO, "shirt", layer_role=LayerRole.MID),
        OutfitItemRef(Slot.BOTTOM, "b1"),
        OutfitItemRef(Slot.FEET, "s1"),
    ])


def test_layer_conflict_triggers_one_targeted_retry() -> None:
    provider = SequentialProvider(
        [invalid_layer_pair() for _ in range(6)],
        [valid()],
    )
    result = recommend(context(), provider, retriever=FixedRetriever())

assert provider.retry_calls == 1
assert provider.retry_violations == ["D_LAYER_COMPAT"]
assert result.trace["first_pass_valid"] == 0
assert len(result.outfits) == 1
assert len(result.outfits[0].items) == 3
```

- [ ] **Step 5: 运行规则和 pipeline 测试**

```bash
python3 test_outfit_constraints.py
python3 test_outfit_pipeline.py
```

Expected: PASS，两个脚本打印 `ok`；三层显式请求通过、四层永远失败、冲突候选只进入重生成。

- [ ] **Step 6: 提交 canonical 层级校验**

```bash
git add stylee/constraints.py test_outfit_constraints.py test_outfit_pipeline.py
git commit -m "feat(outfit): validate upper-layer structure"
```

### Task 3: Canonical 配饰数量与协调性

**Files:**

- Modify: Canonical `stylee/outfit_policy.py`
- Modify: Canonical `stylee/constraints.py`
- Modify: Canonical `test_outfit_constraints.py`
- Modify: Canonical `test_outfit_pipeline.py`

**Interfaces:**

- Produces: `accessory_is_coherent(accessory: WardrobeItem, core: list[WardrobeItem], scene: SceneSpec, weather: Weather) -> bool`。
- Produces: `D_ACCESSORY_COUNT_MAX_TWO`、`D_ACCESSORY_COHERENCE`。
- Preserves: `H_BAG_AT_MOST_ONE`、`H_HAT_AT_MOST_ONE`、`H_FEET_EXACTLY_ONE`。

- [ ] **Step 1: 写失败测试，证明配饰可为零且不能靠颜色通过**

在 `test_outfit_constraints.py` 添加：

```python
def test_accessories_are_optional_and_default_to_at_most_two() -> None:
    assert "D_ACCESSORY_COUNT_MAX_TWO" not in _codes(_base_outfit())
    three = _base_outfit()
    three.items.extend([
        _owned(Slot.ACCESSORY, "bag-1"),
        _owned(Slot.ACCESSORY, "hat-1"),
        _owned(Slot.ACCESSORY, "legacy-accessory"),
    ])
    assert "D_ACCESSORY_COUNT_MAX_TWO" in _codes(three)
    assert "D_ACCESSORY_COUNT_MAX_TWO" not in _codes(
        three, query="我要丰富配饰和多配饰叠搭",
    )


def test_baseball_cap_does_not_pass_formal_outfit_by_color_alone() -> None:
    outfit = _base_outfit()
    outfit.items.append(_owned(Slot.ACCESSORY, "hat-1"))
    assert "D_ACCESSORY_COHERENCE" in _codes(outfit)
    assert "D_ACCESSORY_COHERENCE" not in _codes(
        outfit, query="戴这顶帽子，做明确混搭",
    )


def test_cold_weather_scarf_has_a_functional_positive_signal() -> None:
    wardrobe = _wardrobe() + [
        _item("scarf-1", Category.SCARF, "羊绒围巾", "米色", styles=["法式慵懒"]),
    ]
    outfit = _base_outfit()
    outfit.items.append(_owned(Slot.ACCESSORY, "scarf-1"))
    assert "D_ACCESSORY_COHERENCE" not in _codes(
        outfit, temp_c=8.0, wardrobe=wardrobe,
    )
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `python3 test_outfit_constraints.py`

Expected: FAIL，当前没有总体配饰上限和单件协调校验。

- [ ] **Step 3: 实现保守配饰协调函数**

在 `stylee/outfit_policy.py` 中先把棒球帽等休闲帽识别为 L4：

```python
if any(token in name for token in ("棒球帽", "鸭舌帽", "渔夫帽", "beanie", "cap")):
    return 4
```

再实现：

```python
def accessory_is_coherent(
    accessory: WardrobeItem,
    core: list[WardrobeItem],
    scene: SceneSpec,
    weather: Weather,
) -> bool:
    accessory_facts = build_item_facts(accessory)
    core_facts = [build_item_facts(item) for item in core]

    known_styles = frozenset().union(*(facts.styles for facts in core_facts))
    if accessory_facts.styles and has_style_conflict(
        known_styles | accessory_facts.styles
    ):
        return False

    style_match = bool(accessory_facts.styles & known_styles)
    core_levels = [facts.formality_level for facts in core_facts
                   if facts.formality_level is not None]
    formality_match = (
        accessory_facts.formality_level is not None
        and bool(core_levels)
        and min(abs(accessory_facts.formality_level - level) for level in core_levels) <= 1
    )
    functional_match = (
        accessory.category is Category.SCARF
        and weather.temp_c < 18
    )
    seasonal_match = bool(set(accessory.seasons) & {current_season(weather)})
    return style_match or formality_match or functional_match or seasonal_match
```

把无副作用的 `current_season(weather: Weather) -> Season` 从 `constraints.py` 原样移动到 `outfit_policy.py`，`constraints.py` 改为导入它。`accessory_is_coherent` 直接调用该函数；不得同时保留两份季节映射或形成循环导入。

- [ ] **Step 4: 在 B4 校验总体数量和每件配饰**

在权威品类列表上实现：

```python
accessory_categories = {Category.BAG, Category.HAT, Category.SCARF}
accessory_refs = [(ref, category) for ref, category in categories
                  if category in accessory_categories]
core_items = [
    authoritative_item_or_gap(ref, category, item_index)
    for ref, category in categories
    if category not in accessory_categories
]
if len(accessory_refs) > 2 and policy.enforces("D_ACCESSORY_COUNT_MAX_TWO"):
    add("D_ACCESSORY_COUNT_MAX_TWO", "普通推荐配饰最多 2 件")

if policy.enforces("D_ACCESSORY_COHERENCE"):
    for ref, category in accessory_refs:
        accessory = authoritative_item_or_gap(ref, category, item_index)
        if not accessory_is_coherent(accessory, core_items, scene, ctx.weather):
            add("D_ACCESSORY_COHERENCE", f"{category.value}缺少可靠协调依据")
```

上面循环复用 Task 2 的 `authoritative_item_or_gap`；gap 只使用其明确 `category/desc`，不伪造拥有关系。

`core_items` 因上述过滤只包含上身、下身、连体装、外套和鞋；配饰之间不能互相提供“正向依据”。

- [ ] **Step 5: 锁定保底不添加非必要配饰**

在 `test_outfit_pipeline.py` 的 deterministic fallback 测试中把 `Category.SCARF` 加入排除断言：

```python
assert all(
    (not item.owned)
    or _item_index(ctx.wardrobe)[item.ref].category
       not in {Category.BAG, Category.HAT, Category.SCARF}
    for item in fallback.items
)
```

当前 `stylee/outfit_fallback.py` 已只构造上装/连体装、下装、鞋和必要外套。本任务不修改该文件；以上测试把“不添加包、帽、围巾”锁为不变性。

- [ ] **Step 6: 运行规则和 pipeline 测试**

```bash
python3 test_outfit_constraints.py
python3 test_outfit_pipeline.py
```

Expected: PASS；无配饰方案合法，第三件默认被拒，明确丰富配饰可覆盖，正式套装中的棒球帽被拒，冷天协调围巾通过。

- [ ] **Step 7: 提交 canonical 配饰规则**

```bash
git add stylee/outfit_policy.py stylee/constraints.py test_outfit_constraints.py test_outfit_pipeline.py
git commit -m "feat(outfit): constrain accessory coherence"
```

### Task 4: Canonical B3 提示与 `layout_items` 响应契约

**Files:**

- Modify: Canonical `stylee/contracts.py`
- Modify: Canonical `stylee/providers/openai_compat.py`
- Modify: Canonical `stylee/service/adapter.py`
- Create: Canonical `test_outfit_adapter.py`
- Modify: Canonical `test_provider_parse.py`
- Modify: Canonical `test_service.py`
- Modify: Canonical `test_request_trace.py`
- Create: Canonical `fixtures/release-smoke/outfit-quality-requests.json`
- Create: Canonical `scripts/check_outfit_quality_live.py`

**Interfaces:**

- Produces response item: `{source, item_id?, recommended_index?, layout_role}`。
- Produces roles: `base | mid | outer | dress | bottom | shoes | bag | hat | scarf | accessory`。
- Produces trace: `layout_items_emitted`、`layout_contract_build_error_count`。
- Preserves old fields exactly.

- [ ] **Step 1: 写 adapter 失败测试**

创建 `test_outfit_adapter.py`，构造一个已有基础层、下装、鞋和建议围巾的 `RecommendationResult`：

```python
def test_outfits_to_app_emits_complete_layout_mapping() -> None:
    ctx = _context_with_items()
    outfit = Outfit(items=[
        OutfitItemRef(Slot.TORSO, "top", layer_role=LayerRole.BASE),
        OutfitItemRef(Slot.BOTTOM, "bottom"),
        OutfitItemRef(Slot.FEET, "shoes"),
        OutfitItemRef(
            Slot.ACCESSORY,
            owned=False,
            suggest=GapSuggestion(Category.SCARF, "米色围巾", "保暖"),
        ),
    ])
    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)
    value = body["outfits"][0]
    assert value["owned_item_ids"] == ["top", "bottom", "shoes"]
    assert len(value["recommended_items"]) == 1
    assert value["layout_items"] == [
        {"source": "owned", "item_id": "top", "layout_role": "base"},
        {"source": "owned", "item_id": "bottom", "layout_role": "bottom"},
        {"source": "owned", "item_id": "shoes", "layout_role": "shoes"},
        {"source": "recommended", "recommended_index": 0, "layout_role": "scarf"},
    ]
    assert body["trace"]["layout_items_emitted"] == 1
    assert body["trace"]["layout_contract_build_error_count"] == 0
```

该新测试文件使用以下完整 imports 和 helper，不依赖其他测试模块的私有函数：

```python
from stylee.contracts import (
    Category, GapSuggestion, InputMode, LayerRole, Outfit, OutfitItemRef,
    RecommendationResult, RequestContext, Slot, WardrobeItem,
)
from stylee.service.adapter import outfits_to_app


def _context_with_items() -> RequestContext:
    return RequestContext(
        input_mode=InputMode.NL,
        wardrobe=[
            WardrobeItem("top", Category.TOP, "白色T恤"),
            WardrobeItem("bottom", Category.BOTTOM, "黑色长裤"),
            WardrobeItem("shoes", Category.SHOES, "白色乐福鞋"),
        ],
        query_text="日常",
        n=1,
    )
```

再添加以下具体测试：

```python
def test_wardrobe_item_distinguishes_hat_scarf_and_legacy_accessory() -> None:
    hat = wardrobe_item({"item_id": "h", "category": "帽巾", "name": "白色棒球帽"})
    scarf = wardrobe_item({"item_id": "s", "category": "帽巾", "name": "羊绒围巾"})
    legacy = wardrobe_item({"item_id": "a", "category": "配饰", "name": "珍珠耳饰"})
    assert hat.category is Category.HAT
    assert scarf.category is Category.SCARF
    assert legacy.category is Category.HAT
    assert build_item_facts(legacy).definite_hat is None


def test_incomplete_layout_mapping_keeps_old_fields_and_omits_new_field() -> None:
    ctx = _context_with_items()
    outfit = Outfit(items=[
        OutfitItemRef(Slot.TORSO, "top", layer_role=LayerRole.OUTER),
        OutfitItemRef(Slot.BOTTOM, "bottom"),
        OutfitItemRef(Slot.FEET, "shoes"),
    ])
    body = outfits_to_app(RecommendationResult(outfits=[outfit]), ctx)
    value = body["outfits"][0]
    assert value["owned_item_ids"] == ["top", "bottom", "shoes"]
    assert value["recommended_items"] == []
    assert "layout_items" not in value
    assert body["trace"]["layout_items_emitted"] == 0
    assert body["trace"]["layout_contract_build_error_count"] == 1
```

把 `wardrobe_item` 和 `build_item_facts` 加入测试 imports。

- [ ] **Step 2: 添加非私密、可复现的真实 provider 请求 fixture**

创建 `fixtures/release-smoke/outfit-quality-requests.json`：

```json
{
  "base": {
    "input_mode": "nl",
    "n": 3,
    "profile": {"style_prefs": ["通勤职场", "极简"]},
    "weather": {"temp_c": 15, "condition": "晴", "city": "测试城市", "time_of_day": "day"},
    "wardrobe": [
      {"item_id": "tee", "name": "白色T恤", "category": "上装", "color": "白色", "material": "纯棉", "style_tags": ["极简"]},
      {"item_id": "cardigan", "name": "灰色开衫", "category": "上装", "color": "灰色", "material": "羊毛", "style_tags": ["通勤职场"]},
      {"item_id": "turtle", "name": "厚高领毛衣", "category": "上装", "color": "黑色", "material": "羊毛", "style_tags": ["通勤职场"]},
      {"item_id": "shirt", "name": "普通白衬衫", "category": "上装", "color": "白色", "material": "纯棉", "style_tags": ["通勤职场"]},
      {"item_id": "trench", "name": "卡其色风衣", "category": "外套", "color": "卡其", "material": "棉混纺", "style_tags": ["通勤职场"]},
      {"item_id": "bottom", "name": "黑色西装长裤", "category": "下装", "color": "黑色", "material": "毛混纺", "style_tags": ["通勤职场"]},
      {"item_id": "shoes", "name": "白色乐福鞋", "category": "鞋履", "color": "白色", "material": "皮革", "occasion_tags": ["通勤"]},
      {"item_id": "bag", "name": "黑色托特包", "category": "包袋", "color": "黑色", "material": "皮革", "style_tags": ["通勤职场"]},
      {"item_id": "hat", "name": "白色棒球帽", "category": "帽巾", "color": "白色", "material": "纯棉", "style_tags": ["街头潮流"]},
      {"item_id": "scarf", "name": "米色羊绒围巾", "category": "帽巾", "color": "米色", "material": "羊绒", "style_tags": ["通勤职场"]}
    ]
  },
  "queries": [
    {"id": "daily", "query": "日常通勤，简洁可靠"},
    {"id": "three_layers", "query": "我要三层叠穿，确保层级合理"},
    {"id": "ordinary_accessories", "query": "日常通勤，可有合适配饰"},
    {"id": "rich_accessories", "query": "我要丰富配饰和多配饰叠搭，戴这顶帽子"}
  ]
}
```

在 `test_outfit_adapter.py` 读取该文件，逐个调用 `wardrobe_item`，断言 `hat` 为 `Category.HAT`、`scarf` 为 `Category.SCARF`，且所有 `item_id` 唯一。该文件不含用户数据、图片、URL、token 或凭证。

- [ ] **Step 3: 添加真实 provider 响应检查器**

创建 `scripts/check_outfit_quality_live.py`，使用 stdlib `urllib.request` 读取 Step 2 fixture 并依次请求本地 `/recommend`：

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures/release-smoke/outfit-quality-requests.json"
UPPER = {"base", "mid", "outer", "dress"}
ACCESSORIES = {"bag", "hat", "scarf", "accessory"}


def post_json(url: str, payload: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def validate_outfit(case_id: str, outfit: dict) -> dict:
    owned = list(outfit.get("owned_item_ids") or [])
    recommended = list(outfit.get("recommended_items") or [])
    layout = list(outfit.get("layout_items") or [])
    assert len(layout) == len(owned) + len(recommended), (case_id, outfit)
    roles = [entry.get("layout_role") for entry in layout]
    assert all(role in UPPER | ACCESSORIES | {"bottom", "shoes"} for role in roles)
    upper_count = sum(role in UPPER for role in roles)
    accessory_count = sum(role in ACCESSORIES for role in roles)
    assert roles.count("shoes") == 1, (case_id, roles)
    if case_id in {"daily", "ordinary_accessories"}:
        assert upper_count <= 2, (case_id, roles)
        assert accessory_count <= 2, (case_id, roles)
    if upper_count == 3:
        assert {role for role in roles if role in UPPER} == {"base", "mid", "outer"}
    owned_set = set(owned)
    assert not {"turtle", "shirt"}.issubset(owned_set), (case_id, owned)
    if case_id == "ordinary_accessories" and "hat" in roles:
        assert not {"trench", "bottom", "shoes", "hat"}.issubset(owned_set), owned
    return {
        "n": len(layout),
        "upper": upper_count,
        "accessories": accessory_count,
        "roles": roles,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    summaries = {}
    for case in source["queries"]:
        payload = dict(source["base"])
        payload["query"] = case["query"]
        body = post_json(args.base_url.rstrip("/") + "/recommend", payload)
        outfits = list(body.get("outfits") or [])
        assert outfits, (case["id"], body.get("trace"))
        summaries[case["id"]] = {
            "outfits": [validate_outfit(case["id"], outfit) for outfit in outfits],
            "rejected_by_rule": (body.get("trace") or {}).get("rejected_by_rule", {}),
        }
    print(json.dumps(summaries, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
```

该脚本只打印非私密 fixture 的角色、n 和计数，不读取或输出环境变量。

- [ ] **Step 4: 写 provider 和 HTTP 兼容失败测试**

在 `test_provider_parse.py` 断言生成 prompt 包含：

```python
assert "普通推荐上身最多 2 层" in messages[0]["content"]
assert "配饰默认最多 2 件且可以为 0 件" in messages[0]["content"]
assert "不要为了凑数量添加配饰" in messages[0]["content"]
```

在 `test_service.py` 的 `/recommend` 响应断言现有三个字段仍在，并允许/验证可选 `layout_items`。在 `test_request_trace.py` 断言新增两个 trace key 只包含整数计数。

- [ ] **Step 5: 运行测试并确认失败**

```bash
python3 test_outfit_adapter.py
python3 test_provider_parse.py
python3 test_service.py
python3 test_request_trace.py
```

Expected: adapter 测试因文件/字段不存在失败；provider 和 service 测试因提示/响应缺失失败。

- [ ] **Step 6: 实现名称感知的 App 品类映射**

把 adapter 的品类入口改为：

```python
def model_category(value: str, name: str = "") -> Category:
    lowered = name.lower()
    if value == "帽巾":
        if any(token in lowered for token in ("帽", "cap", "hat", "beanie")):
            return Category.HAT
        if any(token in lowered for token in ("围巾", "丝巾", "领巾", "scarf")):
            return Category.SCARF
        return Category.SCARF
    if value == "配饰":
        return Category.HAT  # legacy umbrella; ItemFacts.definite_hat=None -> accessory
    aliases = {
        "连体装": Category.DRESS,
        "鞋履": Category.SHOES,
        "包袋": Category.BAG,
    }
    if value in aliases:
        return aliases[value]
    for category in Category:
        if category.value == value:
            return category
    return Category.TOP
```

`wardrobe_item` 必须调用 `model_category(d.get("category"), d.get("name", ""))`，并继续读取可选 `style_tags`。

- [ ] **Step 7: 实现响应角色和一一映射**

在 adapter 中增加：

```python
_LAYOUT_ROLE_BY_CATEGORY = {
    Category.BOTTOM: "bottom",
    Category.DRESS: "dress",
    Category.OUTERWEAR: "outer",
    Category.SHOES: "shoes",
    Category.BAG: "bag",
    Category.SCARF: "scarf",
}


def layout_role_for_ref(ref: OutfitItemRef, item_index: dict[str, WardrobeItem]) -> str | None:
    category = (
        item_index[ref.ref].category
        if ref.owned and ref.ref in item_index
        else ref.suggest.category if ref.suggest else None
    )
    if category is Category.TOP:
        role = ref.layer_role or LayerRole.BASE
        return role.value if role in {LayerRole.BASE, LayerRole.MID} else None
    if category is Category.HAT:
        if not ref.owned:
            return "hat"
        return "hat" if build_item_facts(item_index[ref.ref]).definite_hat is True else "accessory"
    return _LAYOUT_ROLE_BY_CATEGORY.get(category)
```

重构 `outfits_to_app` 为单次遍历：每 append 一个建议单品就记录当时 `recommended_index`；已有单品用真实 ID。只有当映射数量等于 `len(owned_item_ids) + len(recommended_items)` 且 key 唯一时才写 `layout_items`，否则省略该字段并增加 adapter 局部变量 `layout_contract_build_error_count`。成功写出一套时增加 `layout_items_emitted`。

核心循环采用以下结构，避免先后两次遍历造成建议下标漂移：

```python
item_index = {item.id: item for item in ctx.wardrobe}
layout_items_emitted = 0
layout_contract_build_error_count = 0
outfits = []
for i, outfit in enumerate(result.outfits):
    owned_ids: list[str] = []
    recommended_items: list[dict] = []
    layout_items: list[dict] = []
    layout_keys: set[tuple[str, str | int]] = set()
    layout_valid = True

    for ref in outfit.items:
        role = layout_role_for_ref(ref, item_index)
        if ref.owned and ref.ref:
            owned_ids.append(ref.ref)
            key = ("owned", ref.ref)
            entry = {"source": "owned", "item_id": ref.ref, "layout_role": role}
        elif not ref.owned and ref.suggest:
            suggestion = ref.suggest
            recommended_index = len(recommended_items)
            recommended_items.append({
                "name": compact_recommended_name(suggestion.desc, suggestion.category),
                "category": app_category(suggestion.category),
                "color": "",
                "description": suggestion.reason,
            })
            key = ("recommended", recommended_index)
            entry = {
                "source": "recommended",
                "recommended_index": recommended_index,
                "layout_role": role,
            }
        else:
            layout_valid = False
            continue

        if role is None or key in layout_keys:
            layout_valid = False
        else:
            layout_keys.add(key)
            layout_items.append(entry)

    value = {
        "name": outfit.occasion or f"方案{i + 1}",
        "owned_item_ids": owned_ids,
        "recommended_items": recommended_items,
        "comment": outfit.reasoning or "",
    }
    if layout_valid and len(layout_items) == len(owned_ids) + len(recommended_items):
        value["layout_items"] = layout_items
        layout_items_emitted += 1
    else:
        layout_contract_build_error_count += 1
    outfits.append(value)
```

若建议项本身 malformed，沿用既有 adapter 行为不把它伪造成推荐项；该套不写不完整 `layout_items`。

- [ ] **Step 8: 更新 B3 提示而不改变内部 schema**

保留 `_GEN_SCHEMA` 的 `role/layer_role/id|gap`。在 `build_gen_messages` 根据 `policy.enforces(...)` 生成明确文本：

```python
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
```

模型自报的 `layer_role` 继续只作为待校验候选，不能覆盖 B4 权威事实。

- [ ] **Step 9: 更新契约注释和 trace allowlist**

把 `LayerRole` 注释改为“服务端生成与校验，并经 adapter 归一化为可选 App 布局角色”。`_CONSTRAINT_TRACE_KEYS` 继续只复制 pipeline 产生的键；在 `outfits_to_app` 完成旧 trace copy 后直接设置 adapter 自己产生的两个整数：

```python
trace["layout_items_emitted"] = layout_items_emitted
trace["layout_contract_build_error_count"] = layout_contract_build_error_count
```

不得把衣橱 ID、名称、图片或 Query 原文放入 trace。

- [ ] **Step 10: 运行 adapter/provider/service 回归**

```bash
python3 test_outfit_adapter.py
python3 test_provider_parse.py
python3 test_service.py
python3 test_request_trace.py
python3 test_outfit_constraints.py
python3 test_outfit_pipeline.py
```

Expected: 全部打印 `ok`；旧字段断言和新可选字段断言同时通过。

- [ ] **Step 11: 提交 canonical 响应契约**

```bash
git add stylee/contracts.py stylee/providers/openai_compat.py stylee/service/adapter.py fixtures/release-smoke/outfit-quality-requests.json scripts/check_outfit_quality_live.py test_outfit_adapter.py test_provider_parse.py test_service.py test_request_trace.py
git commit -m "feat(api): expose validated outfit layout roles"
```

### Task 5: Canonical 全量验证并生成 App mirror

**Files:**

- Generated in App: `model-service/`
- Generated in App: `model-service/UPSTREAM_COMMIT`

**Interfaces:**

- Consumes: Task 1–4 的干净 canonical HEAD。
- Produces: App 中与该 HEAD 完全一致的受治理 mirror。
- Gate: `check-model-service-sync.sh` 必须证明 pin、运行时代码和动态 `test_*.py` 一致。

- [ ] **Step 1: 运行 canonical 全量测试**

在 `/private/tmp/style-model-outfit-quality` 使用声明依赖的 Python 环境：

```bash
/Users/bytedance/Documents/style-model/.venv/bin/python -m pip install -r requirements.txt
for test_file in test_*.py; do /Users/bytedance/Documents/style-model/.venv/bin/python "$test_file" || exit 1; done
```

Expected: 每个脚本退出码 0；不得仅报告目标测试通过。

- [ ] **Step 2: 确认 canonical 干净且记录完整 SHA**

```bash
git status --short
git rev-parse HEAD
```

Expected: status 为空；SHA 为 40 位提交 ID。

- [ ] **Step 3: 从 canonical 已提交快照生成 App mirror**

在 `/private/tmp/stylee-app-outfit-quality` 运行：

```bash
./scripts/sync-model-service.sh /private/tmp/style-model-outfit-quality
./scripts/check-model-service-sync.sh /private/tmp/style-model-outfit-quality
```

Expected: 输出以 `model-service mirror matches canonical checkout` 开头，且 `model-service/UPSTREAM_COMMIT` 等于 Task 5 Step 2 记录的 40 位 canonical HEAD。

- [ ] **Step 4: 运行 mirror 的动态测试集**

```bash
cd /private/tmp/stylee-app-outfit-quality/model-service
for test_file in test_*.py; do /Users/bytedance/Documents/style-model/.venv/bin/python "$test_file" || exit 1; done
```

Expected: 所有 vendored `test_*.py` 退出码 0。

- [ ] **Step 5: 提交生成的 mirror，禁止手工挑文件**

```bash
cd /private/tmp/stylee-app-outfit-quality
git add model-service
git commit -m "chore(model): sync outfit quality contract"
```

### Task 6: App 响应 schema、局部降级和结果页角色传递

**Files:**

- Modify: App `src/types/index.ts`
- Modify: App `src/lib/styleeMapping.ts`
- Modify: App `src/lib/styleeMapping.test.ts`
- Modify: App `src/app/outfit/result.tsx`

**Interfaces:**

- Produces: `OutfitLayoutRole`。
- Produces: `RecommendLayoutItem` 和 `RecommendRespOutfit.layout_items?`。
- Produces: `OutfitItem.role?: OutfitLayoutRole`、`RecommendedItem.role?: OutfitLayoutRole`。
- Produces: `OutfitCanvasLayoutItem.layoutRole?` consumer input。

- [ ] **Step 1: 阅读 Expo 55 和 Stylee UI 上下文**

完整阅读：

```text
https://docs.expo.dev/versions/v55.0.0/
docs/STYLEE_DESIGN_SYSTEM_CONTEXT.md
design-tokens/README.md
src/design-system/README.md
```

Expected: 确认本任务不新增依赖、不改 token、不使用旧 Expo API。

- [ ] **Step 2: 写新旧响应和坏数据失败测试**

在 `styleeMapping.test.ts` 添加：

```ts
test('validated layout_items map onto owned and recommended items', () => {
  const [outfit] = outfitsRespToApp([{
    name: '通勤',
    owned_item_ids: ['t1', 'b1'],
    recommended_items: [{ name: '乐福鞋', category: '鞋履', color: '白色' }],
    comment: '',
    layout_items: [
      { source: 'owned', item_id: 't1', layout_role: 'base' },
      { source: 'owned', item_id: 'b1', layout_role: 'bottom' },
      { source: 'recommended', recommended_index: 0, layout_role: 'shoes' },
    ],
  }], wardrobe, 'u1', 's1');
  assert.equal(outfit.items?.[0].role, 'base');
  assert.equal(outfit.items?.[1].role, 'bottom');
  assert.equal(outfit.recommended_items?.[0].role, 'shoes');
});

test('invalid layout entries degrade locally without dropping n', () => {
  const [outfit] = outfitsRespToApp([{
    name: '兼容',
    owned_item_ids: ['t1', 'b1'],
    recommended_items: [{ name: '围巾', category: '帽巾', color: '米色' }],
    comment: '',
    layout_items: [
      { source: 'owned', item_id: 't1', layout_role: 'unknown' as never },
      { source: 'owned', item_id: 'b1', layout_role: 'bottom' },
      { source: 'owned', item_id: 'b1', layout_role: 'base' },
      { source: 'recommended', recommended_index: 8, layout_role: 'scarf' },
    ],
  }], wardrobe, 'u1', 's1');
  assert.equal(outfit.items?.length, 2);
  assert.equal(outfit.recommended_items?.length, 1);
  assert.equal(outfit.items?.[0].role, undefined);
  assert.equal(outfit.items?.[1].role, undefined);
  assert.equal(outfit.recommended_items?.[0].role, undefined);
});
```

同时扩展 `toRecommendRequest` 测试，断言只发送 `tag_type === 'style'` 的 `tag_name`：

```ts
assert.deepEqual(req.wardrobe[0].style_tags, ['法式慵懒']);
```

- [ ] **Step 3: 运行映射测试并确认失败**

Run:

```bash
node --test src/lib/styleeMapping.test.ts
```

Expected: FAIL，缺少角色类型、`layout_items` 和 `style_tags` 请求字段。

- [ ] **Step 4: 添加严格枚举和可选 schema**

在 `src/types/index.ts` 定义：

```ts
export type OutfitLayoutRole =
  | 'base' | 'mid' | 'outer' | 'dress' | 'bottom' | 'shoes'
  | 'bag' | 'hat' | 'scarf' | 'accessory';
```

把 `OutfitItem.role` 收窄为 `OutfitLayoutRole`，并给 `RecommendedItem` 增加 `role?: OutfitLayoutRole`。在 `styleeMapping.ts` 定义：

```ts
export interface RecommendLayoutItem {
  source: 'owned' | 'recommended';
  item_id?: string;
  recommended_index?: number;
  layout_role: OutfitLayoutRole;
}
```

`RecommendRespOutfit.layout_items?: RecommendLayoutItem[]`；`RecommendReqItem.style_tags?: string[]`。

- [ ] **Step 5: 实现局部有效角色索引**

添加常量和 pure helper：

```ts
const OUTFIT_LAYOUT_ROLES = new Set<OutfitLayoutRole>([
  'base', 'mid', 'outer', 'dress', 'bottom', 'shoes',
  'bag', 'hat', 'scarf', 'accessory',
]);

function indexLayoutItems(outfit: RecommendRespOutfit) {
  const owned = new Map<string, OutfitLayoutRole>();
  const recommended = new Map<number, OutfitLayoutRole>();
  const invalidOwned = new Set<string>();
  const invalidRecommended = new Set<number>();
  for (const entry of Array.isArray(outfit.layout_items) ? outfit.layout_items : []) {
    if (!OUTFIT_LAYOUT_ROLES.has(entry.layout_role)) continue;
    if (entry.source === 'owned' && typeof entry.item_id === 'string'
        && outfit.owned_item_ids.includes(entry.item_id)) {
      if (owned.has(entry.item_id) || invalidOwned.has(entry.item_id)) {
        owned.delete(entry.item_id);
        invalidOwned.add(entry.item_id);
      } else {
        owned.set(entry.item_id, entry.layout_role);
      }
    }
    if (entry.source === 'recommended' && Number.isInteger(entry.recommended_index)
        && entry.recommended_index! >= 0
        && entry.recommended_index! < outfit.recommended_items.length) {
      const index = entry.recommended_index!;
      if (recommended.has(index) || invalidRecommended.has(index)) {
        recommended.delete(index);
        invalidRecommended.add(index);
      } else {
        recommended.set(index, entry.layout_role);
      }
    }
  }
  return { owned, recommended };
}
```

在 `outfitsRespToApp` 按 ID/下标设置可选 role；不合法项保持 `undefined`，现有循环仍创建所有有效商品。`toRecommendRequest` 使用：

```ts
style_tags: i.tags
  ?.filter(tag => tag.tag_type === 'style')
  .map(tag => tag.tag_name),
```

- [ ] **Step 6: 把角色传入结果页画布，不改变 try-on 和换款集合**

在 `allCanvasItems` 映射中仅增加：

```ts
layoutRole: oi.role,
```

和：

```ts
layoutRole: rec.role,
```

不得过滤 `currentOutfit.items` 或 `recommended_items`；`handleGoTryOn`、收藏、换款和心愿单的集合语义保持不变。

- [ ] **Step 7: 运行映射测试和类型检查**

```bash
node --test src/lib/styleeMapping.test.ts
npm run check
```

Expected: PASS；旧响应测试仍通过，坏角色不丢 n，TS 无类型错误。

- [ ] **Step 8: 提交 App 契约消费**

```bash
git add src/types/index.ts src/lib/styleeMapping.ts src/lib/styleeMapping.test.ts src/app/outfit/result.tsx
git commit -m "feat(app): consume outfit layout roles"
```

### Task 7: 纯语义区域布局和整体 fit/center

**Files:**

- Modify: App `src/lib/outfitCanvasLayout.ts`
- Modify: App `src/lib/outfitCanvasLayout.test.ts`

**Interfaces:**

- Consumes: Task 6 `OutfitLayoutRole`。
- Produces: `OutfitCanvasRole = OutfitLayoutRole`。
- Produces: `OutfitCanvasZone = core | head | neck | carry | micro | foot`。
- Produces: `fitAndCenterPlacements(placements) -> placements`，同时处理 X/Y、安全边距和统一缩放。
- Preserves: 每个输入 ID 恰好一个 placement。

- [ ] **Step 1: 写角色优先、区域独占和 n 完整性失败测试**

替换旧 `accessory-band` 测试并添加：

```ts
test('service layout_role wins over ambiguous category text', () => {
  assert.equal(classifyOutfitCanvasRole({
    id: 'x', name: '帽巾单品', category: '帽巾', layoutRole: 'scarf',
  }), 'scarf');
});

test('semantic accessories never enter the foot zone', () => {
  const layout = buildOutfitCanvasLayout([
    { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' },
    { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' },
    { id: 'shoes', name: '乐福鞋', category: '鞋履', layoutRole: 'shoes' },
    { id: 'hat', name: '帽', category: '帽巾', layoutRole: 'hat' },
    { id: 'scarf', name: '围巾', category: '帽巾', layoutRole: 'scarf' },
    { id: 'bag', name: '包', category: '包袋', layoutRole: 'bag' },
  ]);
  assert.equal(placement(layout, 'shoes').zone, 'foot');
  assert.equal(placement(layout, 'hat').zone, 'head');
  assert.equal(placement(layout, 'scarf').zone, 'neck');
  assert.equal(placement(layout, 'bag').zone, 'carry');
  assert.equal(layout.filter(item => item.zone === 'foot').length, 1);
});

test('every legal 2 through 8 item role set stays complete and centered', () => {
  for (const items of legalRoleFixtures) {
    const layout = buildOutfitCanvasLayout(items);
    assert.deepEqual(new Set(layout.map(x => x.item.id)), new Set(items.map(x => x.id)));
    assert.equal(layout.length, items.length);
    const bounds = placementBounds(layout);
    assert.ok(bounds.left >= 2 && bounds.right <= 98);
    assert.ok(bounds.top >= 2 && bounds.bottom <= 98);
    assert.ok(Math.abs(bounds.centerX - 50) <= 1);
    assert.ok(Math.abs(bounds.centerY - 50) <= 1);
  }
});

test('legacy duplicate inferred tops stay visible in core instead of falling into foot', () => {
  const items = [
    { id: 'one', name: 'T恤', category: '上装' },
    { id: 'two', name: '毛衣', category: '上装' },
    { id: 'bottom', name: '长裤', category: '下装' },
    { id: 'shoes', name: '鞋', category: '鞋履' },
  ];
  const layout = buildOutfitCanvasLayout(items);
  assert.equal(layout.length, items.length);
  assert.equal(placement(layout, 'one').zone, 'core');
  assert.equal(placement(layout, 'two').zone, 'core');
  assert.equal(layout.filter(item => item.zone === 'foot').length, 1);
});
```

在测试文件中用以下固定角色集合定义二至八件覆盖；另加 `base+mid+bottom+shoes` 验证无外套中层：

```ts
const roleItem = (id: string, layoutRole: OutfitCanvasRole): OutfitCanvasLayoutItem => ({
  id,
  name: id,
  category: layoutRole,
  layoutRole,
});

const dress = roleItem('dress', 'dress');
const baseRole = roleItem('base', 'base');
const mid = roleItem('mid', 'mid');
const outer = roleItem('outer', 'outer');
const bottomRole = roleItem('bottom', 'bottom');
const shoesRole = roleItem('shoes', 'shoes');
const bag = roleItem('bag', 'bag');
const hat = roleItem('hat', 'hat');
const scarf = roleItem('scarf', 'scarf');

const legalRoleFixtures: OutfitCanvasLayoutItem[][] = [
  [dress, shoesRole],
  [baseRole, bottomRole, shoesRole],
  [outer, baseRole, bottomRole, shoesRole],
  [outer, baseRole, bottomRole, shoesRole, scarf],
  [outer, baseRole, bottomRole, shoesRole, bag, scarf],
  [outer, baseRole, mid, bottomRole, shoesRole, bag, scarf],
  [outer, baseRole, mid, bottomRole, shoesRole, bag, hat, scarf],
  [baseRole, mid, bottomRole, shoesRole],
];
```

- [ ] **Step 2: 写间距和可见尺寸政策失败测试**

```ts
const baseSeparates = [
  { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' as const },
  { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' as const },
  { id: 'shoes', name: '鞋', category: '鞋履', layoutRole: 'shoes' as const },
];

test('separates preserve dressing and footwear gaps', () => {
  const layout = buildOutfitCanvasLayout(baseSeparates);
  const upper = placement(layout, 'base');
  const bottom = placement(layout, 'bottom');
  const shoes = placement(layout, 'shoes');
  assert.ok(bottom.top - (upper.top + upper.height) >= 2);
  assert.ok(bottom.top - (upper.top + upper.height) <= 4);
  assert.ok(shoes.top - (bottom.top + bottom.height) >= 5);
  assert.ok(shoes.top - (bottom.top + bottom.height) <= 8);
});

test('fixture alpha ratios land in approved visible size ranges', () => {
  const alpha = {
    bag: { width: 0.623, height: 0.847 },
    hat: { width: 0.847, height: 0.821 },
    scarf: { width: 0.773, height: 0.847 },
    shoes: { width: 0.701, height: 0.246 },
  } as const;
  assertVisibleRange('bag', alpha.bag, 18, 22, 18, 24);
  assertVisibleRange('hat', alpha.hat, 14, 18, 10, 15);
  assertVisibleRange('scarf', alpha.scarf, 14, 18, 18, 26);
  assertVisibleWidthRange('shoes', alpha.shoes, 20, 25);
});
```

测试文件中添加以下完整 helper；它用该角色在基础穿搭中的实际 placement 计算，不使用容器正方形冒充可见尺寸：

```ts
function visibleSizeFor(
  role: OutfitCanvasRole,
  alpha: { width: number; height: number },
) {
  const accessory = {
    id: role,
    name: role,
    category: role,
    layoutRole: role,
  } satisfies OutfitCanvasLayoutItem;
  const core = [
    { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' as const },
    { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' as const },
    { id: 'core-shoes', name: '鞋', category: '鞋履', layoutRole: 'shoes' as const },
  ];
  const items = role === 'shoes' ? core : [...core, accessory];
  const targetId = role === 'shoes' ? 'core-shoes' : role;
  const entry = placement(buildOutfitCanvasLayout(items), targetId);
  return {
    width: entry.width * garmentImageScale(role) * alpha.width,
    height: entry.height * garmentImageScale(role) * alpha.height,
  };
}

function assertVisibleRange(
  role: OutfitCanvasRole,
  alpha: { width: number; height: number },
  minWidth: number,
  maxWidth: number,
  minHeight: number,
  maxHeight: number,
) {
  const size = visibleSizeFor(role, alpha);
  assert.ok(size.width >= minWidth && size.width <= maxWidth, `${role} width ${size.width}`);
  assert.ok(size.height >= minHeight && size.height <= maxHeight, `${role} height ${size.height}`);
}

function assertVisibleWidthRange(
  role: OutfitCanvasRole,
  alpha: { width: number; height: number },
  minWidth: number,
  maxWidth: number,
) {
  const size = visibleSizeFor(role, alpha);
  assert.ok(size.width >= minWidth && size.width <= maxWidth, `${role} width ${size.width}`);
}
```

- [ ] **Step 3: 运行布局测试并确认失败**

Run: `node --test src/lib/outfitCanvasLayout.test.ts`

Expected: FAIL，当前角色仍有 `top`，区域仍有 `orbit/accessory-band`，只做水平中心，且围巾可落到底部带。

- [ ] **Step 4: 重写角色、区域和稳定顺序**

将类型改为：

```ts
export type OutfitCanvasRole = OutfitLayoutRole;
export type OutfitCanvasZone = 'core' | 'head' | 'neck' | 'carry' | 'micro' | 'foot';

export interface OutfitCanvasLayoutItem {
  id: string;
  name: string;
  category: string;
  layoutRole?: OutfitCanvasRole;
  imageUri?: string | null;
  imageSource?: unknown;
  owned?: boolean;
}
```

`classifyOutfitCanvasRole` 第一行返回有效 `item.layoutRole`；旧响应推断顺序仍为外套、鞋、包、围巾、帽、连体、下装、上装，旧普通上装回退为 `base`。

放置顺序固定为：`outer → dress/base → mid → bottom → shoes → hat → scarf → bag → accessory`，不依赖接口数组顺序抢区域。合法响应每个语义核心角色最多一件；旧服务推断出的重复 `base/mid` 使用同一 `core` 基准形状加 `left -= 4 * index`、`top += 2 * index`、`zIndex -= index` 的确定性偏移，确保每件仍在 core 且不丢失。

- [ ] **Step 5: 实现语义形状和视觉政策**

使用单一模块内常量，不新增 token：

```ts
const ACCESSORY_SHAPES = {
  hat: { zone: 'head', left: 78, top: 3, width: 18, height: 15, rotation: 2, zIndex: 7 },
  scarf: { zone: 'neck', left: 76, top: 22, width: 19, height: 26, rotation: 3, zIndex: 8 },
  bag: { zone: 'carry', left: 74, top: 48, width: 26, height: 24, rotation: 2, zIndex: 8 },
} as const;

const MICRO_SHAPES = [
  { zone: 'micro', left: 5, top: 26, width: 12, height: 12, rotation: -2, zIndex: 8 },
  { zone: 'micro', left: 5, top: 42, width: 12, height: 12, rotation: 2, zIndex: 9 },
  { zone: 'micro', left: 5, top: 58, width: 12, height: 12, rotation: -1, zIndex: 10 },
] as const;

const IMAGE_SCALE: Record<OutfitCanvasRole, number> = {
  base: 1.62,
  mid: 1.50,
  outer: 1.52,
  dress: 1.50,
  bottom: 1.58,
  shoes: 1.18,
  bag: 1.18,
  hat: 1.00,
  scarf: 1.15,
  accessory: 1.00,
};
```

主体 shape 使用固定可解释的高度和由前一可见层计算的间距：

```ts
const DRESSING_GAP = 3;
const FOOT_GAP = 6;

const entries = items.map(item => ({ item, role: classifyOutfitCanvasRole(item) }));
const buckets = new Map<OutfitCanvasRole, typeof entries>();
for (const entry of entries) {
  const bucket = buckets.get(entry.role) ?? [];
  bucket.push(entry);
  buckets.set(entry.role, bucket);
}
const first = (role: OutfitCanvasRole) => buckets.get(role)?.[0];
const outerEntry = first('outer');
const dressEntry = first('dress');
const baseEntries = buckets.get('base') ?? [];
const midEntries = buckets.get('mid') ?? [];
const bottomEntry = first('bottom');
const shoesEntry = first('shoes');
const hasOuter = Boolean(outerEntry);
const result: OutfitCanvasPlacement[] = [];
let basePlacement: OutfitCanvasPlacement | undefined;
let midPlacement: OutfitCanvasPlacement | undefined;
let dressPlacement: OutfitCanvasPlacement | undefined;
let bottomPlacement: OutfitCanvasPlacement | undefined;

const outerShape: PlacementShape = {
  zone: 'core', left: 4, top: 3, width: 58, height: 70,
  rotation: -2, zIndex: 1,
};

const baseShape: PlacementShape = hasOuter
  ? { zone: 'core', left: 38, top: 8, width: 44, height: 31, rotation: 0, zIndex: 5 }
  : { zone: 'core', left: 18, top: 5, width: 50, height: 34, rotation: 0, zIndex: 5 };

const midShape: PlacementShape = hasOuter
  ? { zone: 'core', left: 31, top: 9, width: 46, height: 30, rotation: -1, zIndex: 4 }
  : { zone: 'core', left: 12, top: 9, width: 50, height: 30, rotation: -1, zIndex: 4 };

const upperBottom = Math.max(
  ...[basePlacement, midPlacement]
    .filter((entry): entry is OutfitCanvasPlacement => Boolean(entry))
    .map(entry => entry.top + entry.height),
);
const bottomShape: PlacementShape = {
  zone: 'core', left: hasOuter ? 38 : 20,
  top: upperBottom + DRESSING_GAP,
  width: hasOuter ? 44 : 46, height: 35,
  rotation: 0, zIndex: 4,
};

const dressShape: PlacementShape = hasOuter
  ? { zone: 'core', left: 37, top: 5, width: 44, height: 70, rotation: 0, zIndex: 4 }
  : { zone: 'core', left: 20, top: 5, width: 56, height: 70, rotation: 0, zIndex: 4 };

const footAnchor = bottomPlacement ?? dressPlacement ?? basePlacement;
const shoesShape: PlacementShape = {
  zone: 'foot',
  left: footAnchor.left + footAnchor.width / 2 - 14.5,
  top: footAnchor.top + footAnchor.height + (dressPlacement ? 7 : FOOT_GAP),
  width: 29, height: 18,
  rotation: hasOuter ? 4 : -4, zIndex: 9,
};
```

使用现有 `placement(item, role, shape)` helper 把 primary entry 写入上述变量并 push 到 `result`，再计算下一个 shape。连衣裙路径只创建 `outer? + dress + shoes`，不创建 base/mid/bottom。合法路径完成后，对 `baseEntries.slice(1)` 和 `midEntries.slice(1)` 应用前述 core 偏移；对未消费的外围同角色项使用该语义区域的镜像或 `MICRO_SHAPES[index]`，确保每个 `entries` 项恰好 push 一次。`foot` 宽度从当前早期 22% 提升到 29%，再用 1.18 scale 使 loafer fixture 可见宽度落在 20%–25%。

- [ ] **Step 6: 实现二维统一 fit/center**

替换 `centerPlacementsHorizontally`：

```ts
function fitAndCenterPlacements(
  placements: OutfitCanvasPlacement[],
  safeInset = 2,
): OutfitCanvasPlacement[] {
  if (placements.length === 0) return placements;
  const bounds = placementBounds(placements);
  const available = 100 - (safeInset * 2);
  const scale = Math.min(
    1,
    available / (bounds.right - bounds.left),
    available / (bounds.bottom - bounds.top),
  );
  const scaledWidth = (bounds.right - bounds.left) * scale;
  const scaledHeight = (bounds.bottom - bounds.top) * scale;
  const offsetX = 50 - scaledWidth / 2 - bounds.left * scale;
  const offsetY = 50 - scaledHeight / 2 - bounds.top * scale;
  return placements.map(entry => ({
    ...entry,
    left: entry.left * scale + offsetX,
    top: entry.top * scale + offsetY,
    width: entry.width * scale,
    height: entry.height * scale,
  }));
}
```

同一语义 shape 与已放置外围 shape 发生矩形碰撞时，使用以下确定性镜像一次；镜像后仍重叠则保留语义区域并交给整组 fit 缩放，不得移动到 `foot`：

```ts
function overlaps(a: PlacementShape, b: PlacementShape) {
  return a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;
}

function mirrorHorizontally(shape: PlacementShape): PlacementShape {
  return {
    ...shape,
    left: 100 - shape.left - shape.width,
    rotation: -shape.rotation,
  };
}

function placePeripheralRole(
  role: 'hat' | 'scarf' | 'bag',
  entries: Array<{ item: OutfitCanvasLayoutItem; role: OutfitCanvasRole }>,
  result: OutfitCanvasPlacement[],
) {
  entries.forEach((entry, index) => {
    const primary = ACCESSORY_SHAPES[role];
    const candidate = index % 2 === 0 ? primary : mirrorHorizontally(primary);
    const occupied = result.filter(value => value.zone !== 'core' && value.zone !== 'foot');
    const shape = occupied.some(value => overlaps(candidate, value))
      ? mirrorHorizontally(candidate)
      : candidate;
    result.push(placement(entry.item, role, {
      ...shape,
      zIndex: shape.zIndex + index,
    }));
  });
}

function placeMicroEntries(
  entries: Array<{ item: OutfitCanvasLayoutItem; role: OutfitCanvasRole }>,
  result: OutfitCanvasPlacement[],
) {
  entries.forEach((entry, index) => {
    const shape = MICRO_SHAPES[Math.min(index, MICRO_SHAPES.length - 1)];
    result.push(placement(entry.item, 'accessory', {
      ...shape,
      left: shape.left + Math.max(0, index - MICRO_SHAPES.length + 1) * 2,
      zIndex: shape.zIndex + index,
    }));
  });
}
```

`placementBounds` 在生产模块中实现并导出给测试使用：

```ts
export function placementBounds(placements: OutfitCanvasPlacement[]) {
  const left = Math.min(...placements.map(entry => entry.left));
  const right = Math.max(...placements.map(entry => entry.left + entry.width));
  const top = Math.min(...placements.map(entry => entry.top));
  const bottom = Math.max(...placements.map(entry => entry.top + entry.height));
  return {
    left, right, top, bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}
```

- [ ] **Step 7: 运行布局测试和完整 Node 测试**

```bash
node --test src/lib/outfitCanvasLayout.test.ts
node --test src/lib/*.test.ts src/design-system/*.test.ts
```

Expected: PASS；所有输入 ID 恰好出现一次，`foot` 只有鞋，二至八件均在 2%–98% 安全范围并二维居中。

- [ ] **Step 8: 提交纯布局策略**

```bash
git add src/lib/outfitCanvasLayout.ts src/lib/outfitCanvasLayout.test.ts
git commit -m "feat(ui): add semantic outfit layout zones"
```

### Task 8: 共享画布与 alpha fixture 校准

**Files:**

- Modify: App `src/design-system/StyleeOutfitCanvas.tsx`
- Modify: App `src/design-system/outfitCanvasComponent.test.ts`
- Create: App `scripts/check-outfit-fixture-alpha.py`

**Interfaces:**

- Consumes: Task 7 placement、role scale 和 `garmentImageOffsetY`。
- Preserves: `resizeMode="contain"`、每件单品 accessibility label、44 pt 等效触达区域和现有点击回调。
- Produces: 四张 fixture 的实际 alpha ratio 证据。

- [ ] **Step 1: 写组件失败测试，禁止组件自行重分类或过滤**

在 `outfitCanvasComponent.test.ts` 添加：

```ts
assert.match(source, /buildOutfitCanvasLayout\(items\)/);
assert.match(source, /garmentImageScale\(entry\.role\)/);
assert.match(source, /garmentImageOffsetY\(entry\.role\)/);
assert.match(source, /resizeMode="contain"/);
assert.doesNotMatch(source, /\.filter\(/);
assert.doesNotMatch(source, /accessory-band/);
```

- [ ] **Step 2: 添加 alpha fixture checker**

创建 `scripts/check-outfit-fixture-alpha.py`：

```python
#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = {
    "bag": ("public/preset-items/black-backpack.png", (0.623, 0.847)),
    "hat": ("public/preset-items/baseball-cap.png", (0.847, 0.821)),
    "scarf": ("public/preset-items/beige-scarf.png", (0.773, 0.847)),
    "shoes": ("public/preset-items/womens-loafers.png", (0.701, 0.246)),
}

for role, (relative, expected) in FIXTURES.items():
    image = Image.open(ROOT / relative).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None, f"{role}: no visible alpha"
    width = (bbox[2] - bbox[0]) / image.width
    height = (bbox[3] - bbox[1]) / image.height
    assert abs(width - expected[0]) <= 0.01, (role, width, expected[0])
    assert abs(height - expected[1]) <= 0.01, (role, height, expected[1])
    print(role, round(width, 3), round(height, 3))
```

该脚本只测已批准 fixture 的可见边界，不裁切、不重写 PNG。

- [ ] **Step 3: 运行 checker 并确认当前 fixture 与记录一致**

```bash
/Users/bytedance/Documents/style-model/.venv/bin/python scripts/check-outfit-fixture-alpha.py
```

Expected:

```text
bag 0.623 0.847
hat 0.847 0.821
scarf 0.773 0.847
shoes 0.701 0.246
```

- [ ] **Step 4: 更新共享画布，仅消费 placement**

保留当前 `Pressable`、语义 token、`contain` 和 placeholder。图片偏移固定为角色函数返回值；鞋的 Y offset 使用 10 pt，其他角色返回 0。不得在组件里按 n 重排或过滤：

```tsx
const imageOffsetY = garmentImageOffsetY(entry.role);
<Image
  accessibilityElementsHidden
  source={source}
  style={[
    styles.image,
    { top: imageOffsetY, transform: [{ scale: garmentImageScale(entry.role) }] },
  ]}
  resizeMode="contain"
/>
```

- [ ] **Step 5: 运行组件、布局和设计系统检查**

```bash
node --test src/design-system/outfitCanvasComponent.test.ts src/lib/outfitCanvasLayout.test.ts
npm run design-system:check
npm run check
```

Expected: PASS；无 raw color/spacing/token 违规，TS 通过。

- [ ] **Step 6: 提交画布与可见边界校准**

```bash
git add src/design-system/StyleeOutfitCanvas.tsx src/design-system/outfitCanvasComponent.test.ts scripts/check-outfit-fixture-alpha.py
git commit -m "feat(ui): calibrate outfit canvas proportions"
```

### Task 9: 合法响应 Demo、文档和证据边界

**Files:**

- Create: App `src/data/outfitLayoutDemoFixtures.ts`
- Modify: App `src/app/outfit-layout-demo.tsx`
- Modify: App `src/lib/outfitLayoutDemoRoute.test.ts`
- Modify: App `src/design-system/README.md`

**Interfaces:**

- Consumes: Task 6 `RecommendRespOutfit`/mapping，Task 7–8 production canvas。
- Produces: 无网络、无随机数的固定合法响应演示。
- Separates: 日常合法固定响应 fixture、明确三层/丰富配饰结构压力测试，以及 Task 10 的真实 provider 结果。

- [ ] **Step 1: 写 Demo 失败测试**

把 route 测试改为：

```ts
test('demo uses fixed response fixtures and labels stress cases honestly', () => {
  const source = readFileSync(resolve(libDir, '../app/outfit-layout-demo.tsx'), 'utf8');
  const fixtures = readFileSync(resolve(libDir, '../data/outfitLayoutDemoFixtures.ts'), 'utf8');
  assert.match(source, /outfitLayoutDemoFixtures/);
  assert.match(fixtures, /合法响应 fixture/);
  assert.match(fixtures, /8件结构压力测试/);
  assert.doesNotMatch(fixtures, /8件合法上限/);
  assert.doesNotMatch(source, /Math\.random|aiRecommend|tryon|fetch\(|supabase/);
});
```

- [ ] **Step 2: 运行 Demo 测试并确认失败**

Run: `node --test src/lib/outfitLayoutDemoRoute.test.ts`

Expected: FAIL，当前 Demo 仍手工命名为“8件合法上限”，也没有响应 fixture。

- [ ] **Step 3: 创建固定响应 fixture**

`outfitLayoutDemoFixtures.ts` 导出：

```ts
import type { WardrobeItem } from '@/types';
import type { RecommendRespOutfit } from '@/lib/styleeMapping';
import { withBase } from '@/lib/withBase';

const createdAt = '2026-08-26T00:00:00.000Z';

function wardrobeItem(
  item_id: string,
  name: string,
  category: WardrobeItem['category'],
  imagePath: string,
): WardrobeItem {
  return {
    item_id,
    user_id: 'layout-demo',
    name,
    category,
    color: '',
    image_url: withBase(imagePath),
    source_type: 'manual',
    status: 'active',
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export const outfitLayoutDemoWardrobe = [
  wardrobeItem('dress', '黑色连衣裙', '连体装', '/preset-items/black-dress.png'),
  wardrobeItem('base', '黑色T恤', '上装', '/preset-items/black-tshirt.png'),
  wardrobeItem('mid', '灰色卫衣中层', '上装', '/preset-items/gray-sweatshirt.png'),
  wardrobeItem('outer', '卡其色风衣', '外套', '/preset-items/khaki-trench.png'),
  wardrobeItem('bottom', '黑色直筒裤', '下装', '/preset-items/black-trousers.png'),
  wardrobeItem('shoes', '白色乐福鞋', '鞋履', '/preset-items/womens-loafers.png'),
  wardrobeItem('bag', '黑色背包', '包袋', '/preset-items/black-backpack.png'),
  wardrobeItem('hat', '黑色针织帽', '帽巾', '/preset-items/beanie.png'),
  wardrobeItem('scarf', '米色针织围巾', '帽巾', '/preset-items/beige-scarf.png'),
] satisfies WardrobeItem[];

const roleById = {
  dress: 'dress',
  base: 'base',
  mid: 'mid',
  outer: 'outer',
  bottom: 'bottom',
  shoes: 'shoes',
  bag: 'bag',
  hat: 'hat',
  scarf: 'scarf',
} as const;

function response(name: string, ids: Array<keyof typeof roleById>): RecommendRespOutfit {
  return {
    name,
    owned_item_ids: ids,
    recommended_items: [],
    comment: '',
    layout_items: ids.map(item_id => ({
      source: 'owned',
      item_id,
      layout_role: roleById[item_id],
    })),
  };
}

export const outfitLayoutDemoFixtures: Array<{
  id: string;
  label: string;
  kind: 'validated-response' | 'structural-stress';
  outfit: RecommendRespOutfit;
}> = [
  {
    id: 'dress-2', label: '合法响应 fixture · 2件裙装', kind: 'validated-response',
    outfit: response('裙装', ['dress', 'shoes']),
  },
  {
    id: 'base-3', label: '合法响应 fixture · 3件基础', kind: 'validated-response',
    outfit: response('基础', ['base', 'bottom', 'shoes']),
  },
  {
    id: 'layer-4', label: '合法响应 fixture · 4件两层', kind: 'validated-response',
    outfit: response('两层', ['outer', 'base', 'bottom', 'shoes']),
  },
  {
    id: 'accessory-5', label: '合法响应 fixture · 5件单配饰', kind: 'validated-response',
    outfit: response('单配饰', ['outer', 'base', 'bottom', 'shoes', 'scarf']),
  },
  {
    id: 'accessory-6', label: '合法响应 fixture · 6件双配饰', kind: 'validated-response',
    outfit: response('双配饰', ['outer', 'base', 'bottom', 'shoes', 'bag', 'scarf']),
  },
  {
    id: 'stress-8', label: '8件结构压力测试 · 明确三层与丰富配饰', kind: 'structural-stress',
    outfit: response('结构压力测试', [
      'outer', 'base', 'mid', 'bottom', 'shoes', 'bag', 'hat', 'scarf',
    ]),
  },
];
```

每个 `outfit.layout_items` 与已有项一一对应；n 由 `owned_item_ids` 实际长度决定。Fixture 不调用网络、不使用随机数、不添加响应之外的商品。建议单品的一一映射已由 Task 4/6 的契约测试覆盖，Demo 不为覆盖接口分支虚构购买建议。

- [ ] **Step 4: 让 Demo 通过正式映射和生产画布渲染**

Demo 使用 `outfitsRespToApp` 把 fixture 与固定 demo wardrobe 映射为 `Outfit`，再按已有/建议单品的 role 构造 `OutfitCanvasLayoutItem`。标签格式固定为：

```ts
const scenarios = outfitLayoutDemoFixtures.map(fixture => {
  const [outfit] = outfitsRespToApp(
    [fixture.outfit], outfitLayoutDemoWardrobe, 'layout-demo', fixture.id,
  );
  const items: OutfitCanvasLayoutItem[] = [
    ...(outfit.items ?? []).map(entry => ({
      id: entry.item_id,
      name: entry.item?.name ?? '',
      category: entry.item?.category ?? '',
      imageUri: entry.item?.image_url,
      owned: true,
      layoutRole: entry.role,
    })),
    ...(outfit.recommended_items ?? []).map((entry, index) => ({
      id: `rec_${index}`,
      name: entry.name,
      category: entry.category,
      imageUri: entry.image_url,
      owned: false,
      layoutRole: entry.role,
    })),
  ];
  return { ...fixture, items };
});
```

不得在此映射后按角色或数量过滤。标签格式固定为：

```text
合法响应 fixture · 2件裙装
合法响应 fixture · 3件基础
合法响应 fixture · 4件两层
合法响应 fixture · 5件单配饰
合法响应 fixture · 6件双配饰
8件结构压力测试 · 明确三层与丰富配饰
```

- [ ] **Step 5: 更新设计系统说明**

在 `src/design-system/README.md` 的 Editorial outfit canvas 段删除“超过两个配饰进入底部带”，改为：角色来自可选服务端契约，旧响应按名称降级；`head/neck/carry/micro/foot` 语义区域不按返回顺序抢位；`foot` 只放鞋；完成后按整组 bounds fit/center。

- [ ] **Step 6: 运行 Demo、映射和组件测试**

```bash
node --test src/lib/outfitLayoutDemoRoute.test.ts src/lib/styleeMapping.test.ts src/lib/outfitCanvasLayout.test.ts src/design-system/outfitCanvasComponent.test.ts
```

Expected: PASS；Demo 无网络/随机依赖，旧误导文案不存在。

- [ ] **Step 7: 提交 Demo 与文档**

```bash
git add src/data/outfitLayoutDemoFixtures.ts src/app/outfit-layout-demo.tsx src/lib/outfitLayoutDemoRoute.test.ts src/design-system/README.md
git commit -m "docs(ui): add validated outfit layout fixtures"
```

### Task 10: 双仓最终验证、真实模型结果和多宽度截图

**Files:**

- Verify only; do not create a release/deploy commit.

**Interfaces:**

- Consumes: 全部 canonical/App commits。
- Produces: 可复核的命令输出、真实模型 n、错误码计数和页面截图。
- Gate: 缺少真实 provider 凭证或授权登录态时，不得把 mock 结果声称为真实模型验证。

- [ ] **Step 1: 重新证明 canonical 与 mirror 完全一致**

```bash
cd /private/tmp/stylee-app-outfit-quality
./scripts/check-model-service-sync.sh /private/tmp/style-model-outfit-quality
bash scripts/model-service-sync.test.sh
```

Expected: 两个检查退出码 0，pin 等于 canonical HEAD。

- [ ] **Step 2: 运行 canonical 和 mirror 全量 Python 测试**

```bash
cd /private/tmp/style-model-outfit-quality
for test_file in test_*.py; do /Users/bytedance/Documents/style-model/.venv/bin/python "$test_file" || exit 1; done
cd /private/tmp/stylee-app-outfit-quality/model-service
for test_file in test_*.py; do /Users/bytedance/Documents/style-model/.venv/bin/python "$test_file" || exit 1; done
```

Expected: 两套动态测试集全部退出码 0。

- [ ] **Step 3: 运行 App 全量测试和构建门槛**

```bash
cd /private/tmp/stylee-app-outfit-quality
node --test src/lib/*.test.ts src/design-system/*.test.ts
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=test-anon-key EXPO_PUBLIC_STYLEE_API=http://127.0.0.1:8000 npm run build:web
```

Expected: 所有命令退出码 0；测试值只存在于该进程环境，不创建或提交 `.env`。

- [ ] **Step 4: 本地真实 provider 验证新规则**

仅在当前授权环境已经具备真实 provider 服务端凭证时，从 canonical 工作树启动本地服务；不得打印密钥：

```bash
cd /private/tmp/style-model-outfit-quality
/Users/bytedance/Documents/style-model/.venv/bin/python serve.py --provider deepseek
```

服务启动后，在另一终端运行已提交的非私密 fixture 检查器：

```bash
cd /private/tmp/style-model-outfit-quality
/Users/bytedance/Documents/style-model/.venv/bin/python scripts/check_outfit_quality_live.py --base-url http://127.0.0.1:8000
```

脚本分别请求日常、明确三层、普通配饰、明确丰富配饰，并打印每套实际 n、上身数、配饰数、角色和响应 trace 的 `rejected_by_rule` 计数。必须验证：

```text
日常：上身 <= 2，配饰 <= 2
明确三层：只允许 base+mid+outer
高领毛衣+普通衬衫：不进入最终结果
普通正式套装+棒球帽：无明确混搭请求时不进入最终结果
每套：layout_items 数量 == owned_item_ids + recommended_items
```

若 provider 凭证不存在，停止真实验证并明确报告“自动化与 mock 已通过、真实 provider 未验证”；不得用 mock 替代该结论。

- [ ] **Step 5: 在真实 App 结果页联调一套真实模型响应**

保持 Step 4 的 canonical 服务运行。在 App 工作树使用当前已授权的公开 Supabase 配置启动 Web，但不打印或复制凭证：

```bash
cd /private/tmp/stylee-app-outfit-quality
EXPO_PUBLIC_STYLEE_API=http://127.0.0.1:8000 npm run web -- --port 8081
```

在已有登录态的 in-app Browser 中打开推荐生成流程，只使用当前账号已有衣橱，不新增、删除或修改衣橱单品。生成一套“日常通勤，简洁可靠”结果，检查 Network `/recommend` 响应中的 n 与 `layout_items` 数量一致，并在真实结果页截图确认角色布局。若工作树缺少公开 Supabase 配置或 Browser 无授权登录态，停止该联调并明确报告“真实 provider JSON 已验证、真实 App 登录态页面未验证”；不得把固定 Demo 截图称为真实模型结果。

- [ ] **Step 6: 启动静态页面并做五档宽度视觉检查**

```bash
cd /private/tmp/stylee-app-outfit-quality
python3 -m http.server 4174 --directory dist
```

用 in-app Browser 打开 `http://localhost:4174/outfit-layout-demo/`，在 320、375、393、430 和 768 pt 检查并截图：

```text
全部 fixture 无裁切、无缺件、无重复
上下装可见间距 2%-4%
裤/裙与鞋间距 5%-8%
鞋可见宽度 20%-25%，且比旧版更易看清
围巾只在 neck，帽只在 head，包只在 carry，foot 只有鞋
整组 bounds 在安全区内，视觉中心无明显偏移
8 件只标“结构压力测试”
```

- [ ] **Step 7: 最终状态审计**

```bash
git -C /private/tmp/style-model-outfit-quality status --short
git -C /private/tmp/stylee-app-outfit-quality status --short
git -C /Users/bytedance/Documents/styleetest1 status --short
```

Expected: 两个 feature 工作树干净；主 App 工作树仍保留开始时的六个未提交文件和 `design-qa.md`，没有被执行流程覆盖。报告两个仓库的 commit 列表、测试结果、真实 provider 状态和截图路径；不 push、不部署。
