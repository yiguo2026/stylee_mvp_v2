# -*- coding: utf-8 -*-
"""从 brands_products_final_before_nobg_backup.json 生成评测用 catalog.json。

只保留与 828 张去背 PNG 有交集的单品（通过 图片文件名 stem 对齐，.jpg->.png）。
字段清洗 / 归并 / 推断，对齐 model-service adapter 的 wardrobe schema。
"""
import json
import os
import re
from collections import Counter

ROOT = "/workspace/iris_c3a2aafd-5785-4fe2-b35f-39640922ad53"
META = os.path.join(ROOT, "brands_products_final_before_nobg_backup.json")
EVAL = os.path.join(ROOT, "stylee_mvp_v2/model-service/eval")
OUT = os.path.join(EVAL, "catalog.json")

# ---- 有效枚举（对齐 stylee.contracts） ----
VALID_CAT = {"上装", "下装", "连衣裙", "外套", "鞋", "包", "帽子", "围巾"}

PLACEHOLDER = {
    "请查看商品详情页获取完整材质信息", "请查看商品详情页获取洗涤说明",
    "请参照商品标签说明", "未获取", "未知", "无", "", "None", "null",
    "请查看详情页", "详见商品标签", "请查看商品标签",
}

PLACEHOLDER_SUB = ("请查看", "请参照", "详情页", "商品标签", "未获取", "详见", "参见", "见详情")

SIZE_RE = re.compile(r"^(XXS|XS|S|M|L|XL|XXL|XXXL|\dXL|F|均码|\d{2,3}/\d{2,3}[A-Z]?|\d{2,3})$", re.I)


def load_meta():
    d = json.load(open(META, encoding="utf-8"))
    items = []
    for brand, arr in d.items():
        if isinstance(arr, list):
            for it in arr:
                it = dict(it)
                it["_brand_key"] = brand
                items.append(it)
    return items


def png_stems():
    f1 = json.load(open(os.path.join(EVAL, "_f1.json")))
    f2 = json.load(open(os.path.join(EVAL, "_f2.json")))
    stems = set()
    for f in (f1, f2):
        for x in f:
            if x.get("type") == "file" and x.get("name", "").lower().endswith(".png"):
                stems.add(os.path.splitext(x["name"])[0])
    return stems


# ---- 品类归并 ----
def norm_category(cat, name, tags):
    text = f"{cat} {name} {tags}"
    # 优先按名称/品类关键词判定
    if any(k in text for k in ("连衣裙", "连体", "背带裙", "吊带裙", "长裙")) and "半身" not in text:
        return "连衣裙"
    if any(k in text for k in ("鞋", "靴", "乐福", "帆布", "运动鞋", "凉鞋", "拖鞋", "高跟", "小白鞋")):
        return "鞋"
    if any(k in text for k in ("包", "手袋", "托特", "斜挎", "双肩", "钱包", "背包")):
        return "包"
    if any(k in text for k in ("帽", "鸭舌", "棒球帽", "贝雷", "渔夫帽")):
        return "帽子"
    if any(k in text for k in ("围巾", "丝巾", "披肩", "巾")):
        return "围巾"
    # 外套类
    if any(k in text for k in ("外套", "夹克", "风衣", "大衣", "羽绒", "棉服", "西服套装", "西装外套",
                               "皮衣", "机车", "斗篷", "披风", "开衫", "猎装")):
        return "外套"
    # 下装
    if any(k in text for k in ("裤", "半身裙", "裙裤", "短裤", "牛仔裤", "阔腿", "西裤")):
        return "下装"
    if cat in ("半身裙",) or ("裙" in cat and "连衣" not in cat):
        return "下装"
    # 上装（含针织/卫衣/衬衫/T恤/背心）
    if any(k in text for k in ("T恤", "POLO", "衬衫", "针织", "毛衣", "卫衣", "背心", "吊带",
                               "上衣", "打底", "衫", "polo", "tee")):
        return "上装"
    if any(k in text for k in ("配饰", "腰带", "皮带", "墨镜", "眼镜", "项链", "耳", "手链", "袜", "手套")):
        return "帽子"  # 配饰 alias -> HAT（无独立配饰枚举）
    # 兜底
    if cat in ("裤装", "裤子", "休闲裤", "休闲长裤/西裤", "牛仔裤/牛仔"):
        return "下装"
    return "上装"


# ---- 季节推断（贴近真实穿着：可叠穿的基础层在冬季照样可用，鞋默认四季） ----
def infer_season(cat, name, tags, material):
    text = f"{name} {tags} {material}"
    heavy = any(k in text for k in ("羽绒", "棉服", "大衣", "加绒", "加厚", "羊毛", "羊绒",
                                    "毛呢", "毛衣", "针织", "呢", "保暖"))
    summer = any(k in text for k in ("短袖", "短T", "背心", "吊带", "无袖", "短裤", "冰丝",
                                     "亚麻", "雪纺", "防晒", "冰爽", "清凉"))
    if cat == "鞋":
        if any(k in text for k in ("凉鞋", "拖鞋", "洞洞")):
            return ["夏"]
        if any(k in text for k in ("雪地", "加绒", "靴")):
            return ["秋", "冬"]
        return ["春", "夏", "秋", "冬"]      # 运动鞋/板鞋/乐福等四季通用
    if cat in ("包", "帽子", "围巾"):
        if "围巾" in text or "毛线" in text or "针织帽" in text:
            return ["秋", "冬"]
        return ["春", "夏", "秋", "冬"]
    if cat == "连衣裙":
        if heavy:
            return ["秋", "冬"]
        if summer:
            return ["夏"]
        return ["春", "夏", "秋"]
    # 上装/下装/外套
    if summer and not heavy:
        return ["夏"] if cat == "上装" else ["春", "夏", "秋"]
    if heavy:
        return ["秋", "冬"]
    if cat == "外套":
        return ["春", "秋", "冬"]
    # 衬衫/长袖/普通裤装等基础层：可叠穿，四季偏三季（含冬季内搭）
    return ["春", "秋", "冬"]


# ---- 保暖度 0-5 ----
def infer_warmth(cat, name, tags):
    text = f"{name} {tags}"
    if cat in ("鞋", "包", "帽子", "围巾"):
        return 0
    if any(k in text for k in ("羽绒",)):
        return 5
    if any(k in text for k in ("棉服", "大衣", "毛呢", "羊绒", "加绒", "加厚")):
        return 4
    if any(k in text for k in ("毛衣", "针织", "夹克", "风衣", "西装外套", "皮衣")) or cat == "外套":
        return 3
    if any(k in text for k in ("卫衣", "开衫", "长袖", "衬衫")):
        return 2
    if any(k in text for k in ("短袖", "T恤", "半身裙", "裤", "连衣裙")):
        return 1
    if any(k in text for k in ("背心", "吊带", "无袖", "短裤")):
        return 0
    return 1


def infer_sleeve(name, tags):
    text = f"{name} {tags}"
    if any(k in text for k in ("无袖", "背心", "吊带")):
        return "无袖"
    if "短袖" in text or "短T" in text:
        return "短袖"
    if any(k in text for k in ("长袖", "衬衫", "毛衣", "针织", "卫衣")):
        return "长袖"
    return None


def infer_fit(name, tags):
    text = f"{name} {tags}"
    if "oversize" in text.lower() or "廓形" in text or "落肩" in text:
        return "oversize"
    if any(k in text for k in ("宽松", "阔腿", "直筒", "廓")):
        return "宽松"
    if any(k in text for k in ("修身", "收腰", "合身")):
        return "修身"
    if any(k in text for k in ("紧身", "包臀", "铅笔")):
        return "紧身"
    return "标准"


STYLE_LABEL = {
    "通勤职场": "通勤", "静奢/老钱": "静奢老钱", "运动机能": "运动机能", "极简": "极简",
    "甜美少女": "甜美", "街头潮流": "街头", "工装实用": "工装", "西部牛仔": "西部牛仔",
    "先锋设计师": "设计师", "法式慵懒": "法式", "猎装风": "猎装", "都市酷感": "都市",
    "学院风": "学院", "波西米亚/度假": "度假", "日系侘寂": "日系", "复古年代": "复古",
    "浪漫田园": "田园", "摇滚机车": "机车",
}

OCCASION_BY_STYLE = {
    "通勤职场": ["通勤"], "静奢/老钱": ["通勤", "正式"], "甜美少女": ["约会", "休闲"],
    "运动机能": ["运动", "休闲"], "街头潮流": ["街头", "休闲"], "法式慵懒": ["约会", "休闲"],
    "极简": ["通勤", "休闲"], "工装实用": ["休闲"], "西部牛仔": ["休闲"],
    "学院风": ["休闲", "约会"], "波西米亚/度假": ["度假"], "都市酷感": ["通勤", "街头"],
    "先锋设计师": ["派对", "正式"],
}


def infer_occasion(style, name, tags):
    text = f"{name} {tags}"
    occ = list(OCCASION_BY_STYLE.get(style, []))
    for kw, o in (("通勤", "通勤"), ("职场", "通勤"), ("约会", "约会"), ("度假", "度假"),
                  ("运动", "运动"), ("正式", "正式"), ("宴会", "正式"), ("晚宴", "正式"),
                  ("派对", "派对"), ("休闲", "休闲"), ("居家", "居家"), ("旅行", "度假")):
        if kw in text and o not in occ:
            occ.append(o)
    if not occ:
        occ = ["休闲"]
    return occ[:3]


# 常见颜色词（长词在前，便于优先匹配）
COLOR_WORDS = [
    "藏青", "藏蓝", "深蓝", "浅蓝", "天蓝", "湖蓝", "宝蓝", "克莱因蓝", "雾霾蓝", "牛仔蓝",
    "墨绿", "军绿", "草绿", "浅绿", "深绿", "橄榄绿", "薄荷绿",
    "酒红", "枣红", "砖红", "正红", "大红", "玫红", "豆沙", "勃艮第",
    "卡其", "驼色", "焦糖", "咖啡", "巧克力", "杏色", "米色", "米白", "奶白", "象牙白",
    "裸色", "肉色", "香槟", "银灰", "深灰", "浅灰", "烟灰", "炭灰", "高级灰",
    "浅粉", "深粉", "藕粉", "裸粉", "樱花粉",
    "紫色", "香芋紫", "薰衣草", "橙色", "橘色", "姜黄", "鹅黄", "柠檬黄",
    "黑色", "白色", "灰色", "红色", "蓝色", "绿色", "黄色", "粉色", "紫色", "棕色",
    "驼", "米", "黑", "白", "灰", "红", "蓝", "绿", "黄", "粉", "紫", "棕", "橙", "银", "金",
]


def _colors_from_text(text):
    found = []
    for w in COLOR_WORDS:
        if w in text:
            # 归一到 “X色”
            norm = w if w.endswith("色") else (w + "色" if len(w) == 1 else w)
            if norm not in found:
                found.append(norm)
        if len(found) >= 2:
            break
    return found


def clean_colors(raw, fallback_text=""):
    out = []
    if isinstance(raw, str):
        raw = [raw]
    for c in (raw or []):
        c = str(c).strip()
        # 拆分斜杠/顿号组合色（如 "帆白/微绿/微绿"）
        for part in re.split(r"[/、,，\s]+", c):
            part = part.strip()
            if not part or part in PLACEHOLDER:
                continue
            if SIZE_RE.match(part) or part.isdigit():
                continue
            part = re.sub(r"[（(].*?[)）]", "", part).strip()
            # 丢掉纯英文/拉丁片段（多为脏数据，如 "transparen"）
            if re.fullmatch(r"[A-Za-z0-9\-\.]+", part):
                continue
            if part and part not in out:
                out.append(part)
    if not out and fallback_text:  # 从名称/描述兜底抽色
        out = _colors_from_text(fallback_text)
    return out[:4]


def clean_material(raw, raw2):
    for v in (raw, raw2):
        if not v:
            continue
        m = str(v).strip()
        if m in PLACEHOLDER or any(s in m for s in PLACEHOLDER_SUB):
            continue
        m = re.sub(r"\s+", "", m)
        return m[:40]
    return ""


def clean_style_tags(style, tags_raw):
    tags = []
    lbl = STYLE_LABEL.get(style, style)
    if lbl:
        tags.append(lbl)
    toks = []
    if isinstance(tags_raw, str):
        toks = re.split(r"[,，、/\s]+", tags_raw)
    elif isinstance(tags_raw, list):
        toks = [str(x) for x in tags_raw]
    STYLE_KW = ("极简", "法式", "复古", "甜美", "街头", "通勤", "商务", "运动", "工装",
                "学院", "度假", "静奢", "老钱", "都市", "设计师", "田园", "机车", "日系",
                "简约", "优雅", "清新", "帅气", "慵懒", "韩风", "国风", "港风", "千金")
    for t in toks:
        t = t.strip()
        if t and any(k in t for k in STYLE_KW) and t not in tags and len(t) <= 6:
            tags.append(t)
    return tags[:5]


GENDER_MAP = {"女装": "女", "男装": "男", "中性": "中性", "男女通用": "中性"}


def main():
    items = load_meta()
    stems = png_stems()
    # stem -> item（首次出现优先）
    seen = set()
    catalog = []
    catcount = Counter()
    for it in items:
        fns = it.get("图片文件名") or []
        if not fns:
            continue
        stem = os.path.splitext(fns[0])[0]
        if stem not in stems or stem in seen:
            continue
        seen.add(stem)
        name = it.get("商品名称", "") or ""
        raw_cat = it.get("商品分类", "") or ""
        tags_raw = it.get("商品标签") or it.get("标签") or ""
        tags_str = tags_raw if isinstance(tags_raw, str) else " ".join(map(str, tags_raw))
        material = clean_material(it.get("材质成分"), it.get("材质"))
        style = it.get("style", "") or ""
        cat = norm_category(raw_cat, name, tags_str)
        catcount[cat] += 1
        entry = {
            "item_id": stem,
            "category": cat,
            "name": name or raw_cat or stem,
            "colors": clean_colors(it.get("颜色"), f"{name} {it.get('商品描述','')}"),
            "material": material,
            "season": infer_season(cat, name, tags_str, material),
            "style_tags": clean_style_tags(style, tags_raw),
            "occasion_tags": infer_occasion(style, name, tags_str),
            "warmth": infer_warmth(cat, name, tags_str),
            "image_url": f"items/{stem}.png",
            # 附加元信息（hard-check / 展示用，harness 会忽略未知字段）
            "gender": GENDER_MAP.get(it.get("性别", ""), "中性"),
            "brand": it.get("品牌", "") or it.get("_brand_key", ""),
            "price": it.get("价格", ""),
        }
        sl = infer_sleeve(name, tags_str)
        if sl:
            entry["sleeve_length"] = sl
        ft = infer_fit(name, tags_str)
        if ft:
            entry["fit"] = ft
        catalog.append(entry)

    json.dump(catalog, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("catalog items:", len(catalog))
    print("category dist:", dict(catcount))
    # gender dist
    print("gender dist:", dict(Counter(e["gender"] for e in catalog)))
    print("empty colors:", sum(1 for e in catalog if not e["colors"]))
    print("has material:", sum(1 for e in catalog if e["material"]))
    print("written ->", OUT)


if __name__ == "__main__":
    main()
