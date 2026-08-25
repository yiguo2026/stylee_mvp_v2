#!/usr/bin/env python3
"""读取 queries.json，生成人类可读的覆盖矩阵 queries_matrix.md。

供产品检查：各维度取值 × 出现次数、交叉组合、边界题与个性化对比是否穷举到位。
用法： python build_queries_matrix.py [--queries queries.json] [--out queries_matrix.md]
"""
from __future__ import annotations

import argparse
import json
import os
from collections import Counter

DIMS = [
    ("scenario", "场景"),
    ("style", "风格"),
    ("color_system", "色系"),
    ("season", "季节"),
    ("temp_range", "温度区间"),
    ("gender", "性别"),
    ("special", "边界/特殊题型"),
    ("difficulty", "难度"),
    ("tier", "分层"),
]


def count_table(queries, key):
    c = Counter()
    for q in queries:
        v = (q.get(key) or "").strip() or "（未指定）"
        c[v] += 1
    return c


def md_table(title, counter):
    lines = [f"### {title}", "", "| 取值 | 出现次数 |", "| --- | --- |"]
    for val, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| {val} | {n} |")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queries", default="queries.json")
    ap.add_argument("--out", default="queries_matrix.md")
    args = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    qpath = args.queries if os.path.isabs(args.queries) else os.path.join(here, args.queries)
    opath = args.out if os.path.isabs(args.out) else os.path.join(here, args.out)

    queries = json.load(open(qpath, encoding="utf-8"))
    total = len(queries)
    paired = [q for q in queries if q.get("special") == "个性化对比"]

    out = [f"# Stylee 评测 Query 覆盖矩阵\n",
           f"- 总题量：**{total}** 条（含个性化对比成对题 {len(paired)} 条 / {len(paired)//2} 对）",
           f"- 说明：每个维度取值均应出现多次并交叉组合；边界题 4 类各 ≥2~3 条；个性化对比 4~6 对。\n"]

    for key, title in DIMS:
        out.append(md_table(f"{title}（{key}）", count_table(queries, key)))

    # 场景 × 风格 交叉（只列出现过的组合）
    cross = Counter()
    for q in queries:
        sc = (q.get("scenario") or "").strip() or "—"
        st = (q.get("style") or "").strip() or "（画像驱动/开放）"
        cross[(sc, st)] += 1
    out.append("### 场景 × 风格 交叉组合（出现过的）")
    out.append("")
    out.append("| 场景 | 风格 | 次数 |")
    out.append("| --- | --- | --- |")
    for (sc, st), n in sorted(cross.items()):
        out.append(f"| {sc} | {st} | {n} |")
    out.append("")

    # 分层 × 难度 交叉（回归成本视角：core 每轮跑，extended 周期跑）
    tier_diff = Counter()
    for q in queries:
        ti = (q.get("tier") or "").strip() or "—"
        di = (q.get("difficulty") or "").strip() or "—"
        tier_diff[(ti, di)] += 1
    out.append("### 分层 × 难度 交叉组合")
    out.append("")
    out.append("| 分层 | 难度 | 次数 |")
    out.append("| --- | --- | --- |")
    for (ti, di), n in sorted(tier_diff.items()):
        out.append(f"| {ti} | {di} | {n} |")
    out.append("")

    # 个性化对比对
    out.append("### 个性化对比成对题（文本相同 / 画像不同）")
    out.append("")
    out.append("| 对比组 | query文本 | 画像A | 画像B |")
    out.append("| --- | --- | --- | --- |")
    bases = {}
    for q in paired:
        qid = q["query_id"]
        base = qid[:-1] if qid[-1] in ("a", "b") else qid
        bases.setdefault(base, []).append(q)
    for base in sorted(bases):
        grp = sorted(bases[base], key=lambda x: x["query_id"])
        if len(grp) >= 2:
            out.append(f"| {base} | {grp[0]['text']} | {grp[0].get('profile_variant','')} | {grp[1].get('profile_variant','')} |")
    out.append("")

    with open(opath, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"[matrix] 写入 {opath}（{total} 条 query）")


if __name__ == "__main__":
    main()
