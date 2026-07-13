# App ↔ 本地推理服务接入 设计（子项目 2）

> **已废弃（安全原因）**：本文记录早期“服务失败后客户端直连模型”的方案。当前实现禁止 App/Web 持有或直连 DeepSeek、DashScope、Ark 及 Supabase service-role key；以根 README、`model-service/README.md` 与 `docs/security/model-api-incident-response.md` 为准。

> Stylee 三大模型能力（服饰识别 / 单品标准化 / Garments2Look 搭配推荐）通过**本地 Python 推理服务**接入 App（`stylee_mvp_v2`）。本文件是子项目 2 的设计规格。子项目 1（推理服务本身）已完成，在模型仓 `style05` 的 `stylee/service/`（`serve.py` 启动）。

## 目标

App 侧三个能力"**先打本地服务、失败回落今天的行为**"：
1. **识别** `aiRecognizeClothing` → `POST /recognize`
2. **标准化**（新环节）入库时自动生成单品标准图 → `POST /standardize`
3. **推荐** `aiRecommendOutfits` → `POST /recommend`（Garments2Look）

## 架构

新增一个**瘦客户端** `src/lib/styleeService.ts` 包住三个本地端点 + base64 转换；`src/lib/ai.ts` 里三个函数各自"先服务、后回落"；入库页 `src/app/wardrobe/add.tsx` 加"标准图"环节。**服务不可达 = 完全回到今天的行为 + 一次轻提示**，零功能回归风险。

```
add.tsx ──uri──> aiRecognizeClothing ─┐
                 aiStandardizeGarment ─┼─> styleeService ──HTTP──> 本地服务:8000 ──> 千问/DeepSeek
result.tsx ────> aiRecommendOutfits ──┘        (失败→null)              (adapter 翻译契约)
                        │ null 时
                        └─> 现有 Ark/DeepSeek/mock 回落
```

## Global Constraints（每个任务都隐含遵守）

- **基准**：在**当前本地工作区**（分支 `feat/model-service-integration`，base 快照 `25fe756`）上做。**不 push**。
- **push 前欠债**（记录、暂不做）：对齐 `origin/main` 的 +3 commit —— `secrets.ts` key 重构、视觉重构 v3.6、分类枚举更新。届时 `EXPO_PUBLIC_STYLEE_API` 应迁入 `secrets.ts`，UI 用新主题。
- **不改 `src/app/outfit/result.tsx`**：保持 `aiRecommendOutfits(items, userId, sessionId, context)` 签名不变，接入全部在 `ai.ts` 内部完成。
- **Expo v55**：动 UI 前读 https://docs.expo.dev/versions/v55.0.0/ 。
- **回落 + 轻提示**：服务不可达时静默回落到现有路径，并给一次非阻塞轻提示（不弹 Alert 打断）。
- **零新依赖**：只用 `fetch` + `AbortController` + 现有 `expo-image-picker`/RN 原生能力，不引入第三方 HTTP 库。
- **服务地址**：`EXPO_PUBLIC_STYLEE_API ?? 'http://127.0.0.1:8000'`。

## 本地服务契约（子项目 1 已实现，此处照抄）

- `GET /health` → `200 {"status":"ok"}`
- `POST /recognize`　req `{image_b64, mime}` → `{category, color, material, style, brand, photo_type, needs_review, confidence}`
  - `category` 为中文（上装/下装/连体装/外套/鞋/包/帽子/围巾）；`photo_type` ∈ `on_body|flat|product`。
- `POST /standardize`　req `{image_b64, mime, photo_type, item:{category}}` → `{image_ref, method, verified}`
  - `image_ref` 是**临时 OSS URL**（会过期），必须尽快 `uploadWardrobeImage` 转存 Supabase。
- `POST /recommend`　req `{input_mode:"nl", query, n, profile:{gender,body_shape,skin_tone,style_prefs[]}, weather:{temp_c,condition,city,time_of_day}, wardrobe:[{item_id,name,category,color,material,sleeve_length,fit,season[],occasion_tags[]}]}`
  → `{outfits:[{name, owned_item_ids[], recommended_items:[{name,category,color,description}], comment}], trace:{rag_mode,pool}}`
  - 返回已是 **App 形状**（adapter 已翻译），outfits 直接喂现有 `aiRecommendOutfits` 的解析循环即可。

## 组件

### 1. `src/lib/styleeService.ts`（新）
纯 I/O 瘦客户端，全部失败返回 `null`，绝不抛给调用方。

```ts
const STYLEE_API = process.env.EXPO_PUBLIC_STYLEE_API ?? 'http://127.0.0.1:8000';

uriToBase64(uri): Promise<{ b64: string; mime: string } | null>
  // 复用 ark.ts 里 fetch→blob→FileReader 的写法，去掉 data: 前缀

serviceRecognize(b64, mime): Promise<RecognizeResp | null>       // POST /recognize, timeout 20s
serviceStandardize(b64, mime, photoType, category): Promise<StandardizeResp | null>  // POST /standardize, timeout 40s
serviceRecommend(payload: RecommendReq): Promise<RecommendResp | null>  // POST /recommend, timeout 40s
```
- 每个 POST 用 `AbortController` 超时；`!res.ok` 或异常 → `null` + `console.warn`。
- 首个失败触发一次**轻提示**（全局一次性 flag，见组件 4）。

### 2. `src/lib/ai.ts`（改，仅动相关函数体，不碰 `INTENT_SYSTEM_PROMPT`）
- `aiRecognizeClothing(uri)`：`uriToBase64` → `serviceRecognize` → 命中则回填并**把 `photo_type`/`needs_review` 也带出**（扩 `RecognitionResult` 可选字段）；未命中 → 现有 Ark → mock。
- `aiStandardizeGarment(uri, category, photoType): Promise<string | null>`（新）：`uriToBase64` → `serviceStandardize` → 返回临时 OSS URL 或 `null`。
- `aiRecommendOutfits(...)`（签名不变）：先 `WardrobeItem[]`+`context` → `RecommendReq`（`fit_type`→`fit`，`stylePreferences` 拆成 `style_prefs`，`temp`→`temp_c`，`input_mode:"nl"`，`n:3`）→ `serviceRecommend`；命中则把 `resp.outfits` 喂**现有解析循环**产出 `Outfit[]`；未命中 → 现有 DeepSeek → mock。

### 3. `src/app/wardrobe/add.tsx`（改，在 Codex 的 `activeUser` 基础上叠）
入库标准化 UX（用户已定：**自动生成**，并明确要"生成中/完成"的可感知反馈）：
- 新状态：`standardizedUri: string | null`、`stdState: 'idle'|'generating'|'done'|'failed'`、`useStandardized: boolean`（默认 true）、`photoType: string`。
- 流程：选图 → 立即显原图 → 跑识别（沿用现有"AI 识别中…"遮罩）→ 识别完拿到 `photo_type` → **自动**调 `aiStandardizeGarment`：
  - `generating`：图上叠一层非阻塞"标准化中…"角标 + spinner；**表单可继续编辑**（不锁）。
  - `done`：预览**自动切到标准图** + 出现分段切换 `原图 | 标准图`（默认选标准图）+ 小字"✓ 已生成标准图"。→ 用户可感知"完成"并可切换。
  - `failed`：不出切换，小字"标准图生成失败，用原图"（即"轻提示"）。
- 保存：对**当前选中的图**（原图或标准图）`uploadWardrobeImage` 转存 Supabase（标准图是临时 OSS URL，靠这一步持久化）→ `addItem`。若标准化仍 `generating`，保存用当前选中（此时是原图），不阻塞。

### 4. 轻提示（服务不可达）
一个极简的全局一次性提示：`styleeService` 首次探测到服务不可达时，`console.warn` + 触发一个轻量非阻塞 UI 反馈（RN `ToastAndroid` 仅安卓；跨端用页面内小 banner/角标，不弹 `Alert`）。文案："未连接本地模型服务，已用备用方案"。同一会话只提示一次。

### 5. 配置与文档
- `.env.example`：加 `EXPO_PUBLIC_STYLEE_API=http://127.0.0.1:8000` + 一行说明。
- README（或 docs）：一行"本地起服务：在模型仓 `python3 serve.py --provider dashscope`；App 设 `EXPO_PUBLIC_STYLEE_API`"。

## 数据流

- **识别**：本地图 uri → base64 → `/recognize` → 回填表单 + 存 `photo_type`。
- **标准化**：uri + `category` + `photo_type` → base64 → `/standardize` → 临时 OSS URL → 预览；保存时 `uploadWardrobeImage` 转存。
- **推荐**：`WardrobeItem[]`（映射字段）+ `context` → `/recommend` → `resp.outfits`（App 形状）→ 现有解析循环 → `Outfit[]`。

## 错误处理

- 三个能力任一服务调用失败/超时 → `null` → 走现有回落（mock 识别 / 客户端 DeepSeek 推荐 / 跳过标准化用原图）+ 一次轻提示。
- `uploadWardrobeImage` 失败 → 保留原逻辑（本地 uri 兜底）。
- 标准化临时 URL 转存失败 → 回退用原图保存（不阻断入库）。

## 测试策略

- **纯映射函数**（`WardrobeItem[]`+context → `RecommendReq`；`/recognize` resp → `RecognitionResult`；`/standardize` resp → 选图逻辑）抽成可单测的纯函数，用仓库现有测试工具跑（规划时确认 App 是否配 jest；若无，用可独立 `node`/`tsx` 运行的脚本，断言映射正确）。
- **集成 smoke**（对**真在跑**的本地服务）：一个 TS/node 脚本，base64 一张图 + 样例衣橱，打三个端点，断言字段齐全（对标模型仓 `svc_smoke.py`）。
- **回落路径**：断开服务（改 `EXPO_PUBLIC_STYLEE_API` 到坏端口）→ 断言三能力都回到现有行为、且只轻提示一次。

## 非目标（YAGNI）

- 不动全身试穿生图 `aiGenerateTryOnImage`（另一能力）。
- 不做多端 LAN IP 自动发现（本地开发默认 `127.0.0.1`）。
- 不做标准化结果缓存、不做重试队列。
- 本轮不迁 `secrets.ts` / 不对齐视觉重构（列为 push 前欠债）。
