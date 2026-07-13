# Stylee 模型推理服务（model-service）

App 三个 AI 能力的本地推理服务：**服饰识别**（qwen3-vl-plus）、**单品标准化生图**（qwen-image-edit）、**Garments2Look 搭配推荐**（DeepSeek + 向量 RAG）。

安全边界、模型路由、生产部署和双仓同步规则见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。第一次配置 key 可逐步照着 [`LOCAL_SETUP.md`](LOCAL_SETUP.md) 操作。

- **纯 Python 标准库，零 pip 依赖**——系统有 `python3`（≥3.9）即可，无需 venv / pip install。
- API key 只存在服务进程的环境变量里，App 端零 key。
- 语义向量索引（3000 套穿搭 × 1024 维）已随仓提交，**clone 即完整功能**。

## 快速开始（3 步闭环）

```bash
# 1. 起服务（key 找 fitzw 拿；必须在 model-service 目录下运行——索引按相对路径加载）
cd model-service
DEEPSEEK_API_KEY=<deepseek的key> DASHSCOPE_API_KEY=<qwen的key> \
  python3 serve.py --provider deepseek

# 2. 另开终端，验证服务（应输出 health: true + 三个能力的真实结果，recommend trace 应为 rag_mode: 'vector'）
node scripts/styleeSmoke.ts        # 在仓库根目录跑

# 3. 起 App（.env 不用改，默认就是 http://127.0.0.1:8000）
npm start
```

App 侧行为：服务在 → AI 能力走真模型；服务不在/挂了 → 自动回落 mock / 预置结果 / 原图。App 绝不直连 DeepSeek 或 DashScope。

## 生产安全配置

公开监听（例如 `--host 0.0.0.0`）会默认要求 Supabase 用户 JWT。至少设置：

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
STYLEE_ALLOWED_ORIGINS=https://yiguo2026.github.io \
STYLEE_REQUIRE_AUTH=true \
python3 serve.py --host 0.0.0.0 --provider deepseek
```

这里的 Supabase URL/publishable key 仅用于向主仓 Supabase Auth 验证用户 access token，不读取业务表。注册仍由 App 的 Supabase Auth + 数据库 trigger 负责；model service 不接收 Supabase secret/service-role key。服务默认按用户限流 20 次/分钟，可用 `STYLEE_RATE_LIMIT_PER_MINUTE` 调整。

文本模型默认使用 DeepSeek Flash，并用 `LLM_MAX_TOKENS=2048` 限制单次输出成本；只有经过质量/成本评测后才应显式设置 `DEEPSEEK_MODEL_GEN` 使用更贵模型。

### 获得生产 HTTPS 地址

仓库提供 `Dockerfile` 和 `render.yaml`。在 Render 中用本仓库创建 Blueprint，首次创建时在 Dashboard 填写所有 `sync: false` 的服务端密钥；部署完成后会得到 `https://<service>.onrender.com`。把该 URL 写到 App 仓库的 GitHub Variable `EXPO_PUBLIC_STYLEE_API`，不要写入任何模型 key。

Blueprint 默认关闭自动部署，首次使用免费实例完成 HTTPS 与真模型 smoke test，不会自动产生实例费用。免费实例会休眠并产生冷启动，正式承载用户流量前应评估并由管理员明确升级实例。模型请求最长可达 60–120 秒。

## 端点

| 端点 | 能力 | 模型 |
|---|---|---|
| `GET /health` | 存活检查 | - |
| `POST /recognize` | 识别衣物属性（类目/颜色/材质/照片类型） | qwen3-vl-plus |
| `POST /standardize` | 原图 → 白底标准商品图（临时 OSS URL，App 负责转存 Supabase） | qwen-image-edit |
| `POST /recommend` | 衣橱+场景 → 3 套搭配+理由（B0-B6 链路，仅 2 次 LLM 调用） | DeepSeek flash/pro |

注意：`/recommend` 真实生成耗时约 40~60s（App 侧超时 90s），`/standardize` 约 20~40s，属正常。

## 跑测试（全离线，不需要 key）

```bash
cd model-service
for t in test_*.py; do python3 "$t"; done   # 每个都应打印 ok
```

## 不带 key 也能起服务（mock 模式）

```bash
cd model-service && python3 serve.py        # provider 默认 mock，三端点返回假数据，联调 App 够用
```

## 可选：重建向量索引

仓里的索引开箱即用，一般不用动。只有想换语料/换 embedding 模型时才需要：

```bash
cd model-service
python3 scripts/download_garments2look.py            # 下载原始语料(~134MB, gitignore)
python3 scripts/build_exemplars.py                   # 抽取 exemplars(~3000套)
DASHSCOPE_API_KEY=<key> EMBED_MODEL=text-embedding-v4 python3 scripts/build_index.py
```

索引 signature 与运行期 embedder 不匹配时（例如没带 DASHSCOPE key 起服务），B2 自动降级为关键词检索（`trace.rag_mode: fallback`），推荐功能不受影响，只是范例检索质量下降。

## 代码结构

```
model-service/
├── serve.py                 # 启动入口: python3 serve.py --port 8000 --provider deepseek
├── stylee/
│   ├── service/             # HTTP 层: server.py 路由 + adapter.py App⇄契约翻译
│   ├── vision/              # 触点A: 识别(qwen3-vl-plus) + 标准化(qwen-image-edit)
│   ├── ingest.py            # 入库管线编排
│   ├── pipeline.py          # 触点B: B0-B6 推荐链路
│   ├── rag.py / embeddings.py / vectorstore.py   # B2 向量检索(Garments2Look)
│   ├── providers/           # DeepSeek/Qwen/Mock provider(openai 兼容,urllib 实现)
│   └── contracts.py / constraints.py / scoring.py
├── scripts/                 # 语料下载/exemplars 构建/索引重建
├── data/garments2look/      # exemplars.jsonl + 1024维向量索引(随仓)
└── test_*.py                # 离线测试,python3 直接跑
```

架构说明详见根 README「接入本地模型服务」一节与飞书文档《Stylee 模型服务能力架构》。
