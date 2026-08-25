#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新分类 catalog 类目（修复"帽子"杂物桶）。
只依据【商品名】判定类目（中英文兼顾、英文用词边界），不使用 style/occasion 标签，
避免"机车/工装"等风格词污染类目。输出更新 catalog.json 并打印修正明细。
"""
import json, os, re
BASE = os.path.dirname(os.path.abspath(__file__))

def norm_name(txt):
    if not txt: return ""
    if "\\u" in txt:
        try: txt = txt.encode("utf-8").decode("unicode_escape")
        except Exception: pass
    return txt

def has_cn(t, kws):
    return any(k in t for k in kws)
def has_en(t, kws):
    return any(re.search(r'\b'+re.escape(k)+r'\b', t) for k in kws)

def reclassify(name):
    raw = norm_name(name)
    t = raw.lower()
    # 连衣裙
    if has_cn(t, ["连衣裙","连体裤","背带裙","吊带裙"]) or has_en(t, ["dress","jumpsuit","romper"]):
        if "半身" not in t and "衬衫裙" not in t:
            return "连衣裙"
    # 鞋
    if has_cn(t, ["鞋","靴","乐福","运动鞋","凉鞋","拖鞋","高跟","小白鞋"]) or has_en(t, ["sneaker","sneakers","boot","boots","loafer","loafers","shoe","shoes","heel","heels","sandal","sandals"]):
        return "鞋"
    # 包
    if has_cn(t, ["包","手袋","托特","斜挎","双肩","钱包","背包","箱包"]) or has_en(t, ["bag","tote","clutch","backpack","satchel","crossbody","hobo","handbag","pouch"]):
        return "包"
    # 袜
    if has_cn(t, ["袜"]) or has_en(t, ["socks","sock","knee-high","ankle sock"]):
        return "袜"
    # 帽子
    if has_cn(t, ["帽","鸭舌","棒球帽","贝雷","渔夫帽"]) or has_en(t, ["beanie","cap","hat","bucket hat"]):
        return "帽子"
    # 围巾
    if has_cn(t, ["围巾","丝巾","披肩"]) or has_en(t, ["scarf","muffler","shawl"]):
        return "围巾"
    # 配饰（眼镜/腰带/手套/项链）
    if has_cn(t, ["腰带","皮带","墨镜","眼镜","项链","耳环","耳钉","手链","手套"]) or has_en(t, ["sunglasses","sunglass","belt","gloves","glove","necklace","bracelet"]):
        return "配饰"
    # 外套
    if has_cn(t, ["外套","夹克","风衣","大衣","羽绒","棉服","西服套装","西装外套","皮衣","斗篷","披风","开衫","猎装"]) or has_en(t, ["jacket","coat","blazer","parka","cardigan","trench","overcoat","puffer","fleece jacket"]):
        return "外套"
    # 下装
    if has_cn(t, ["裤","半身裙","裙裤","短裤","牛仔裤","阔腿","西裤","九分裤","长裤"]) or has_en(t, ["pants","trousers","trouser","jeans","shorts","skirt","leggings","chinos","joggers"]):
        return "下装"
    # 上装
    if has_cn(t, ["t恤","polo","衬衫","针织","毛衣","卫衣","背心","吊带","上衣","打底","衫"]) or has_en(t, ["tee","t-shirt","shirt","sweater","hoodie","knit","top","blouse","polo","sweatshirt","pullover","vest","tank"]):
        return "上装"
    return None  # 未知，保留原类目

def main():
    p = os.path.join(BASE, "catalog.json")
    cat = json.load(open(p))
    changed = []; kept_unknown = 0
    for c in cat:
        old = c.get("category","")
        new = reclassify(c.get("name",""))
        if new is None:
            kept_unknown += 1
            continue
        if new != old:
            changed.append((c["item_id"], old, new, norm_name(c.get("name",""))[:40]))
            c["category"] = new
    json.dump(cat, open(p,"w"), ensure_ascii=False, indent=2)
    from collections import Counter
    print("修正条数:", len(changed), "| 未知保留原样:", kept_unknown)
    print("新类目分布:", dict(Counter(x["category"] for x in cat)))
    print("=== 修正明细 ===")
    for x in changed:
        print(f'  {x[0]}: {x[1]} -> {x[2]} | {x[3]}')

if __name__ == "__main__":
    main()
