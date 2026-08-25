#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Stylee 搭配评测 · 只产出模型第一推荐(Top1)。

复用既有 in-process 链路 (eval_lib.run_one -> adapter+pipeline.recommend)，
不改 model-service 源码；仅在本脚本内对 pipeline.build_candidate_pool 做一层
"每槽位候选上限"封装——因为更新后的衣橱有 3380 件，B1 过滤后每槽仍有数百件，
无论 mock 还是真实模型都无法直接消费（mock 会对 4 槽做笛卡尔积而爆炸；真实模型
则 prompt 过大）。封装后每条 query 从更新衣橱中按类目稳定抽样 CAP 件构成候选池，
可复现（seed=query_id），既让新单品有机会被选中，又保证链路能跑通。

产物 (results_v2_top1/):
  - outfits_top1.jsonl   每行一条 query，仅含 rank1(Top1) 搭配 + 四维分 + 理由
  - top1_summary.csv     Top1 简明清单（编号/题目/场景/风格/所选单品/加权分）
"""
from __future__ import annotations
import argparse, csv, json, os, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eval_lib as E                       # noqa: E402
import stylee.pipeline as PIPE             # noqa: E402
from stylee.contracts import Slot          # noqa: E402

WEIGHTS = {"body_fit": 0.30, "occasion": 0.25, "style_coherence": 0.25, "color_harmony": 0.20}


def weighted_score(scores: dict) -> float:
    return round(sum(scores.get(k, 0) * w for k, w in WEIGHTS.items()), 3)


def install_pool_cap(cap: int):
    """把 pipeline 里绑定的 build_candidate_pool 换成"封顶版"。"""
    orig = PIPE.build_candidate_pool

    def capped(ctx, scene):
        pool = orig(ctx, scene)
        seed = f"{ctx.query_text}|{scene.formality}|{','.join(scene.occasions)}"
        rnd = random.Random(seed)
        for slot, items in list(pool.by_slot.items()):
            if len(items) > cap:
                pool.by_slot[slot] = rnd.sample(items, cap)
        return pool

    PIPE.build_candidate_pool = capped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", default="catalog_v2.json")
    ap.add_argument("--queries", default="queries.json")
    ap.add_argument("--provider", default="mock")
    ap.add_argument("--out", default="results_v2_top1/")
    ap.add_argument("--cap", type=int, default=10, help="每槽位候选上限")
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    catalog = E.load_json(os.path.join(here, args.catalog))
    queries = E.load_json(os.path.join(here, args.queries))
    if args.limit:
        queries = queries[:args.limit]
    out_dir = os.path.join(here, args.out)
    os.makedirs(out_dir, exist_ok=True)
    cat_idx = E.catalog_index(catalog)

    install_pool_cap(args.cap)
    try:
        provider = E.make_provider(args.provider)
    except E.ProviderError as e:
        print(f"[error] provider '{args.provider}' 初始化失败(多半缺 key)：{e}")
        sys.exit(2)

    print(f"[top1] catalog={len(catalog)} queries={len(queries)} provider={args.provider} cap={args.cap}")

    jsonl_records, summary_rows = [], []
    empty = 0
    for i, q in enumerate(queries):
        payload, ctx, result = E.run_one(q, catalog, provider, n=args.n)
        extracted = [E.extract_outfit(o, cat_idx) for o in result.outfits]
        top = extracted[0] if extracted else None
        if not top:
            empty += 1
        ws = weighted_score(top["scores"]) if top else 0.0
        owned = [s for s in (top["slots"] if top else []) if s.get("owned")]
        item_desc = " + ".join(f'{s["category"]}:{s["name"]}({s["item_id"]})' for s in owned) or "（空）"
        gaps = [s for s in (top["slots"] if top else []) if not s.get("owned")]
        gap_desc = "；".join(f'补:{s["name"]}' for s in gaps)

        jsonl_records.append({
            "query_id": q["query_id"],
            "text": q["text"],
            "labels": {k: q.get(k, "") for k in
                       ("scenario", "style", "color_system", "season",
                        "temp_range", "gender", "special", "profile_variant",
                        "difficulty", "tier")},
            "payload_weather": payload["weather"],
            "payload_profile": payload["profile"],
            "provider": provider.name,
            "num_outfits_generated": len(result.outfits),
            "outfits": [{                       # 只保留 Top1
                "rank": 1,
                "occasion": top["occasion"] if top else "",
                "slot_selection": {s["slot"]: s.get("item_id") for s in top["slots"]} if top else {},
                "slots": top["slots"] if top else [],
                "display_columns": top["display_columns"] if top else {},
                "reasoning": top["reasoning"] if top else "",
                "confidence": top["confidence"] if top else 0,
                "scores": top["scores"] if top else {},
                "weighted_score": ws,
            }] if top else [],
            "trace": {k: result.trace.get(k) for k in
                      ("candidate_pool_size", "gap_slots", "rag_mode", "provider")},
        })
        summary_rows.append([
            q["query_id"], q.get("text", ""), q.get("scenario", ""), q.get("style", ""),
            q.get("season", ""), q.get("temp_range", ""), item_desc, gap_desc, ws,
        ])
        if (i + 1) % 10 == 0:
            print(f"  ..{i+1}/{len(queries)}", flush=True)

    with open(os.path.join(out_dir, "outfits_top1.jsonl"), "w", encoding="utf-8") as f:
        for r in jsonl_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(os.path.join(out_dir, "top1_summary.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["【Top1 清单】每条 query 仅展示模型第一推荐搭配（provider=%s，每槽候选上限=%d）" % (provider.name, args.cap)])
        w.writerow([])
        w.writerow(["编号", "题目query", "场景", "风格", "季节", "温度",
                    "Top1所选单品(类目:名称(id))", "补买建议", "加权分"])
        w.writerows(summary_rows)

    print(f"[top1] 完成 ✅ 空结果={empty} 产物: {out_dir}outfits_top1.jsonl / top1_summary.csv")


if __name__ == "__main__":
    main()
