#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为每条 query 生成一张"模型第一推荐(Top1)"搭配拼图。

沿用 make_collage_best.py 的版式：横向排列该套全部单品去背图 + 名称，
顶部题目信息 + "★ 模型最优推荐 Top1"角标。缺图/补买单品用浅灰占位框。
数据源 = results_v2_top1/outfits_top1.jsonl（仅 Top1），图片 = items_v2/，
类目以 catalog_v2.json 为准，输出 output/top1_recommendations/{query_id}.png。
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
ITEMS = os.path.join(BASE, "items_v2")
OUT = os.path.join(BASE, "output", "top1_recommendations")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
def font(sz): return ImageFont.truetype(FONT, sz)

_CAT = {c["item_id"]: c.get("category", "") for c in json.load(open(os.path.join(BASE, "catalog_v2.json")))}

THUMB, PAD, MARGIN, HEADER_H, NAME_H = 300, 24, 36, 120, 66
BG, CARD, INK, SUB, LINE, ACCENT = (247,248,250),(255,255,255),(30,33,38),(120,128,138),(232,234,238),(37,99,235)


def load_thumb(item_id):
    p = os.path.join(ITEMS, f"{item_id}.png")
    if not item_id or not os.path.exists(p):
        return None
    try:
        im = Image.open(p).convert("RGBA")
    except Exception:
        return None
    w, h = im.size
    scale = min((THUMB-20)/w, (THUMB-20)/h)
    nw, nh = max(1, int(w*scale)), max(1, int(h*scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (THUMB, THUMB), (255,255,255,255))
    canvas.alpha_composite(im, ((THUMB-nw)//2, (THUMB-nh)//2))
    return canvas.convert("RGB")


def wrap_text(draw, txt, f, maxw, maxlines=2):
    lines, cur = [], ""
    for ch in txt:
        if draw.textlength(cur+ch, font=f) <= maxw:
            cur += ch
        else:
            lines.append(cur); cur = ch
    if cur:
        lines.append(cur)
    return lines[:maxlines]


def draw_best(q):
    if not q.get("outfits"):
        return False
    best = q["outfits"][0]
    slots = best["slots"] or []
    n = max(1, len(slots))
    grid_w = n*(THUMB+PAD) + PAD
    W = max(grid_w, 900) + 2*MARGIN
    H = HEADER_H + THUMB + NAME_H + 2*MARGIN
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    fq, fmeta, fname, fbadge = font(34), font(20), font(19), font(20)

    d.rectangle([0,0,W,HEADER_H], fill=(255,255,255))
    d.line([0,HEADER_H,W,HEADER_H], fill=LINE, width=2)
    lb = q["labels"]
    d.text((MARGIN,22), f'{q["query_id"].upper()}  {q["text"]}', font=fq, fill=INK)
    gender = "女" if lb.get("gender")=="female" else "男" if lb.get("gender")=="male" else "中性"
    meta = f'{lb.get("scenario","")} · {lb.get("style","")} · {lb.get("season","")} {lb.get("temp_range","")} · {gender}'
    d.text((MARGIN,70), meta, font=fmeta, fill=SUB)
    ws = best.get("weighted_score")
    badge = f'★ 模型最优推荐 Top1' + (f'  加权分{ws}' if ws is not None else '')
    tw = d.textlength(badge, font=fbadge)
    d.rounded_rectangle([W-MARGIN-tw-28, 30, W-MARGIN, 68], radius=19, fill=ACCENT)
    d.text((W-MARGIN-tw-14, 38), badge, font=fbadge, fill=(255,255,255))

    y = HEADER_H + MARGIN
    d.rounded_rectangle([MARGIN, y, MARGIN+grid_w, y+THUMB+NAME_H], radius=16, fill=CARD, outline=LINE, width=1)
    x = MARGIN + PAD
    for s in slots:
        owned = s.get("owned")
        iid = s.get("item_id") if owned else None
        th = load_thumb(iid)
        box = [x, y+14, x+THUMB, y+14+THUMB]
        if th is None:
            d.rounded_rectangle(box, radius=12, fill=(240,241,243), outline=LINE, width=1)
            tip = "补买建议" if not owned else "无图"
            d.text((x+THUMB//2, y+14+THUMB//2), tip, font=fname, fill=SUB, anchor="mm")
        else:
            img.paste(th, (x, y+14))
            d.rounded_rectangle(box, radius=12, outline=LINE, width=1)
        cat = _CAT.get(iid, s.get("category",""))
        if cat:
            d.text((x+10, y+22), cat, font=fname, fill=ACCENT)
        nm = ("补:" if not owned else "") + (s.get("name","") or "")
        for i, ln in enumerate(wrap_text(d, nm, fname, THUMB-8)):
            d.text((x+THUMB//2, y+14+THUMB+6+i*22), ln, font=fname, fill=INK, anchor="ma")
        x += THUMB+PAD
    img.save(os.path.join(OUT, f'{q["query_id"]}.png'), "PNG")
    return True


def main():
    n = 0
    for line in open(os.path.join(BASE, "results_v2_top1/outfits_top1.jsonl")):
        if draw_best(json.loads(line)):
            n += 1
    print("Top1 collages generated:", n, "->", OUT)


if __name__ == "__main__":
    main()
