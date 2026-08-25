# Stylee 离线搭配能力评测 harness（eval/）

给一条 query，验证模型能否从**单品池**里挑出一整套合适搭配（上装/下装/外套/鞋/包/配饰）。
本目录是**自包含**的离线评测流水线，默认用 **mock provider**（无外网、无 API key、可复现），
通过 `import` 复用 model-service 既有的 `adapter + pipeline + provider`，**不修改** model-service 任何源码行为。

---

## 0. 一分钟跑通

```bash
cd model-service/eval
python3 run_eval.py --catalog catalog.sample.json --queries queries.json --provider mock --out results/
```

产出（写入 `results/`）：
- `outfits.jsonl`：每行一条 query（query 文本+标签、模型 slot→item_id 选择、理由、四维分、原始 trace）。
- `review_sheet.csv` / `review_sheet.xlsx`：大众评审评分表（左=搭配、右=打分；xlsx 加权总分为真实公式）。
- `review_sheet_personalization.csv`：个性化深度的**成对双画像**对比子表。

覆盖矩阵（供产品检查穷举度）：
```bash
python3 build_queries_matrix.py    # 生成 queries_matrix.md
```

---

## 1. model-service 的“出整套搭配”契约（第一步结论）

### 1.1 入口：两种都可，本 harness 默认走 in-process 函数（最稳、离线可复现）
- **Python 函数（本 harness 采用）**：
  `stylee.service.adapter.to_request_context(payload)` → `stylee.pipeline.recommend(ctx, provider, retriever)` → 返回 `RecommendationResult`。
  这与 HTTP 服务 `/recommend` 内部是**同一条链路**（见 `stylee/service/server.py::_recommend`），只是 harness 直接消费更细的 `Outfit` 结构（含 slot→item_id、理由、四维分）。
- **HTTP 端点**：`POST /recommend`（`serve.py` 启动，默认 `http://127.0.0.1:8000`，provider 默认 mock）。
  - 请求 JSON（App 形状，`adapter.to_request_context` 负责翻译）：
    ```json
    {
      "input_mode": "nl",              // "nl" 自然语言 | "tags" 标签
      "query": "周末外滩约会，晚上",     // NL 模式的自然语言
      "n": 4,                           // 想要几套
      "wardrobe": [ /* 单品数组，见 1.2 */ ],
      "profile": { "gender": "female", "body_shape": "梨形",
                   "height_cm": 162, "skin_tone": "黄黑皮", "style_prefs": ["法式","通勤"] },
      "weather": { "temp_c": 22, "condition": "晴", "time_of_day": "evening", "city": "" },
      "tags": ["date","french","temp_cold"]  // tags 模式用；也可与 NL 混用做附加约束
    }
    ```
  - 响应 JSON：`{ "outfits": [ { "name", "owned_item_ids":[...], "recommended_items":[{name,category,color,description}], "comment" } ], "trace": {...} }`。
    注意：HTTP 响应只给 `owned_item_ids`（列表）与补买建议，**不含 slot 映射**；需要 slot→item 细节请走 in-process 路径（本 harness 即如此）。

### 1.2 单品（wardrobe item）输入 schema — 决定 800 单品目录格式
由 `adapter.wardrobe_item(d)` 解析。字段：

| 字段 | 必填 | 类型/取值 | 说明 |
| --- | --- | --- | --- |
| `item_id`（或 `id`） | **是** | string | 单品唯一 id，输出里用它指回目录 |
| `category` | **是** | 上装 / 下装 / 连衣裙 / 外套 / 鞋 / 包 / 帽子 / 围巾 | 也接受 App 别名：连体装→连衣裙、鞋履→鞋、包袋→包、帽巾→围巾、配饰→帽子 |
| `name` | 建议 | string | 展示名（映射到内部 `subcategory`） |
| `colors`（或 `color`） | 建议 | list[string] / string | 颜色名，建议用可识别词：白色/黑色/灰色/米色/卡其/藏青/牛仔蓝/棕色/酒红/荧光X 等 |
| `material` | 否 | string | 材质 |
| `sleeve_length` | 否 | 无袖 / 短袖 / 长袖 | 影响冷天硬约束 |
| `fit`（或 `fit_type`） | 否 | 紧身 / 修身 / 标准 / 宽松 / oversize | |
| `season` | 建议 | list of 春/夏/秋/冬 | 空=四季皆可 |
| `style_tags` | 建议 | list[string] | 风格标签，喂风格池/冲突约束 |
| `occasion_tags` | 否 | list[string] | 场合标签 |
| `warmth` | 建议 | int 0(最薄)~4(羽绒) | 温度硬约束用 |

> 目录文件（`catalog.json`）就是**上述单品对象的 JSON 数组**。样例见 `catalog.sample.json`（28 件，覆盖 6 类槽位、多颜色、多季节、含男女/中性单品）。

### 1.3 query 可带的结构化约束
- 自然语言 `query`（NL 模式）+ 以下上下文：
  - `profile`：`gender`、`body_shape`（梨形/苹果形/沙漏形/矩形/倒三角）、`height_cm`、`skin_tone`、`style_prefs`。
  - `weather`：`temp_c`、`condition`（晴/阴/雨/雪）、`time_of_day`（day/evening/night）、`city`。
  - `tags`：场合/风格/色系/温度标签（如 `date/french/temp_cold`），tags 模式免模型直接映射。
- 服务端会从文本里解析**规则级 override**（见 `outfit_policy.build_constraint_policy`）：如“撞色/多彩”放宽颜色数量、“荧光”放宽荧光约束、“室内/空调/暖气/不考虑天气”放宽外套硬约束、明确风格词放宽场景风格池等。
- 指定单品/身材/显高显瘦等，靠自然语言表达即可（真实模型能利用；mock 只做关键词近似）。

### 1.4 离线/无 key 的 mock 跑法 & 切真实模型
- **mock（默认，离线可复现）**：`--provider mock`。不打任何外部模型；结构真实但内容是规则拼的。
- **真实模型**：`--provider deepseek` 或 `--provider qwen`，并配置环境变量：
  ```bash
  DEEPSEEK_API_KEY=... python3 run_eval.py --provider deepseek --catalog catalog.json --queries queries.json --out results/
  # 或 Qwen 文本模型：DASHSCOPE_API_KEY=... python3 run_eval.py --provider qwen ...
  ```
  切 provider **无需改任何代码**（harness 用 `stylee.providers.build_provider(name)`，与生产一致）。缺 key 时 harness 会明确报错并提示改回 mock。
- RAG 检索：无 `DASHSCOPE_API_KEY` 时向量索引签名不匹配，自动降级为关键词检索（`trace.rag_mode=fallback`），推荐功能不受影响。

### 1.5 输出里包含什么
`outfits.jsonl` 每套包含：
- `slot_selection`：`{slot: item_id}`（torso/bottom/outer/feet/accessory）——每个槽位选了目录里哪个 item。
- `slots`：明细（owned 单品的 name/category/colors；或缺口建议 gap 的 desc/reason）。
- `display_columns`：已折算成评审表的 6 列（上装/下装/外套/鞋/包/配饰）。
- `reasoning`：理由文本；`confidence`：整体信心；`scores`：四维硬分（body_fit/occasion/style_coherence/color_harmony）。
- `trace`：命中的约束/被拒错误码/是否回退等（`rejected_by_rule`、`fallback_type`、`candidate_pool_size` 等）。

---

## 2. query 集与制题（第三步）
- `queries.json`：50 条，字段 `query_id/text/scenario/style/color_system/season/temp_range/gender/special/profile_variant`。
- 系统覆盖：12 场景 × 11 风格 × 8 色系 × 6 季节·温度 × 3 性别；边界题 4 类（指定单品/模糊需求/反馈迭代/身材诉求）各 3 条；个性化对比 5 对（文本相同、画像不同，`query_id` 以 a/b 结尾成对）。
- `queries_matrix.md`：由 `build_queries_matrix.py` 生成的覆盖矩阵，供产品核对穷举度。

## 3. 评审表（第四步）
- 维度与权重（原样采用产品文档）：意图匹配30% / 审美质感25% / 个性化深度20% / 实穿性15% / 创意惊喜10%，1/3/5 锚点见 `review_guide.md`。
- `review_sheet.xlsx`：顶部含评审说明；`加权总分`列为真实单元格公式，评审填 1~5 自动出分；UTF-8 中文不乱码。
- `review_sheet.csv`：同结构（utf-8-sig），`加权总分`留空并在列头写明公式。
- `review_sheet_personalization.csv`：成对双画像左右并排，只评“差异化是否明显”。

---

## 4. 灌入 800 单品目录（对接步骤）
1. 把 800 单品整理成 `catalog.json`（结构同 `catalog.sample.json`，字段见 1.2）。**必须字段**：`item_id`、`category`（用固定枚举/别名）。建议尽量补齐 `colors/season/style_tags/warmth`，约束与打分更准。
2. 运行：
   ```bash
   python3 run_eval.py --catalog catalog.json --queries queries.json --provider mock --out results_800/
   ```
   先用 mock 验证目录能被正确解析、slot→item_id 能指回目录（harness 会校验 id 有效性）。
3. 切真实模型评审：`--provider deepseek`（配好 `DEEPSEEK_API_KEY`）重跑，得到有真实审美的搭配，再发大众评审。
4. 若需要 HTTP 方式：`python3 ../serve.py --provider mock`（或 deepseek），把 wardrobe 作为 `/recommend` 请求体的 `wardrobe` 字段传入即可（每条 query 都传整个目录作为可选池）。

> 注意：本评测把**整个目录作为每条 query 的候选池**（`wardrobe`），即“从单品池挑一整套”。若目录很大（800 件），B1 会先按季节/温度/场合把池缩小，再交给模型在可行域里选。

---

## 5. mock 与真实模型的差异（务必知悉）
| 方面 | mock（默认） | 真实模型（deepseek/qwen） |
| --- | --- | --- |
| 目的 | 只验证链路/约束/评测**跑通** | 产出真实审美搭配 |
| 单品选择 | 从候选池按槽位规则轮转拼装（真实 item_id，但非审美最优） | 依审美/画像/范例真正挑选 |
| 配饰（包/帽/围巾） | **不会主动选**（accessory 槽位留空 →“—”） | 会按需搭配 |
| 个性化 | 画像不同**结果往往相同**（千人一面） | 依画像差异化 |
| 外网/key | 不需要，离线可复现 | 需对应 API key |

**结论**：mock 结果用于验证“harness 与契约正确、item_id 指回目录正确”；`审美质感/个性化深度/创意`偏低是预期，真实效果请切 deepseek/qwen + 灌 800 单品后再评。**切换 provider 不需要改任何代码。**

---

## 6. 文件清单
```
eval/
├── run_eval.py                 # 主入口
├── eval_lib.py                 # 输入构造/调用/输出抽取（复用 model-service）
├── build_queries_matrix.py     # 生成覆盖矩阵
├── catalog.sample.json         # 样例单品池（28 件，800 来了替换）
├── queries.json                # 50 条 query 制题集
├── queries_matrix.md           # 覆盖矩阵（生成物）
├── review_guide.md             # 大众评审打分指南
├── README.md                   # 本文件
└── results/                    # 运行产物
    ├── outfits.jsonl
    ├── review_sheet.csv
    ├── review_sheet.xlsx
    └── review_sheet_personalization.csv
```
