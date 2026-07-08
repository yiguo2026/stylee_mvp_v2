# AI 用量看板

监控每一次 DeepSeek / Qwen 调用的 usage 与成本，团队级、跨机器、100% 覆盖。

## 组成

1. **埋点**（`src/lib/aiUsage.ts` + 已插入 `deepseek.ts`/`dashscope.ts` 唯一出口）：每次调用抓官方 `usage` → 算成本 → 非阻塞写入 Supabase。埋在唯一出口，当前与未来所有调用自动被记，不漏。
2. **落库**：Supabase 表 `ai_usage_logs`（建表脚本 `supabase-ai-usage.sql`）。
3. **看板**：本目录 `index.html`，单文件网页，读 Supabase 出图。

## 启用（一次性）

1. **建表**：在 Supabase SQL Editor 执行仓库根目录的 `supabase-ai-usage.sql`。
2. **开发者标识**：每人在自己的 `.env` 里设 `EXPO_PUBLIC_DEV_TAG=你的名字`（用于按人区分用量；不设则记 `unknown`）。
3. **填 Qwen 单价**（可选，但填了成本才准）：`src/lib/aiUsage.ts` 顶部 `PRICING` 里 qwen 系列价格去阿里云百炼控制台核对后填入。DeepSeek 已是官方实价。
4. **看板**：直接用浏览器打开 `index.html`（或托管到任意静态站/GitHub Pages）。首次填入 Supabase URL + anon key（公开密钥，看板只读，存浏览器本地），即可看：总成本、按功能/模型/开发者、每日趋势、最近调用明细。

## 看什么

- **总成本 / 调用次数 / tokens / 生图张数 / reasoning tokens**（reasoning 高说明用了推理模型，选衣这类任务是浪费）
- **成本按功能**：哪个功能最烧钱（如 standardize / tryon-image 生图）
- **成本按模型**：flash vs pro vs qwen-image
- **成本按开发者**：谁的测试用量大
- **每日趋势**：定位是哪天、哪次批量测试拉高的

## 兜底

DeepSeek / 百炼控制台永远是按 key 计费的 100% 铁账。本看板是加"拆到功能 / 人 / 次"的**归因**层。想按人彻底分开，可给每人发**独立 API key**，控制台即按 key 分列。
