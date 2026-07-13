#!/usr/bin/env python3
"""本地推理服务入口。

    DEEPSEEK_API_KEY=.. DASHSCOPE_API_KEY=.. python3 serve.py --port 8000 --provider deepseek

--provider 决定 /recommend 的 LLM(mock/deepseek/qwen);识别/标准化按 DASHSCOPE key 有无自动真/mock。
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from stylee.service.server import run_server


def main() -> None:
    ap = argparse.ArgumentParser(description="Stylee 本地推理服务")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    ap.add_argument("--provider", default=os.environ.get("STYLEE_PROVIDER", "mock"),
                    help="mock|deepseek|qwen (/recommend 的 LLM)")
    args = ap.parse_args()
    srv = run_server(args.host, args.port, args.provider)
    print(f"Stylee 推理服务 → http://{args.host}:{args.port}  (provider={args.provider})")
    print("端点: GET /health · POST /recommend /recognize /standardize")
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        print("安全: 非本机监听默认要求 Supabase 用户 JWT (STYLEE_REQUIRE_AUTH=true)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
        print("\n已停止。")


if __name__ == "__main__":
    main()
