# -*- coding: utf-8 -*-
"""生成性别库存分析图表（静态 PNG）"""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

# 中文字体
fp = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
font_manager.fontManager.addfont(fp)
plt.rcParams["font.sans-serif"] = ["Noto Sans CJK SC"]
plt.rcParams["axes.unicode_minus"] = False

C_F, C_M, C_U = "#E86A92", "#4A90D9", "#B8B8C0"  # 女/男/中性

# ---------- 风格 × 性别（横向堆叠，按总量排序）----------
style = [
    ("极简", 93, 39, 14), ("运动机能", 49, 68, 35), ("通勤职场", 33, 103, 5),
    ("街头潮流", 19, 16, 87), ("工装实用", 26, 15, 55), ("先锋设计师", 26, 23, 27),
    ("法式慵懒", 31, 4, 5), ("波西米亚/度假", 23, 15, 0), ("都市酷感", 15, 15, 6),
    ("静奢/老钱", 13, 8, 5), ("西部牛仔", 7, 16, 0), ("复古年代", 5, 3, 0),
    ("猎装风", 0, 1, 2), ("学院风", 2, 0, 0), ("日系侘寂", 2, 0, 0),
    ("摇滚机车", 1, 0, 0), ("甜美少女", 0, 1, 0), ("浪漫田园", 0, 1, 0),
    ("哥特暗黑", 0, 0, 0),
]
style = sorted(style, key=lambda x: x[1] + x[2] + x[3])  # 升序，barh 从下往上
names = [s[0] for s in style]
f = [s[1] for s in style]
m = [s[2] for s in style]
u = [s[3] for s in style]

fig, ax = plt.subplots(figsize=(11, 8.5))
ax.barh(names, f, color=C_F, label="女")
ax.barh(names, m, left=f, color=C_M, label="男")
ax.barh(names, u, left=[f[i] + m[i] for i in range(len(f))], color=C_U, label="中性")
for i in range(len(names)):
    tot = f[i] + m[i] + u[i]
    if tot > 0:
        ax.text(tot + 1.5, i, str(tot), va="center", fontsize=9, color="#555")
ax.set_xlabel("单品数量（件）")
ax.set_title("19 个风格的性别构成（按总量排序，堆叠=女/男/中性）", fontsize=14, pad=12)
ax.legend(loc="lower right", frameon=False)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
plt.tight_layout()
plt.savefig("output/style_gender.png", dpi=130)
plt.close()

# ---------- 品类 × 性别（分组柱）----------
cat = [
    ("上装", 92, 113, 105), ("下装", 95, 70, 28), ("外套", 31, 46, 34),
    ("鞋", 12, 19, 57), ("包", 3, 2, 10), ("连衣裙", 10, 0, 3),
    ("帽子", 4, 2, 3), ("袜", 6, 0, 1), ("配饰", 1, 0, 0), ("围巾", 1, 0, 0),
]
cn = [c[0] for c in cat]
cf = [c[1] for c in cat]
cm = [c[2] for c in cat]
cu = [c[3] for c in cat]
import numpy as np
x = np.arange(len(cn))
w = 0.26
fig, ax = plt.subplots(figsize=(11, 5.2))
ax.bar(x - w, cf, w, color=C_F, label="女")
ax.bar(x, cm, w, color=C_M, label="男")
ax.bar(x + w, cu, w, color=C_U, label="中性")
ax.set_xticks(x)
ax.set_xticklabels(cn)
ax.set_ylabel("单品数量（件）")
ax.set_title("10 个品类的性别分布（分组=女/男/中性）", fontsize=14, pad=12)
ax.legend(frameon=False)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
for i in range(len(cn)):
    for off, val in [(-w, cf[i]), (0, cm[i]), (w, cu[i])]:
        if val > 0:
            ax.text(x[i] + off, val + 1, str(val), ha="center", fontsize=7.5, color="#555")
plt.tight_layout()
plt.savefig("output/cat_gender.png", dpi=130)
plt.close()

print("charts done")
