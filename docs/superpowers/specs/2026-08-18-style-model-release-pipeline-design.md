# Stylee 模型服务单一源码与可靠发布设计

## 背景与已核实事实

Stylee 当前存在三种容易混淆的状态：App 仓库中的内嵌模型服务镜像、`fitzw/style-model` 的最新主分支，以及 Render 当前线上部署。此次审计得到以下可复现结论：

1. `style-model/main@0f19c8e` 与 Stylee PR #17 中 `model-service/stylee/` 的 Python 运行源码完全一致。
2. 两边 15 个 `test_*.py` 文件完全一致，离线测试和 HTTP smoke 均通过。
3. Render 当前生产部署仍是 `fitzw/style-model:codex/model-service-security@41b8d68`，落后最新 `main` 26 个提交。
4. Stylee 镜像包含约 15 MB、3000 条 Garments2Look 向量索引；`style-model` 与 Render 部署包没有这些数据，因此推荐会降级到 6 条关键词范例。
5. Render 当前 `autoDeployTrigger: off`，合并模型 PR 不会自动更新线上实例。
6. 当前 `/health` 只返回 `{"status":"ok"}`，无法证明线上运行的仓库、分支、提交和 RAG 状态。

## 目标

- `fitzw/style-model` 成为模型服务运行代码、部署配置、测试和 RAG 资源的唯一权威来源。
- Stylee 保留一份可本地联调的完整镜像，但镜像只能自动从指定的 canonical 提交生成，不再手工双改。
- Render 只部署通过 CI 的明确 `style-model` 提交，并能从 `/health` 直接核实线上版本。
- 模型服务部署完成并通过线上 smoke 后，App PR 才允许合并。
- 后续开发者在一个仓库完成模型修改，不需要手工维护两份实现。

## 非目标

- 不改变 DeepSeek、Qwen、Supabase Auth 的服务边界。
- 不把任何模型密钥、Render deploy hook 或测试账号凭证提交到 Git。
- 不修改现有 App 推荐、识别、透明图和试穿接口的业务合同。
- 不在本轮引入对象存储、Git LFS、独立制品仓库或新的数据库。
- 不处理旧 PR #2 的业务逻辑；它的冲突状态不影响当前 `main`。

## 方案选择

### 方案 A：继续手工维护两个仓库

优点是无需新增脚本；缺点是当前事故已经证明它会造成代码、数据和部署版本漂移，因此不采用。

### 方案 B：移除 Stylee 镜像，只保留远端服务

能彻底消除重复代码，但会降低本地一仓联调效率，并使 App 的接口回归依赖外部服务，不采用。

### 方案 C：canonical 单一源码 + 自动生成镜像（采用）

模型代码只在 `style-model` 修改。Stylee 通过固定提交 SHA 自动同步完整镜像；CI 校验镜像、测试和数据清单。该方案保留本地联调便利，同时消除手工双改。

## 权威边界

### `fitzw/style-model`

负责：

- `stylee/` Python 运行源码；
- `serve.py`、`Dockerfile`、`render.yaml`、`requirements.txt`；
- 全部 `test_*.py`；
- Garments2Look RAG 索引和数据清单；
- 模型服务 CI、Render 部署和线上 smoke。

### `yiguo2026/stylee_mvp_v2`

负责：

- Expo App、TypeScript 服务客户端和界面；
- `model-service/` 的生成式镜像；
- `model-service/UPSTREAM_COMMIT`，记录镜像对应的 canonical SHA；
- App CI 中的镜像一致性和接口合同测试。

Stylee 的 `model-service/` 不再接受独立业务修改。需要修改模型能力时，必须从 `style-model` 发起。

## RAG 数据交付

当前索引只有约 15 MB，低于 GitHub 单文件 100 MB 限制。为降低本轮复杂度，将现有三个文件直接加入 canonical 仓库：

- `data/garments2look/index.meta.json`
- `data/garments2look/exemplars.jsonl`
- `data/garments2look/exemplars.vecs`

新增 `data/garments2look/manifest.json`，记录：

- `schema_version`
- `signature`
- `dim`
- `count`
- 三个文件的 SHA-256

CI 必须验证文件存在、哈希一致、`signature=openai_compat:text-embedding-v4:1024`、`dim=1024`、`count=3000`。Docker 使用现有 `COPY . /app` 将索引纳入生产镜像。

当索引总量超过 50 MB 时，再单独设计版本化制品下载；本轮不提前引入对象存储。

## 线上版本可观测性

`GET /health` 扩展为只返回安全标量：

```json
{
  "status": "ok",
  "service": "stylee-model-service",
  "contract_version": "2026-08-18",
  "git_sha": "0f19c8e...",
  "git_branch": "main",
  "repo_slug": "fitzw/style-model",
  "rag": {
    "artifact_available": true,
    "signature": "openai_compat:text-embedding-v4:1024",
    "count": 3000
  }
}
```

`git_sha`、`git_branch` 和 `repo_slug` 分别读取 Render 官方提供的 `RENDER_GIT_COMMIT`、`RENDER_GIT_BRANCH` 和 `RENDER_GIT_REPO_SLUG`。本地运行时使用 `local`，不读取 Git 历史或执行子进程。

健康检查不得返回密钥、内部地址、用户信息、模型响应或数据文件路径。

## CI 与 Render 部署

### Canonical CI

`style-model/.github/workflows/ci.yml` 在 PR 和 `main` push 上执行：

1. 安装 `requirements.txt`；
2. 自动发现并执行全部 `test_*.py`，不使用硬编码列表；
3. 校验 RAG manifest；
4. 构建 Docker 镜像，确保生产依赖可安装。

### 精确提交部署

保留 Render 自动部署关闭状态。`main` CI 全绿后，由 GitHub Action 调用保存在 `RENDER_DEPLOY_HOOK_URL` secret 中的 deploy hook，并附加 `ref=${GITHUB_SHA}`，确保 Render 构建刚通过测试的同一提交。

这是官方支持的精确提交部署方式；部署 hook 是秘密，不写入日志和代码。

### 部署后验证

部署 Action 必须：

1. 轮询 `/health`；
2. 要求 `git_sha == GITHUB_SHA`；
3. 要求 `contract_version == 2026-08-18`；
4. 要求 `rag.artifact_available == true`、`rag.count == 3000`；
5. 使用 GitHub Secrets 中的专用 Supabase 测试账号取得短期 access token；
6. 执行 `/recognize-multi`、`/standardize`、`/recommend` 和 `/tryon-image` 的安全 smoke；
7. smoke 只记录 request ID、状态、阶段、耗时和合同标量，不记录图片 base64、token 或密钥。

若尚未配置测试账号 secret，部署流程在公开 health 校验后明确标记为“部署成功、真实 provider smoke 待人工”，不得伪装成完整发布通过。

## Stylee 镜像同步

新增 `scripts/sync-model-service.sh`：

- 输入 canonical checkout 路径或 Git SHA；
- 只同步受治理的运行源码、部署文件、全部测试和 RAG 数据；
- 更新 `model-service/UPSTREAM_COMMIT`；
- 不覆盖 Stylee 独有的 `UPSTREAM.md` 和 App 文档；
- 同步后自动运行一致性检查。

改造 `scripts/check-model-service-sync.sh`：

- 动态比较全部 `test_*.py`，避免遗漏新测试；
- 比较完整 `stylee/`、部署文件和 RAG manifest/数据；
- 校验 `UPSTREAM_COMMIT` 与 canonical HEAD 一致；
- 对额外或缺失的受治理文件失败关闭。

Stylee GitHub CI 根据 `UPSTREAM_COMMIT` 拉取 canonical 快照并执行检查。若仓库是私有的，使用只读 `STYLE_MODEL_READ_TOKEN` secret；token 不进入构建产物。

## 发布顺序与门禁

1. 在 `style-model` 创建 PR，完成代码、测试和数据修改。
2. CI 全绿后合并 `style-model/main`。
3. 部署 Action 将该 SHA 发布到 Render。
4. `/health` 证明线上 SHA、合同版本和 RAG 状态正确。
5. 完成真实 provider smoke。
6. 自动生成或更新 Stylee 镜像提交和 `UPSTREAM_COMMIT`。
7. Stylee CI 验证镜像与已部署 SHA 一致。
8. 最后合并 App PR。

任何一步失败都停止后续发布，不允许“先合并 App 再补服务”。

## 首次迁移

1. 从最新 `style-model/main` 建立发布流水线分支。
2. 将 Stylee 现有 3000 条索引复制到 canonical，并生成 manifest。
3. 增加 health 版本字段、CI 和 deploy workflow。
4. 配置 `RENDER_DEPLOY_HOOK_URL` 及可选 smoke 测试账号 secrets。
5. 合并并部署 canonical。
6. 线上核对 SHA、合同和 RAG。
7. 使用同步脚本更新 Stylee PR #17，写入准确的 `UPSTREAM_COMMIT`。
8. App PR #17 保持 Draft，直到服务端发布验证完成。

## 测试与验收

- canonical 与镜像运行源码逐文件一致；
- canonical 与镜像全部 15 个测试均通过；
- RAG manifest 哈希测试先失败再通过；
- health 版本合同测试先失败再通过；
- 同步脚本对代码、测试、数据或 SHA 任一漂移均返回非零；
- Docker 构建成功并包含 RAG 文件；
- Render `/health` 返回本次部署的准确 SHA；
- 线上推荐 trace 显示 `rag_mode=vector`，不再是 `fallback`；
- 真实原图识别、透明主图、推荐和试穿 smoke 通过；
- App PR #17 的 CI 验证其 `UPSTREAM_COMMIT` 已在线上部署。

## 回滚

- Render deploy hook 使用明确 SHA，可重新部署上一已验证 SHA；
- App 在服务端合同不匹配时不合并；
- RAG 索引校验失败时服务仍可安全回退关键词，但发布门禁判定失败；真实 smoke 的推荐 trace 负责证明运行态 `rag_mode=vector`；
- 回滚不修改用户数据库、不删除衣橱数据，也不重处理历史图片。
