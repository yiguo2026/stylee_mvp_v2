#!/usr/bin/env python3
"""ETL:Garments2Look outfit JSON → 规范化 + 分桶去重过滤 → exemplars.jsonl。

只用 stdlib。字段映射对齐 Stylee 词表,映射不到的保留原文。
精确字段名见 download_garments2look.py --validate;若不同改 _FIELD_*。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os

# --- 真实 schema 字段名(已核对 Garments2Look 真实数据) ---
# outfit_info 字段: style / season / occasion / color_palette / theme / outfit_description
# 单品列表在顶层 rec["outfit"]:{item_id: item_name} 而非 outfit_info 内
_FIELD_INFO = "outfit_info"
_FIELD_STYLE = "style"
_FIELD_SEASON = "season"
_FIELD_OCCASION = "occasion"
_FIELD_DESC = "outfit_description"   # 真实字段名(原假定为 "description")
# 单品来自 rec["outfit"] 顶层字典,见 _extract_items

# --- 词表映射(原始词 → Stylee 词);未命中 passthrough ---
_STYLE_MAP = {
    # 法式 / 优雅
    "french": "法式", "french chic": "法式", "french style": "法式",
    "elegant": "法式", "elegant chic": "法式", "elegant style": "法式",
    "elegant casual": "法式", "classic chic": "法式", "classic style": "法式",
    "classic": "法式", "sophisticated chic": "法式", "glamorous chic": "法式",
    "glamorous style": "法式",
    # 休闲
    "casual": "休闲", "casual style": "休闲", "casual chic": "休闲",
    "smart casual": "休闲", "smart casual style": "休闲",
    "contemporary casual": "休闲", "modern casual": "休闲",
    "sophisticated casual": "休闲", "elevated casual": "休闲",
    "chic casual": "休闲",
    # 都市 / 街头
    "street": "都市", "street style": "都市", "casual street style": "都市",
    "urban casual": "都市", "contemporary chic": "都市", "modern chic": "都市",
    "edgy chic": "都市", "edgy style": "都市",
    # 运动休闲
    "sporty": "运动休闲", "sporty style": "运动休闲", "sporty chic": "运动休闲",
    # 学院风
    "preppy": "学院风", "preppy style": "学院风",
    # 日系 / 韩系
    "japanese": "日系", "korean": "韩系",
    # 商务
    "business": "商务", "business casual": "商务",
    # 复古
    "vintage": "复古",
    # 甜美 / 少女
    "sweet": "甜美", "romantic style": "甜美", "romantic chic": "甜美",
    "feminine chic": "甜美", "playful casual": "甜美",
    # 度假
    "bohemian chic": "度假", "bohemian style": "度假",
    "resort chic": "度假", "resort wear": "度假",
    # 极简
    "minimalist chic": "极简", "minimalist style": "极简", "minimalist": "极简",
}
_SEASON_MAP = {
    "spring": "春", "summer": "夏", "autumn": "秋", "fall": "秋", "winter": "冬",
    # 多季节 / 全年
    "year-round": "四季", "all seasons": "四季", "all-season": "四季",
    "all season": "四季", "transitional": "四季",
    # 跨季(斜线合并形式,逗号形式在 _norm_list 中先拆分)
    "spring/summer": "春夏", "spring / summer": "春夏",
    "autumn/winter": "秋冬",
    "spring/autumn": "春秋", "autumn/spring": "春秋",
}
_OCCASION_MAP = {
    "date": "约会", "date night": "约会", "dinner": "约会",
    "work": "通勤", "commute": "通勤", "commuting": "通勤",
    "business casual": "通勤",
    "party": "聚会", "cocktail party": "聚会", "cocktail": "聚会",
    "evening event": "聚会", "evening wear": "聚会", "evening out": "聚会",
    "evening": "聚会", "night out": "聚会",
    "social gathering": "聚会", "social event": "聚会", "fashion event": "聚会",
    "gala": "正式", "formal": "正式", "formal event": "正式",
    "special occasion": "正式", "special event": "正式",
    "casual": "休闲", "casual outing": "休闲", "leisure": "休闲", "brunch": "休闲",
    "smart casual": "休闲",
    "daily wear": "日常", "daytime event": "日常",
    "sport": "运动", "outdoor": "户外",
    "travel": "差旅", "vacation": "差旅",
    "home": "居家",
}


def _norm_list(raw, mapping: dict) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        # 逗号分隔的多值(如 "Daily Wear, Casual Outing")拆成多条
        raw = [x.strip() for x in raw.split(",") if x.strip()]
    out = []
    for x in raw:
        s = str(x).strip()
        if s:
            out.append(mapping.get(s.lower(), s))
    return list(dict.fromkeys(out))      # 去重保序


def _extract_items(rec: dict) -> list[str]:
    """从 rec["outfit"] 顶层字典提取单品名(值为单品描述字符串)。"""
    outfit = rec.get("outfit") or {}
    if isinstance(outfit, dict):
        return [str(v).strip() for v in outfit.values()
                if v and str(v).strip()]
    return []


def normalize_record(rec: dict, source: str) -> dict | None:
    info = rec.get(_FIELD_INFO) or rec
    items = _extract_items(rec)  # 单品来自 rec["outfit"] 顶层
    if not items:
        return None
    styles = _norm_list(info.get(_FIELD_STYLE), _STYLE_MAP)
    occ = _norm_list(info.get(_FIELD_OCCASION), _OCCASION_MAP)
    seasons = _norm_list(info.get(_FIELD_SEASON), _SEASON_MAP)
    recipe = " + ".join(items)
    note = str(info.get(_FIELD_DESC) or "").strip()[:60]
    rid = (rec.get("id") or info.get("id")
           or hashlib.md5(recipe.encode("utf-8")).hexdigest()[:10])
    text = (f"风格:{','.join(styles)} | 场合:{','.join(occ)} | "
            f"季节:{','.join(seasons)} | 搭配:{recipe}")
    if note:
        text += f" | {note}"
    return {"id": f"{source}_{rid}", "source": source,
            "style_keywords": styles, "occasions": occ, "seasons": seasons,
            "items": items, "recipe": recipe, "note": note, "text": text}


def bucket_key(ex: dict) -> tuple:
    def first(xs):
        return (xs[0],) if xs else ()
    return (first(ex["style_keywords"]), first(ex["seasons"]),
            first(ex["occasions"]))


def curate(records: list[dict], source: str, limit_per_bucket: int) -> list[dict]:
    buckets: dict[tuple, list[dict]] = {}
    seen_recipe: dict[tuple, set] = {}
    for rec in records:
        ex = normalize_record(rec, source)
        if ex is None:
            continue
        key = bucket_key(ex)
        seen = seen_recipe.setdefault(key, set())
        if ex["recipe"] in seen:          # 同桶 recipe 去重
            continue
        bucket = buckets.setdefault(key, [])
        if len(bucket) >= limit_per_bucket:
            continue
        bucket.append(ex)
        seen.add(ex["recipe"])
    out: list[dict] = []
    for bucket in buckets.values():
        out.extend(bucket)
    return out


def trim_diverse(exemplars: list[dict], max_total: int) -> list[dict]:
    """超过 max_total 时,按桶轮转挑多样子集(广度优先,避免偏袒单一风格/场景区域)。"""
    if max_total <= 0 or len(exemplars) <= max_total:
        return exemplars
    buckets: dict[tuple, list[dict]] = {}
    for ex in exemplars:
        buckets.setdefault(bucket_key(ex), []).append(ex)
    queues = list(buckets.values())
    out: list[dict] = []
    while len(out) < max_total:
        progressed = False
        for q in queues:
            if q:
                out.append(q.pop())
                progressed = True
                if len(out) >= max_total:
                    break
        if not progressed:
            break
    return out


def _load_source(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return list(data.values()) if isinstance(data, dict) else list(data)


def main() -> None:
    ap = argparse.ArgumentParser(description="ETL Garments2Look → exemplars.jsonl")
    ap.add_argument("--src", default="data/garments2look")
    ap.add_argument("--out", default="data/garments2look/exemplars.jsonl")
    ap.add_argument("--limit-per-bucket", type=int, default=25)
    ap.add_argument("--max-total", type=int, default=3000,
                    help="全局上限:超过则按桶轮转挑多样子集(0=不限)")
    ap.add_argument("--dry-run", action="store_true", help="只统计桶分布")
    args = ap.parse_args()

    sources = {"polyvore": "polyvore_outfit_v1.0_2512.json",
               "mytheresa": "mytheresa_outfit_v1.0_2512.json"}
    all_ex: list[dict] = []
    for source, fname in sources.items():
        p = os.path.join(args.src, fname)
        if not os.path.exists(p):
            print(f"  跳过(缺文件) {p}")
            continue
        recs = _load_source(p)
        ex = curate(recs, source, args.limit_per_bucket)
        print(f"  {source}: 原始 {len(recs)} → curated {len(ex)}")
        all_ex.extend(ex)

    all_ex = trim_diverse(all_ex, args.max_total)

    buckets = {}
    for ex in all_ex:
        buckets.setdefault(bucket_key(ex), 0)
        buckets[bucket_key(ex)] += 1
    print(f"总计 {len(all_ex)} 套,{len(buckets)} 个桶,"
          f"每桶上限 {args.limit_per_bucket}")
    if args.dry_run:
        for key, n in sorted(buckets.items(), key=lambda x: -x[1])[:20]:
            print(f"  {key} : {n}")
        return
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for ex in all_ex:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(f"写出 {args.out}")


if __name__ == "__main__":
    main()
