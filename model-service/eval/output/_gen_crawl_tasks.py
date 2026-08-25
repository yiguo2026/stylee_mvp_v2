# -*- coding: utf-8 -*-
"""生成夏季补货爬取任务清单 crawl_tasks.csv。
数据依据评测单品池的缺口结论（夏季为唯一严重短板）逐行展开，
每个风格按品类拆成多行。列顺序固定，供产品经理直接分派采集任务。
"""
import csv
import os

HEADER = ["优先级", "风格", "性别", "目标品类", "推荐品牌",
          "目标季节", "建议目标数量", "备注"]

# 每行：优先级, 风格, 性别, 目标品类, 推荐品牌, 目标季节, 数量, 备注
ROWS = [
    # ===== P0 通勤职场·女（夏季仅4件，最严重）=====
    ["P0", "通勤职场", "女", "上装(短袖衬衫)", "有帆OFFIY, Lily, 伊芙丽, URBAN REVIVO/UR, 太平鸟, Maje, Theory, COS",
     "夏", 20, "夏季通勤女装几乎空白(仅4件)；UR/COS 可用 scrape_items.py(shopify/uniqlo源)，国内品牌走淘系(需cookie)"],
    ["P0", "通勤职场", "女", "下装(透气西裤)", "有帆OFFIY, Lily, 伊芙丽, URBAN REVIVO/UR, 太平鸟, Theory, COS",
     "夏", 20, "薄款/冰丝西裤，优先亚麻或含醋酸；关键词 透气西裤/凉感西裤"],
    ["P0", "通勤职场", "女", "外套(薄西装)", "Lily, 伊芙丽, URBAN REVIVO/UR, 太平鸟, Maje, Theory, COS",
     "夏", 15, "薄款/不加里衬西装外套；warmth 建议 2"],
    ["P0", "通勤职场", "女", "连衣裙", "有帆OFFIY, Lily, 伊芙丽, Maje, Theory, COS",
     "夏", 20, "衬衫裙/西装裙等通勤连衣裙；关键词 通勤连衣裙"],

    # ===== P0 甜美少女·女（女生可用0，唯一1件被标错成男）=====
    ["P0", "甜美少女", "女", "连衣裙", "乐町LEDIN, TeenieWeenie, 欧阳喜OYANXI, Snidel, 5cm",
     "夏", 25, "女款可用量为0，最高优先；Snidel 为独立站(可试 shopify 源)，国内品牌走淘系"],
    ["P0", "甜美少女", "女", "上装", "乐町LEDIN, TeenieWeenie, 欧阳喜OYANXI, Snidel, 5cm",
     "夏", 20, "泡泡袖/娃娃领等甜美上衣；关键词 甜美上衣/泡泡袖"],
    ["P0", "甜美少女", "女", "下装(百褶裙)", "乐町LEDIN, TeenieWeenie, 欧阳喜OYANXI, Snidel, 5cm",
     "夏", 15, "半身百褶裙/蛋糕裙；注意品类归为下装"],

    # ===== P0 浪漫田园·女（女生可用0，1件被标错成男）=====
    ["P0", "浪漫田园", "女", "连衣裙(碎花)", "森女部落, 鹿与飞鸟, Sézane, Sessùn",
     "夏", 25, "女款可用量为0；碎花/棉麻长裙；Sézane/Sessùn 可试 shopify 源"],
    ["P0", "浪漫田园", "女", "上装(棉麻罩衫)", "森女部落, 鹿与飞鸟, Sézane, Sessùn",
     "夏", 15, "棉麻/纯棉罩衫、刺绣衬衫；material 优先 棉麻"],

    # ===== P1 法式/极简/波西米亚·男（男款供给不足）=====
    ["P1", "法式/极简/波西米亚", "男", "上装(亚麻衬衫)", "A.P.C., COS, MUJI无印良品, Uniqlo U, Vilebrequin",
     "夏", 15, "已实测可跑：Uniqlo(uniqlo源 关键词 linen shirt)、MUJI(shopify源)；A.P.C./COS 为 shopify 站"],
    ["P1", "法式/极简/波西米亚", "男", "下装", "A.P.C., COS, MUJI无印良品, Uniqlo U, Vilebrequin",
     "夏", 12, "亚麻/棉麻直筒长裤、休闲短裤；Vilebrequin 主打度假泳裤/短裤"],
    ["P1", "法式/极简/波西米亚", "男", "外套", "A.P.C., COS, MUJI无印良品, Uniqlo U",
     "夏", 8, "薄款衬衫式外套/无里衬夹克"],

    # ===== P1 哥特暗黑（全库0货，男女都缺）=====
    ["P1", "哥特暗黑", "中性", "上装", "血液供給BLOOD SUPPLY, 湿体wetbody, Killstar",
     "夏", 12, "全库0货；Killstar 为海外独立站(可试 shopify 源)，国内小众品牌走淘系"],
    ["P1", "哥特暗黑", "女", "连衣裙", "血液供給BLOOD SUPPLY, 湿体wetbody, Killstar",
     "夏", 10, "暗黑系吊带/网纱连衣裙"],
    ["P1", "哥特暗黑", "中性", "外套", "血液供給BLOOD SUPPLY, 湿体wetbody, Killstar",
     "夏", 8, "薄款外套/罩衫，避免厚重款以对齐夏季"],

    # ===== P1 摇滚机车（仅1件）=====
    ["P1", "摇滚机车", "中性", "外套(机车夹克)", "怪咖工作室, NANAICHILLI",
     "夏", 10, "薄款PU/牛仔机车夹克；国内潮牌走淘系(需cookie)"],
    ["P1", "摇滚机车", "中性", "上装(乐队T)", "怪咖工作室, NANAICHILLI",
     "夏", 12, "乐队印花短袖T；关键词 乐队T/摇滚印花"],
    ["P1", "摇滚机车", "中性", "下装(破洞牛仔)", "怪咖工作室, NANAICHILLI",
     "夏", 8, "破洞牛仔短裤/长裤"],

    # ===== P1 学院风（男款0/女款2，夏季各季仅1）=====
    ["P1", "学院风", "男", "上装(Polo/衬衫)", "Ralph Lauren, J.Crew, Barbour, UR学院系列",
     "夏", 15, "男款0货；Polo衫/牛津纺短袖衬衫；关键词 polo shirt(可试 uniqlo/shopify)"],
    ["P1", "学院风", "女", "下装(百褶裙)", "Ralph Lauren, J.Crew, UR学院系列",
     "夏", 12, "学院百褶短裙；品类归下装"],
    ["P1", "学院风", "中性", "上装(针织背心)", "Ralph Lauren, J.Crew, Barbour, UR学院系列",
     "夏", 8, "薄款针织背心/马甲；无袖，warmth 建议 1"],

    # ===== P1 日系侘寂·男（男款0）=====
    ["P1", "日系侘寂", "男", "上装(素色宽松衬衫)", "MUJI无印良品, Uniqlo, GU, COMOLI, AURALEE",
     "夏", 15, "男款0货；已实测 MUJI(shopify源)/Uniqlo(uniqlo源)可跑；素色/宽松/亚麻混纺"],
    ["P1", "日系侘寂", "男", "下装(亚麻长裤)", "MUJI无印良品, Uniqlo, GU, COMOLI, AURALEE",
     "夏", 12, "亚麻/棉麻宽松长裤；material 优先 亚麻"],

    # ===== P1 猎装风（夏季0货）=====
    ["P1", "猎装风", "中性", "外套(猎装夹克)", "Massimo Dutti, Barbour",
     "夏", 10, "夏季0货；肩袢/打褶口袋/亚麻材质的薄款猎装夹克"],

    # ===== P2 配饰品类（全线薄弱：配饰1/围巾1/袜7）=====
    ["P2", "配饰", "中性", "帽子", "MUJI无印良品, Uniqlo, 淘系配饰店",
     "夏", 7, "渔夫帽/草帽/棒球帽；MUJI/Uniqlo 可跑，淘系需cookie"],
    ["P2", "配饰", "中性", "包", "MUJI无印良品, Uniqlo, 淘系配饰店",
     "夏", 7, "帆布托特/斜挎小包"],
    ["P2", "配饰", "中性", "围巾", "MUJI无印良品, Uniqlo, 淘系配饰店",
     "夏", 7, "薄丝巾/棉麻方巾(围巾仅1件)；season 可标 夏"],
    ["P2", "配饰", "中性", "袜", "MUJI无印良品, Uniqlo, 淘系配饰店",
     "夏", 7, "船袜/薄款短袜；catalog 中袜归 帽子(配饰alias)枚举"],
]


def main():
    out = os.path.join(os.path.dirname(__file__), "crawl_tasks.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(ROWS)
    print(f"[OK] 写出 {len(ROWS)} 行任务 -> {out}")


if __name__ == "__main__":
    main()
