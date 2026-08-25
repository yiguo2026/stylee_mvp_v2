# -*- coding: utf-8 -*-
"""query↔单品池体检：判断 748 单品池能否支撑 77 道题的基本搭配需求。
只做库存体检，不调模型。判据（宽松、按性别可用池）：
  - 至少要能凑齐：上衣类(上装/连衣裙) + 下装/连衣裙 + 鞋
  - 按季节：该季有对应保暖档位的候选
  - 按风格：池中是否有该 style_tags 命中
"""
import json, os, collections

E = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open(os.path.join(E, "catalog.json")))
qs = json.load(open(os.path.join(E, "queries.json")))

G = {"female": "女", "male": "男"}
SEASON = {"春": "春", "夏": "夏", "秋": "秋", "冬": "冬"}
# query.style -> 池中 style_tags 关键词
STYLE_HINT = {
    "简约极简": ["极简"], "优雅正式": ["通勤", "静奢老钱"], "通勤知性": ["通勤"],
    "法式复古": ["法式"], "静奢老钱风": ["静奢老钱"], "街头": ["街头"], "甜美": ["甜美"],
    "运动机能": ["运动机能"], "波西米亚度假": ["度假"], "学院": ["学院"],
    "中性帅气": ["都市", "街头"],
}

def pool_for(gender):
    g = G.get(gender)
    return [it for it in cat if it.get("gender") in (g, "中性") or g is None]

def in_season(it, season):
    return (not it.get("season")) or (season in it.get("season", []))

rows = []
cnt = collections.Counter()
for q in qs:
    pool = pool_for(q.get("gender"))
    season = SEASON.get(q.get("season"), None)
    tops = [it for it in pool if it["category"] in ("上装", "连衣裙")]
    bottoms = [it for it in pool if it["category"] in ("下装", "连衣裙")]
    shoes = [it for it in pool if it["category"] == "鞋"]
    outers = [it for it in pool if it["category"] == "外套"]
    # 季节适配子集
    if season:
        tops_s = [it for it in tops if in_season(it, season)]
        bottoms_s = [it for it in bottoms if in_season(it, season)]
        shoes_s = [it for it in shoes if in_season(it, season)]
    else:
        tops_s, bottoms_s, shoes_s = tops, bottoms, shoes
    # 风格命中
    hints = STYLE_HINT.get(q.get("style"), [])
    style_hit = sum(1 for it in pool if any(h in " ".join(it.get("style_tags", [])) for h in hints)) if hints else -1
    # 冬季需要外套
    need_outer = q.get("season") == "冬"
    outer_ok = (not need_outer) or len(outers) >= 3
    ok_core = len(tops_s) >= 3 and len(bottoms_s) >= 3 and len(shoes_s) >= 2 and outer_ok
    style_ok = (style_hit == -1) or style_hit >= 3
    verdict = "OK" if (ok_core and style_ok) else ("弱风格" if ok_core else "库存不足")
    cnt[verdict] += 1
    if verdict != "OK":
        rows.append((q["query_id"], q.get("tier"), q.get("style"), q.get("season"),
                     f"top{len(tops_s)} bot{len(bottoms_s)} shoe{len(shoes_s)} outer{len(outers)} styhit{style_hit}", verdict))

print("=== 体检汇总 ===", dict(cnt), " 总题数", len(qs))
print("=== 非OK题（需关注）===")
for r in rows:
    print(r)
# 池规模概览（按性别/品类）
print("=== 池规模（女/男/全）===")
for g in ("female", "male", None):
    p = pool_for(g)
    d = collections.Counter(it["category"] for it in p)
    print(g, "总", len(p), dict(d))
