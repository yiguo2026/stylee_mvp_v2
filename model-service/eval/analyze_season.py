# -*- coding: utf-8 -*-
"""四季 × 性别 × 风格 库存分析"""
import json
from collections import Counter

CATALOG = "catalog.json"
SEASONS = ["春", "夏", "秋", "冬"]

STYLE_ALIASES = {
    "静奢/老钱": ("静奢/老钱", "静奢老钱", "静奢", "老钱", "老钱风", "静奢风", "quiet_luxury"),
    "极简": ("极简", "minimalist"),
    "通勤职场": ("通勤职场", "职场通勤", "通勤", "商务", "commute_style"),
    "法式慵懒": ("法式慵懒", "法式", "french"),
    "学院风": ("学院风", "学院", "preppy"),
    "猎装风": ("猎装风", "猎装", "safari"),
    "复古年代": ("复古年代", "复古", "vintage"),
    "街头潮流": ("街头潮流", "街头", "street"),
    "运动机能": ("运动机能", "运动休闲", "运动", "sporty_casual"),
    "摇滚机车": ("摇滚机车", "摇滚", "机车", "rock"),
    "哥特暗黑": ("哥特暗黑", "哥特", "暗黑", "goth"),
    "甜美少女": ("甜美少女", "甜美", "sweet"),
    "浪漫田园": ("浪漫田园", "田园", "romantic"),
    "波西米亚/度假": ("波西米亚/度假", "波西米亚", "度假", "异国风情", "海边度假", "bohemian"),
    "西部牛仔": ("西部牛仔", "西部", "western"),
    "工装实用": ("工装实用", "工装", "utility"),
    "日系侘寂": ("日系侘寂", "侘寂", "日系", "wabi_sabi"),
    "先锋设计师": ("先锋设计师", "先锋", "设计师", "avantgarde"),
    "都市酷感": ("都市酷感", "都市", "urban_cool"),
}
STYLE_ORDER = list(STYLE_ALIASES.keys())


def match_styles(item):
    hay = (item.get("name", "") + " " + " ".join(item.get("style_tags", []))).lower()
    hit = set()
    for canon, aliases in STYLE_ALIASES.items():
        for a in aliases:
            if a.lower() in hay:
                hit.add(canon)
                break
    return hit


def main():
    data = json.load(open(CATALOG, encoding="utf-8"))
    n = len(data)

    # 1. 整体季节 × 性别
    print("=== 整体：每个季节的可用单品（含中性）===")
    print("季节 | 总量 | 女生可用 | 男生可用")
    for s in SEASONS:
        items = [x for x in data if s in x.get("season", [])]
        tot = len(items)
        fu = sum(1 for x in items if x.get("gender") in ("女", "中性"))
        mu = sum(1 for x in items if x.get("gender") in ("男", "中性"))
        print(f"{s} | {tot} | {fu} | {mu}")

    # 2. 风格 × 季节（总量）
    print("\n=== 风格 × 季节（该风格在各季的单品数）===")
    print("风格 | 春 | 夏 | 秋 | 冬 | 总")
    style_season = {st: Counter() for st in STYLE_ORDER}
    for x in data:
        sts = match_styles(x)
        for st in sts:
            for se in x.get("season", []):
                if se in SEASONS:
                    style_season[st][se] += 1
    for st in STYLE_ORDER:
        c = style_season[st]
        tot = sum(1 for x in data if st in match_styles(x))
        print(f"{st} | {c.get('春',0)} | {c.get('夏',0)} | {c.get('秋',0)} | {c.get('冬',0)} | {tot}")


if __name__ == "__main__":
    main()
