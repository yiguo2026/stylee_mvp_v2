# Stylee 模型推理服务（model-service）

App 三个 AI 能力的本地推理服务：**服饰识别**（qwen3-vl-plus）、**单品标准化生图**（qwen-image-2.0）、**Garments2Look 搭配推荐**（DeepSeek + 向量 RAG）。

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

App 侧行为：服务在 → 三个能力走真模型；服务不在/挂了 → 自动回落旧逻辑（mock 识别 / 客户端直连 DeepSeek / 用原图），**不会阻塞任何功能**。

## 端点

| 端点 | 能力 | 模型 |
|---|---|---|
| `GET /health` | 存活检查 | - |
| `POST /recognize` | 识别衣物属性（类目/颜色/材质/照片类型） | qwen3-vl-plus |
| `POST /standardize` | 原图 → 白底标准商品图（临时 OSS URL，App 负责转存 Supabase） | qwen-image-2.0 |
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
│   ├── vision/              # 触点A: 识别(qwen3-vl-plus) + 标准化(qwen-image-2.0)
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
