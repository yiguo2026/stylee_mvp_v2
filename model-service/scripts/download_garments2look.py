#!/usr/bin/env python3
"""下载 Garments2Look 的 B2 文本语料(仅 ~134MB),不碰 284GB 图片。

只下三类:
  - polyvore_outfit_v1.0_2512.json    (~31 MB)  全量 outfit 文本标注
  - mytheresa_outfit_v1.0_2512.json   (~102 MB) 同上
  - style-guide/**/*.md               (65 个风格指南 = 蒸馏好的审美规则)

明确不下:*_image_*.json(只是图片路径映射)、images/looks 的 .tar.gz(284GB 图)。

用法:
  python3 scripts/download_garments2look.py                 # → data/garments2look/
  python3 scripts/download_garments2look.py --dest /path     # 自定义目录
  python3 scripts/download_garments2look.py --dry-run        # 只列文件与大小,不下载
  python3 scripts/download_garments2look.py --no-style-guides
  python3 scripts/download_garments2look.py --validate       # 下完校验 JSON 可解析并计数

纯 stdlib urllib,自动走环境代理(HTTP(S)_PROXY);已存在且大小一致的文件会跳过(可断点续跑)。
数据集:https://huggingface.co/datasets/ArtmeScienceLab/Garments2Look (Apache-2.0, 非 gated)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

REPO = "ArtmeScienceLab/Garments2Look"
RESOLVE = f"https://huggingface.co/datasets/{REPO}/resolve/main/"
TREE_STYLE = f"https://huggingface.co/api/datasets/{REPO}/tree/main/style-guide?recursive=true"

OUTFIT_FILES = [
    "polyvore_outfit_v1.0_2512.json",
    "mytheresa_outfit_v1.0_2512.json",
]

_UA = {"User-Agent": "stylee-garments2look-downloader"}


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f}{unit}"
        n /= 1024


def _open(url: str, method: str = "GET", timeout: int = 60):
    return urllib.request.urlopen(
        urllib.request.Request(url, method=method, headers=_UA), timeout=timeout)


def remote_size(url: str) -> int | None:
    """HEAD 取最终(跟随重定向到 CDN 后)的 Content-Length。"""
    try:
        with _open(url, method="HEAD", timeout=30) as r:
            cl = r.headers.get("Content-Length")
            return int(cl) if cl else None
    except urllib.error.URLError:
        return None


def list_style_guides() -> list[str]:
    try:
        with _open(TREE_STYLE, timeout=30) as r:
            tree = json.load(r)
        return sorted(e["path"] for e in tree if e.get("path", "").endswith(".md"))
    except Exception as e:  # noqa: BLE001
        print(f"  [!] 取 style-guide 列表失败:{e}")
        return []


def download(path: str, dest_dir: str, expected: int | None) -> tuple[bool, int]:
    """下载单个文件;返回 (是否真下了, 字节数)。已存在且大小一致则跳过。"""
    url = RESOLVE + path
    dest = os.path.join(dest_dir, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)

    if os.path.exists(dest) and expected and abs(os.path.getsize(dest) - expected) <= 1024:
        print(f"  跳过(已存在) {path}  {_human(os.path.getsize(dest))}")
        return False, os.path.getsize(dest)

    tmp = dest + ".part"
    try:
        with _open(url, timeout=120) as r:
            total = int(r.headers.get("Content-Length") or expected or 0)
            done = 0
            with open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)  # 1MB
                    if not chunk:
                        break
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        pct = done * 100 // total
                        print(f"\r  下载 {path}: {pct}% "
                              f"({_human(done)}/{_human(total)})", end="", flush=True)
                    else:
                        print(f"\r  下载 {path}: {_human(done)}", end="", flush=True)
        print()
        os.replace(tmp, dest)
        return True, done
    except Exception as e:  # noqa: BLE001
        if os.path.exists(tmp):
            os.remove(tmp)
        print(f"\n  [!] 下载失败 {path}:{e}")
        raise


def validate_outfit_json(dest_dir: str) -> None:
    for f in OUTFIT_FILES:
        p = os.path.join(dest_dir, f)
        if not os.path.exists(p):
            continue
        try:
            with open(p, encoding="utf-8") as fh:
                data = json.load(fh)
            sample = next(iter(data.values())) if isinstance(data, dict) else {}
            keys = list((sample.get("outfit_info") or {}).keys())
            print(f"  ✓ {f}: {len(data)} 套穿搭;outfit_info 字段={keys[:6]}")
        except Exception as e:  # noqa: BLE001
            print(f"  [!] {f} 解析失败:{e}")


def main() -> None:
    ap = argparse.ArgumentParser(description="下载 Garments2Look 文本语料(B2 用)")
    ap.add_argument("--dest", default="data/garments2look", help="目标目录")
    ap.add_argument("--dry-run", action="store_true", help="只列文件与大小,不下载")
    ap.add_argument("--no-style-guides", action="store_true", help="不下 style-guide/*.md")
    ap.add_argument("--validate", action="store_true", help="下完校验 JSON 并计数")
    args = ap.parse_args()

    style_guides = [] if args.no_style_guides else list_style_guides()
    targets = list(OUTFIT_FILES) + style_guides
    print(f"目标目录:{os.path.abspath(args.dest)}")
    print(f"待处理:{len(OUTFIT_FILES)} 个 outfit JSON + {len(style_guides)} 个 style-guide\n")

    if args.dry_run:
        total = 0
        for f in OUTFIT_FILES:           # 只对大文件做 HEAD(md 太小不值当)
            sz = remote_size(RESOLVE + f)
            total += sz or 0
            print(f"  {f:<40} {_human(sz) if sz else '?'}")
        for f in style_guides:
            print(f"  {f}")
        print(f"\n[dry-run] 两个 JSON 合计约 {_human(total)};style-guide {len(style_guides)} 个(各几KB)")
        print("去掉 --dry-run 即开始下载。")
        return

    os.makedirs(args.dest, exist_ok=True)
    sizes = {f: remote_size(RESOLVE + f) for f in OUTFIT_FILES}
    downloaded_bytes = 0
    for f in OUTFIT_FILES:
        _, n = download(f, args.dest, sizes.get(f))
        downloaded_bytes += n
    for f in style_guides:
        _, n = download(f, args.dest, None)
        downloaded_bytes += n

    print(f"\n完成。语料位于 {os.path.abspath(args.dest)}/(总计约 {_human(downloaded_bytes)})")
    if args.validate:
        print("校验 outfit JSON:")
        validate_outfit_json(args.dest)
    print("\n下一步:用这些 outfit JSON 做 ETL → exemplars.jsonl,接 B2 检索器替掉 stub。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已中断。"); sys.exit(130)
