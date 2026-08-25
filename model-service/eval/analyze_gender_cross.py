# -*- coding: utf-8 -*-
"""性别 × 品类 × 风格 × 季节 四维交叉库存分析（对齐真实 style_tags 词表）"""
import json
from collections import Counter, defaultdict

CATALOG = "catalog.json"

# 规范风格 -> 别名（覆盖 catalog 真实 style_tags 词表 + 英文 id）
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
GENDERS = ["女", "男", "中性"]

# 校验用：先前对外口径的风格总量目标
PREV_TOTAL = {
    "静奢/老钱": 26, "极简": 146, "通勤职场": 142, "法式慵懒": 40, "学院风": 2,
    "猎装风": 3, "复古年代": 8, "街头潮流": 126, "运动机能": 154, "摇滚机车": 1,
    "哥特暗黑": 0, "甜美少女": 1, "浪漫田园": 1, "波西米亚/度假": 39, "西部牛仔": 25,
    "工装实用": 98, "日系侘寂": 2, "先锋设计师": 76, "都市酷感": 38,
}


def match_styles(item):
    hay = (item.get("name", "") + " " + " ".join(item.get("style_tags", []))).lower()
    hit = set()
    for canon, aliases in STYLE_ALIASES.items():
        for a in aliases:
            if a.lower() in hay:
                hit.add(canon)
                break
    return hit


def bias(f, m):
    tot = f + m
    if tot == 0:
        return "无货"
    r = f / tot
    if r >= 0.65:
        return "偏女"
    if r <= 0.35:
        return "偏男"
    return "均衡"


def main():
    data = json.load(open(CATALOG, encoding="utf-8"))
    n = len(data)
    g_all = Counter(x.get("gender", "未知") for x in data)

    cat_gender = defaultdict(Counter)
    for x in data:
        cat_gender[x.get("category", "未知")][x.get("gender", "未知")] += 1

    style_gender = {s: Counter() for s in STYLE_ORDER}
    style_summer = {s: Counter() for s in STYLE_ORDER}
    for x in data:
        g = x.get("gender", "未知")
        summer = "夏" in x.get("season", [])
        for s in match_styles(x):
            style_gender[s][g] += 1
            if summer:
                style_summer[s][g] += 1

    out = {
        "total": n,
        "gender_overall": dict(g_all),
        "usable": {"女生可用": g_all.get("女", 0) + g_all.get("中性", 0),
                   "男生可用": g_all.get("男", 0) + g_all.get("中性", 0)},
        "cat_gender": {}, "style_gender": {}, "match_check": {},
    }
    for c, cc in sorted(cat_gender.items(), key=lambda kv: -sum(kv[1].values())):
        out["cat_gender"][c] = {
            "total": sum(cc.values()), "女": cc.get("女", 0), "男": cc.get("男", 0),
            "中性": cc.get("中性", 0),
            "女生可用": cc.get("女", 0) + cc.get("中性", 0),
            "男生可用": cc.get("男", 0) + cc.get("中性", 0),
        }
    for s in STYLE_ORDER:
        cc = style_gender[s]
        tot = sum(cc.values())
        out["style_gender"][s] = {
            "total": tot, "女": cc.get("女", 0), "男": cc.get("男", 0), "中性": cc.get("中性", 0),
            "女生可用": cc.get("女", 0) + cc.get("中性", 0),
            "男生可用": cc.get("男", 0) + cc.get("中性", 0),
            "夏女生可用": style_summer[s].get("女", 0) + style_summer[s].get("中性", 0),
            "夏男生可用": style_summer[s].get("男", 0) + style_summer[s].get("中性", 0),
            "偏向": bias(cc.get("女", 0), cc.get("男", 0)),
        }
        out["match_check"][s] = {"now": tot, "prev": PREV_TOTAL.get(s), "diff": tot - PREV_TOTAL.get(s, 0)}

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
