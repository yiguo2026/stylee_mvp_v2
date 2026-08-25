#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为每道评测题生成一张"最优搭配"拼图：只展示模型 rank1 的那一套。
横向大图排列该套所有单品去背图 + 名称，顶部标题为题目信息。
缺图单品用浅灰占位框。输出 collages_best/{query_id}.png
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
ITEMS = os.path.join(BASE, "items")
OUT = os.path.join(BASE, "collages_best")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
def font(sz): return ImageFont.truetype(FONT, sz)

# 修正后的类目：按 item_id 从 catalog 取，避免旧类目标签(帽子杂物桶)与图不符
_CAT = {c["item_id"]: c.get("category","") for c in json.load(open(os.path.join(BASE,"catalog.json")))}

THUMB = 300
PAD = 24
MARGIN = 36
HEADER_H = 120
NAME_H = 66
BG = (247, 248, 250)
CARD = (255, 255, 255)
INK = (30, 33, 38)
SUB = (120, 128, 138)
LINE = (232, 234, 238)
ACCENT = (37, 99, 235)

def load_thumb(item_id):
    p = os.path.join(ITEMS, f"{item_id}.png")
    if not os.path.exists(p): return None
    try: im = Image.open(p).convert("RGBA")
    except Exception: return None
    w, h = im.size
    scale = min((THUMB-20)/w, (THUMB-20)/h)
    nw, nh = max(1,int(w*scale)), max(1,int(h*scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (THUMB, THUMB), (255,255,255,255))
    canvas.alpha_composite(im, ((THUMB-nw)//2, (THUMB-nh)//2))
    return canvas.convert("RGB")

def fix_name(txt):
    if not txt: return ""
    if "\\u" in txt or "\\U" in txt:
        try: return txt.encode("utf-8").decode("unicode_escape")
        except Exception: return txt
    return txt

def wrap_text(draw, txt, f, maxw, maxlines=2):
    lines=[]; cur=""
    for ch in txt:
        if draw.textlength(cur+ch, font=f) <= maxw: cur+=ch
        else: lines.append(cur); cur=ch
    if cur: lines.append(cur)
    return lines[:maxlines]

def draw_best(q):
    outfits = sorted(q["outfits"], key=lambda o: o.get("rank", 99))
    best = outfits[0]
    slots = best["slots"]
    n = len(slots)
    grid_w = n*(THUMB+PAD) + PAD
    W = max(grid_w, 900) + 2*MARGIN
    H = HEADER_H + THUMB + NAME_H + 2*MARGIN
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    fq=font(34); fmeta=font(20); fname=font(19); fbadge=font(20)

    # header
    d.rectangle([0,0,W,HEADER_H],fill=(255,255,255))
    d.line([0,HEADER_H,W,HEADER_H],fill=LINE,width=2)
    lb=q["labels"]
    d.text((MARGIN,22), f'{q["query_id"].upper()}  {q["text"]}', font=fq, fill=INK)
    gender = "女" if lb.get("gender")=="female" else "男" if lb.get("gender")=="male" else "中性"
    meta = f'{lb.get("scenario","")} · {lb.get("style","")} · {lb.get("season","")} {lb.get("temp_range","")} · {gender}'
    d.text((MARGIN,70), meta, font=fmeta, fill=SUB)
    # best badge
    badge = f'★ 模型最优推荐 · 搭配{best.get("rank",1)}' + (f'（{best.get("occasion","")}）' if best.get("occasion") else '')
    tw = d.textlength(badge, font=fbadge)
    d.rounded_rectangle([W-MARGIN-tw-28, 30, W-MARGIN, 68], radius=19, fill=ACCENT)
    d.text((W-MARGIN-tw-14, 38), badge, font=fbadge, fill=(255,255,255))

    # items card
    y = HEADER_H + MARGIN
    d.rounded_rectangle([MARGIN, y, MARGIN+grid_w, y+THUMB+NAME_H], radius=16, fill=CARD, outline=LINE, width=1)
    x = MARGIN + PAD
    for s in slots:
        th = load_thumb(s["item_id"])
        box=[x, y+14, x+THUMB, y+14+THUMB]
        if th is None:
            d.rounded_rectangle(box, radius=12, fill=(240,241,243), outline=LINE, width=1)
            d.text((x+THUMB//2, y+14+THUMB//2), "无图", font=fname, fill=SUB, anchor="mm")
        else:
            img.paste(th, (x, y+14))
            d.rounded_rectangle(box, radius=12, outline=LINE, width=1)
        cat = _CAT.get(s["item_id"], s.get("category",""))
        if cat:
            d.text((x+10, y+22), cat, font=fname, fill=ACCENT)
        nm = fix_name(s.get("name",""))
        for i,ln in enumerate(wrap_text(d, nm, fname, THUMB-8)):
            d.text((x+THUMB//2, y+14+THUMB+6+i*22), ln, font=fname, fill=INK, anchor="ma")
        x += THUMB+PAD
    img.save(os.path.join(OUT, f'{q["query_id"]}.png'), "PNG")

def main():
    n=0
    for line in open(os.path.join(BASE,"results_real/outfits.jsonl")):
        draw_best(json.loads(line)); n+=1
    print("best collages generated:", n)

if __name__=="__main__":
    main()
