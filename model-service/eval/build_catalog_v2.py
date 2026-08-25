# -*- coding: utf-8 -*-
"""从"更新后的衣橱"飞书文件夹清单(/tmp/new_wardrobe_full.json)构建 catalog_v2.json。

- 类目来自子文件夹名（上装/下装/外套/鞋/连体装→连衣裙/包/配饰→帽子/帽巾→围巾）。
- item_id 用飞书文件 token（唯一、稳定；下载图片时同一 token 即可）。
- name / colors / season / warmth / sleeve / fit 用 build_catalog.py 既有启发式从文件名推断。
- 另产出 item_id -> lark token 映射（token 即 item_id，供后续按需下载 Top1 单品图）。
复用既有 build_catalog 的推断函数，不改 model-service 源码。
"""
import json, os, re
import build_catalog as B

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "/tmp/new_wardrobe_full.json"
OUT = os.path.join(HERE, "catalog_v2.json")
MAP = os.path.join(HERE, "catalog_v2_token_map.json")

# 子文件夹名（去尾部数字）-> 目录标准类目
FOLDER2CAT = {
    "上装": "上装", "下装": "下装", "外套": "外套", "鞋": "鞋",
    "连体装": "连衣裙", "包": "包", "配饰": "帽子", "帽巾": "围巾",
}

TOKEN_RE = re.compile(r"^[A-Za-z0-9]{20,32}$")


def base_folder(name: str) -> str:
    return re.sub(r"\d+$", "", name).strip()


def humanize(stem: str) -> str:
    s = re.sub(r"_(edgefix|std|nobg)$", "", stem)
    s = s.strip("_")
    # 提取中文/可读片段
    readable = s.replace("_", " ").strip()
    return readable


def clean_name(stem: str, cat: str) -> str:
    raw = re.sub(r"_(edgefix|std|nobg)$", "", stem)
    # 纯 lark token（无语义）-> 用类目占位
    if TOKEN_RE.match(raw):
        return f"{cat}单品"
    name = humanize(stem)
    # 去掉常见前缀噪声
    name = re.sub(r"^(c2s5[_ ]*sport[_ ]*|ai[_ ]*)", "", name, flags=re.I).strip()
    name = re.sub(r"\s+", " ", name)
    return name[:40] or f"{cat}单品"


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    catalog = []
    token_map = {}
    seen = set()
    cat_count = {}
    for folder_name, obj in data.items():
        cat = FOLDER2CAT.get(base_folder(folder_name))
        if not cat:
            print("[warn] 未映射类目的文件夹:", folder_name)
            continue
        for f in obj["files"]:
            token = f["token"]
            fname = f["name"]
            if token in seen:
                continue
            seen.add(token)
            stem = os.path.splitext(fname)[0]
            name = clean_name(stem, cat)
            tags_str = name
            entry = {
                "item_id": token,
                "category": cat,
                "name": name,
                "colors": B.clean_colors(None, name),
                "material": "",
                "season": B.infer_season(cat, name, tags_str, ""),
                "style_tags": [],
                "occasion_tags": B.infer_occasion("", name, tags_str),
                "warmth": B.infer_warmth(cat, name, tags_str),
                "image_url": f"items_v2/{token}.png",
                "gender": "中性",
                "brand": "",
                "src_folder": folder_name,
                "src_name": fname,
            }
            sl = B.infer_sleeve(name, tags_str)
            if sl:
                entry["sleeve_length"] = sl
            ft = B.infer_fit(name, tags_str)
            if ft:
                entry["fit"] = ft
            catalog.append(entry)
            token_map[token] = {"token": token, "src_folder": folder_name, "src_name": fname}
            cat_count[cat] = cat_count.get(cat, 0) + 1

    json.dump(catalog, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(token_map, open(MAP, "w", encoding="utf-8"), ensure_ascii=False)
    print("catalog_v2 items:", len(catalog))
    print("category dist:", cat_count)
    print("written ->", OUT)
    print("token map ->", MAP)


if __name__ == "__main__":
    main()
