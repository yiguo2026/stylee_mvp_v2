# 本地密钥配置（不熟悉 Bash 也可以照做）

不要把 DeepSeek、Qwen/DashScope 或 Supabase secret key 发到聊天、截图、邮件或 GitHub。下面的文件只保存在你的电脑，并已被 Git 忽略。

## 一、打开正确目录

1. 在 Mac 上打开“终端”应用。
2. 复制下面整行，粘贴到终端，按回车：

```bash
cd /Users/bytedance/Documents/styleetest1/model-service
```

3. 复制下面整行，粘贴并按回车。它会从安全模板创建本地配置文件：

```bash
cp .env.example .env
```

如果以后重复执行并被询问是否覆盖，请输入 `n`，不要覆盖已经填好的 key。

## 二、用 TextEdit 编辑，不需要使用命令行编辑器

仍在同一个终端窗口中执行：

```bash
open -e .env
```

TextEdit 会打开 `.env`。把 `=` 右侧的示例值替换成真实值：

```text
DEEPSEEK_API_KEY=你的新DeepSeekKey
DASHSCOPE_API_KEY=你的新QwenDashScopeKey
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_开头的值
SUPABASE_SECRET_KEY=sb_secret_开头的值

STYLEE_ALLOWED_ORIGINS=https://yiguo2026.github.io
STYLEE_REQUIRE_AUTH=true
STYLEE_RATE_LIMIT_PER_MINUTE=20
LLM_MAX_TOKENS=2048
```

注意：

- 不要在值外面加引号。
- `=` 左右不要加空格。
- Qwen 使用阿里云百炼/DashScope key，变量名是 `DASHSCOPE_API_KEY`。
- 必须使用已经轮换的新 key；被盗刷过的旧 key 不能继续使用。
- 按 `Command + S` 保存，然后关闭 TextEdit。

## 三、启动本地 model service

回到刚才的终端窗口，逐行执行：

```bash
set -a
source .env
set +a
python3 serve.py --provider deepseek
```

看到服务监听 `http://127.0.0.1:8000` 后，保持这个终端窗口打开。停止服务时按 `Control + C`。

不要用 `cat .env`、不要把 `.env` 内容复制给任何人。需要让 Codex 做真实 smoke test 时，只回复“本地 .env 已配置”，Codex 可以运行测试而不打印文件内容。

## 四、生产 Render 配置

本地 `.env` 不会自动上传到 Render。创建 Render 服务时，在 Dashboard 的 Environment 页面逐项新增同名变量：

```text
DEEPSEEK_API_KEY
DASHSCOPE_API_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
STYLEE_ALLOWED_ORIGINS
STYLEE_REQUIRE_AUTH
STYLEE_RATE_LIMIT_PER_MINUTE
LLM_MAX_TOKENS
```

只把值粘贴到 Render 的 Secret/Environment 输入框，不要放进 GitHub Variable。App 的 GitHub Variable 只保存公开服务地址：

```text
EXPO_PUBLIC_STYLEE_API=https://你的服务.onrender.com
```
