"""获取 Supabase 用户 access_token（供 run_eval_remote 使用）。"""
from __future__ import annotations
import json
import os
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pdgocqjvncxkwfrcdhtj.supabase.co").rstrip("/")
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
EMAIL = os.environ.get("STYLEE_EVAL_EMAIL", "eval_bot@stylee.test")
PASSWORD = os.environ.get("STYLEE_EVAL_PASSWORD", "StyleeEval#2026")


def _load_anon_from_env_file() -> str:
    # 从仓库根 .env 读取 anon key
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.abspath(os.path.join(here, "..", "..", ".env"))
    key = ""
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_SUPABASE_ANON_KEY="):
                    key = line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    return key


def get_access_token() -> str:
    anon = ANON_KEY or _load_anon_from_env_file()
    if not anon:
        raise RuntimeError("缺少 SUPABASE anon key")
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode("utf-8")
    req = urllib.request.Request(
        SUPABASE_URL + "/auth/v1/token?grant_type=password",
        data=body,
        headers={"apikey": anon, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"登录失败: {data}")
    return token


if __name__ == "__main__":
    print(get_access_token())
