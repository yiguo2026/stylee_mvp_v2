#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为每道评测题生成一张平铺拼图：
每张图 = 该题 4 套搭配（rank1-4），每套一行：左侧套名/场合，右侧该套单品去背图缩略图 + 名称。
缺图的单品用浅灰占位框 + 名称。
输出: collages/{query_id}.png
"""
import json, os, textwrap
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
ITEMS = os.path.join(BASE, "items")
OUT = os.path.join(BASE, "collages")
os.makedirs(OUT, exist_ok=True)

FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
def font(sz):
    return ImageFont.truetype(FONT, sz)

# 布局参数
THUMB = 190          # 缩略图边长
PAD = 16             # 单品间距
ROW_LABEL_W = 150    # 每套左侧标签宽
ROW_H = THUMB + 46   # 每行高（图 + 名称）
ROW_GAP = 18
MARGIN = 28
HEADER_H = 96
BG = (247, 248, 250)
CARD = (255, 255, 255)
INK = (30, 33, 38)
SUB = (120, 128, 138)
LINE = (232, 234, 238)
ACCENT = (37, 99, 235)

def load_thumb(item_id):
    p = os.path.join(ITEMS, f"{item_id}.png")
    if not os.path.exists(p):
        return None
    try:
        im = Image.open(p).convert("RGBA")
    except Exception:
        return None
    # 贴到白底方形画布，等比缩放
    w, h = im.size
    scale = min((THUMB-16)/w, (THUMB-16)/h)
    nw, nh = max(1,int(w*scale)), max(1,int(h*scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (THUMB, THUMB), (255,255,255,255))
    canvas.alpha_composite(im, ((THUMB-nw)//2, (THUMB-nh)//2))
    return canvas.convert("RGB")

def fix_name(txt):
    if not txt: return ""
    if "\\u" in txt or "\\U" in txt:
        try:
            return txt.encode("utf-8").decode("unicode_escape")
        except Exception:
            return txt
    return txt

def wrap_text(draw, txt, f, maxw):
    lines=[]
    cur=""
    for ch in txt:
        if draw.textlength(cur+ch, font=f) <= maxw:
            cur+=ch
        else:
            lines.append(cur); cur=ch
    if cur: lines.append(cur)
    return lines[:2]

def draw_query(q):
    outfits = q["outfits"]
    # 每套最多单品数 -> 决定宽度
    maxslots = max(len(o["slots"]) for o in outfits)
    grid_w = ROW_LABEL_W + maxslots*(THUMB+PAD) + PAD
    W = grid_w + 2*MARGIN
    H = HEADER_H + len(outfits)*(ROW_H+ROW_GAP) + MARGIN
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    fq = font(30); flab=font(22); fname=font(17); fmeta=font(18); fbadge=font(16)
    # header
    d.rectangle([0,0,W,HEADER_H],fill=(255,255,255))
    d.line([0,HEADER_H,W,HEADER_H],fill=LINE,width=2)
    lb=q["labels"]
    d.text((MARGIN,20), f'{q["query_id"].upper()}  {q["text"]}', font=fq, fill=INK)
    meta = f'{lb.get("scenario","")} · {lb.get("style","")} · {lb.get("season","")} {lb.get("temp_range","")} · {"女" if lb.get("gender")=="female" else "男" if lb.get("gender")=="male" else "中性"}'
    d.text((MARGIN,62), meta, font=fmeta, fill=SUB)

    y = HEADER_H + MARGIN//2
    for o in outfits:
        # 行卡片背景
        d.rounded_rectangle([MARGIN, y, W-MARGIN, y+ROW_H], radius=14, fill=CARD, outline=LINE, width=1)
        # 左侧标签
        d.rounded_rectangle([MARGIN, y, MARGIN+8, y+ROW_H], radius=4, fill=ACCENT)
        d.text((MARGIN+18, y+16), f'搭配 {o["rank"]}', font=flab, fill=INK)
        occ = o.get("occasion","") or ""
        for i,ln in enumerate(wrap_text(d, occ, fname, ROW_LABEL_W-30)):
            d.text((MARGIN+18, y+48+i*22), ln, font=fname, fill=SUB)
        # 单品
        x = MARGIN + ROW_LABEL_W
        for s in o["slots"]:
            th = load_thumb(s["item_id"])
            box=[x, y+14, x+THUMB, y+14+THUMB]
            if th is None:
                d.rounded_rectangle(box, radius=10, fill=(240,241,243), outline=LINE, width=1)
                d.text((x+THUMB//2, y+14+THUMB//2), "无图", font=fname, fill=SUB, anchor="mm")
            else:
                img.paste(th, (x, y+14))
                d.rounded_rectangle(box, radius=10, outline=LINE, width=1)
            # 名称
            nm = fix_name(s.get("name",""))
            for i,ln in enumerate(wrap_text(d, nm, fname, THUMB)):
                d.text((x+THUMB//2, y+14+THUMB+4+i*20), ln, font=fname, fill=INK, anchor="ma")
            x += THUMB+PAD
        y += ROW_H+ROW_GAP
    out = os.path.join(OUT, f'{q["query_id"]}.png')
    img.save(out, "PNG")
    return out

def main():
    n=0; missimg=0
    for line in open(os.path.join(BASE,"results_real/outfits.jsonl")):
        q=json.loads(line)
        draw_query(q)
        n+=1
    print("collages generated:", n)

if __name__=="__main__":
    main()
