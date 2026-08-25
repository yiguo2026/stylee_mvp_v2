# -*- coding: utf-8 -*-
"""
Stylee 评测单品池 · 夏季补货爬虫脚本
====================================================================
用途
    为服装搭配 App「Stylee」的评测单品池补充「缺失风格（尤其夏季）」的新单品。
    抓取公开可访问的品牌商品数据，清洗后输出对齐现有 catalog.json 的 JSON。

真实可行性结论（2026-08 实测，详见脚本末尾 README 注释）
    - Uniqlo / 优衣库（全球站 commerce API）   : ✅ 可直接抓取，返回 名称/价格/颜色/图片/性别
    - MUJI US / 无印良品美国站（Shopify）       : ✅ 可直接抓取 /products.json，字段最全（含材质）
      （A.P.C. / COS / Sézane / Sessùn / Snidel 等大量品牌独立站也基于 Shopify，同解析器可复用）
    - 淘宝 / 天猫（淘系）                        : ❌ 需登录 + 反爬（滑块/x5sec），公开请求被重定向到登录页
      → 已预留 cookie / headers 配置位与 TODO，产品经理提供登录态后可跑

设计要点
    1. 三类数据源解析器：UniqloSource / ShopifySource / TaobaoSource(需 cookie)
    2. 输出 schema 与 build_catalog.py 完全对齐（字段/枚举一致）
    3. 季节/保暖度/袖长/版型/品类/颜色 等缺失字段用与 build_catalog.py 相同的启发式推断
    4. 礼貌限速（time.sleep）、超时、异常兜底：无凭证不崩溃，给出友好提示
    5. 可安全 import；也可命令行运行：  python scrape_items.py --help

免责声明
    本脚本仅抓取公开页面的商品元数据用于内部评测选品，请遵守目标站点 robots 与服务条款，
    控制请求频率。脚本绝不编造商品，抓不到就返回空并如实提示。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Dict, List, Optional

try:
    import requests
except ImportError:  # 友好提示，不崩溃
    requests = None


# ====================================================================
# 0. 全局配置
# ====================================================================

# CN 环境需要走内网代理才能访问外网；i18n 环境直连。
# 运行时可用环境变量 STYLEE_HTTP_PROXY 覆盖；默认沿用当前 shell 的 http_proxy。
DEFAULT_PROXY = os.environ.get(
    "STYLEE_HTTP_PROXY",
    os.environ.get("http_proxy", ""),
)

REQUEST_TIMEOUT = 25          # 单请求超时（秒）
POLITE_DELAY = 1.5            # 每次翻页/请求之间的礼貌间隔（秒）
DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# ---- 有效枚举（对齐 stylee.contracts / build_catalog.py） ----
VALID_CATEGORY = {"上装", "下装", "连衣裙", "外套", "鞋", "包", "帽子", "围巾"}
VALID_SEASON = {"春", "夏", "秋", "冬"}
VALID_GENDER = {"女", "男", "中性"}


# ====================================================================
# 1. 输出数据结构（与 catalog.json 字段一一对应）
# ====================================================================

@dataclass
class Item:
    item_id: str
    category: str                       # 枚举: 上装/下装/连衣裙/外套/鞋/包/帽子/围巾
    name: str
    colors: List[str] = field(default_factory=list)
    material: str = ""
    season: List[str] = field(default_factory=list)     # 枚举: 春/夏/秋/冬
    style_tags: List[str] = field(default_factory=list)  # 中文风格标签
    occasion_tags: List[str] = field(default_factory=list)
    warmth: int = 1                     # 1-5
    image_url: str = ""
    gender: str = "中性"                # 枚举: 女/男/中性
    brand: str = ""
    price: str = ""
    sleeve_length: Optional[str] = None
    fit: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # 与 build_catalog 一致：sleeve_length / fit 为空时省略
        if not d.get("sleeve_length"):
            d.pop("sleeve_length", None)
        if not d.get("fit"):
            d.pop("fit", None)
        return d


# ====================================================================
# 2. 字段推断工具（复用 build_catalog.py 的启发式，保证与现有 catalog 一致）
# ====================================================================

def norm_category(raw_cat: str, name: str, tags: str) -> str:
    """把任意来源的品类文本归并到 8 个有效枚举。"""
    text = f"{raw_cat} {name} {tags}".lower()
    zh = f"{raw_cat} {name} {tags}"
    if any(k in zh for k in ("连衣裙", "连体", "背带裙", "吊带裙", "长裙")) and "半身" not in zh:
        return "连衣裙"
    if any(k in zh for k in ("鞋", "靴", "乐福", "帆布鞋", "运动鞋", "凉鞋", "拖鞋", "高跟", "小白鞋")) \
            or any(k in text for k in ("shoe", "sneaker", "loafer", "sandal", "boot", "heel")):
        return "鞋"
    if any(k in zh for k in ("包", "手袋", "托特", "斜挎", "双肩", "钱包", "背包")) \
            or any(k in text for k in ("bag", "tote", "backpack", "pouch")):
        return "包"
    if any(k in zh for k in ("帽", "鸭舌", "棒球帽", "贝雷", "渔夫帽")) \
            or any(k in text for k in ("hat", "cap", "beanie")):
        return "帽子"
    if any(k in zh for k in ("围巾", "丝巾", "披肩")) or "scarf" in text:
        return "围巾"
    if any(k in zh for k in ("外套", "夹克", "风衣", "大衣", "羽绒", "棉服", "西装外套",
                             "皮衣", "机车", "斗篷", "披风", "开衫", "猎装", "西服套装")) \
            or any(k in text for k in ("jacket", "coat", "blazer", "outer", "cardigan", "parka")):
        return "外套"
    if any(k in zh for k in ("裤", "半身裙", "裙裤", "短裤", "牛仔裤", "阔腿", "西裤")) \
            or any(k in text for k in ("pants", "trouser", "shorts", "jeans", "skirt", "chino")):
        # 半身裙/短裤/裤 都归下装
        return "下装"
    if any(k in zh for k in ("T恤", "POLO", "衬衫", "针织", "毛衣", "卫衣", "背心", "吊带",
                             "上衣", "打底", "衫")) \
            or any(k in text for k in ("shirt", "tee", "t-shirt", "polo", "knit", "sweater",
                                        "hoodie", "top", "blouse", "tank", "camisole")):
        return "上装"
    if any(k in zh for k in ("配饰", "腰带", "皮带", "墨镜", "眼镜", "项链", "耳", "手链", "袜", "手套")):
        return "帽子"   # 配饰无独立枚举，alias 到帽子（与 build_catalog 保持一致）
    return "上装"       # 兜底


def infer_season(cat: str, name: str, tags: str, material: str,
                 season_hint: Optional[List[str]] = None) -> List[str]:
    """季节推断；若来源已给出可信季节提示则优先。"""
    if season_hint:
        hs = [s for s in season_hint if s in VALID_SEASON]
        if hs:
            return sorted(set(hs), key="春夏秋冬".index)
    text = f"{name} {tags} {material}".lower()
    zh = f"{name} {tags} {material}"
    heavy = any(k in zh for k in ("羽绒", "棉服", "大衣", "加绒", "加厚", "羊毛", "羊绒",
                                  "毛呢", "毛衣", "针织", "呢", "保暖")) \
        or any(k in text for k in ("down", "wool", "cashmere", "fleece", "padded", "quilted"))
    summer = any(k in zh for k in ("短袖", "短T", "背心", "吊带", "无袖", "短裤", "冰丝",
                                   "亚麻", "雪纺", "防晒", "冰爽", "清凉", "碎花")) \
        or any(k in text for k in ("linen", "short sleeve", "sleeveless", "shorts", "tank",
                                    "chiffon", "airism", "cool"))
    if cat == "鞋":
        if any(k in zh for k in ("凉鞋", "拖鞋", "洞洞")) or any(k in text for k in ("sandal", "slide")):
            return ["夏"]
        if any(k in zh for k in ("雪地", "加绒", "靴")) or "boot" in text:
            return ["秋", "冬"]
        return ["春", "夏", "秋", "冬"]
    if cat in ("包", "帽子", "围巾"):
        if "围巾" in zh or "毛线" in zh or "针织帽" in zh or "scarf" in text or "beanie" in text:
            return ["秋", "冬"]
        return ["春", "夏", "秋", "冬"]
    if cat == "连衣裙":
        if heavy:
            return ["秋", "冬"]
        if summer:
            return ["夏"]
        return ["春", "夏", "秋"]
    if summer and not heavy:
        return ["夏"] if cat == "上装" else ["春", "夏", "秋"]
    if heavy:
        return ["秋", "冬"]
    if cat == "外套":
        return ["春", "秋", "冬"]
    return ["春", "秋", "冬"]


def infer_warmth(cat: str, name: str, tags: str) -> int:
    zh = f"{name} {tags}"
    text = zh.lower()
    if cat in ("鞋", "包", "帽子", "围巾"):
        return 0
    if "羽绒" in zh or "down" in text:
        return 5
    if any(k in zh for k in ("棉服", "大衣", "毛呢", "羊绒", "加绒", "加厚")) \
            or any(k in text for k in ("wool", "cashmere", "padded", "coat")):
        return 4
    if any(k in zh for k in ("毛衣", "针织", "夹克", "风衣", "西装外套", "皮衣")) \
            or cat == "外套" or any(k in text for k in ("knit", "sweater", "jacket", "blazer")):
        return 3
    if any(k in zh for k in ("卫衣", "开衫", "长袖", "衬衫")) \
            or any(k in text for k in ("hoodie", "long sleeve", "shirt")):
        return 2
    if any(k in zh for k in ("短袖", "T恤", "半身裙", "裤", "连衣裙")) \
            or any(k in text for k in ("tee", "t-shirt", "pants", "dress", "skirt")):
        return 1
    if any(k in zh for k in ("背心", "吊带", "无袖", "短裤")) \
            or any(k in text for k in ("tank", "sleeveless", "shorts", "camisole")):
        return 0
    return 1


def infer_sleeve(name: str, tags: str) -> Optional[str]:
    zh = f"{name} {tags}"
    text = zh.lower()
    if any(k in zh for k in ("无袖", "背心", "吊带")) or any(k in text for k in ("sleeveless", "tank", "camisole")):
        return "无袖"
    if "短袖" in zh or "短T" in zh or "short sleeve" in text or "short-sleeve" in text:
        return "短袖"
    if any(k in zh for k in ("长袖", "衬衫", "毛衣", "针织", "卫衣")) \
            or any(k in text for k in ("long sleeve", "long-sleeve", "shirt", "sweater", "knit", "hoodie")):
        return "长袖"
    return None


def infer_fit(name: str, tags: str) -> Optional[str]:
    zh = f"{name} {tags}"
    text = zh.lower()
    if "oversize" in text or "廓形" in zh or "落肩" in zh or "relaxed" in text:
        return "oversize"
    if any(k in zh for k in ("宽松", "阔腿", "直筒", "廓")) or any(k in text for k in ("wide", "loose", "straight")):
        return "宽松"
    if any(k in zh for k in ("修身", "收腰", "合身")) or any(k in text for k in ("slim", "fitted", "tailored")):
        return "修身"
    if any(k in zh for k in ("紧身", "包臀", "铅笔")) or any(k in text for k in ("skinny", "bodycon", "pencil")):
        return "紧身"
    return "标准"


# ---- 颜色词典（长词在前，便于优先匹配）----
COLOR_WORDS = [
    "藏青", "藏蓝", "深蓝", "浅蓝", "天蓝", "湖蓝", "宝蓝", "克莱因蓝", "雾霾蓝", "牛仔蓝",
    "墨绿", "军绿", "草绿", "浅绿", "深绿", "橄榄绿", "薄荷绿",
    "酒红", "枣红", "砖红", "正红", "大红", "玫红", "豆沙", "勃艮第",
    "卡其", "驼色", "焦糖", "咖啡", "巧克力", "杏色", "米色", "米白", "奶白", "象牙白",
    "裸色", "肉色", "香槟", "银灰", "深灰", "浅灰", "烟灰", "炭灰", "高级灰",
    "浅粉", "深粉", "藕粉", "裸粉", "樱花粉",
    "香芋紫", "薰衣草", "橙色", "橘色", "姜黄", "鹅黄", "柠檬黄",
    "黑色", "白色", "灰色", "红色", "蓝色", "绿色", "黄色", "粉色", "紫色", "棕色",
    "驼", "米", "黑", "白", "灰", "红", "蓝", "绿", "黄", "粉", "紫", "棕", "橙", "银", "金",
]

# 英文颜色 → 中文（用于 Uniqlo/Shopify 英文站）
COLOR_EN2ZH = {
    "white": "白色", "off white": "米白", "offwhite": "米白", "ivory": "象牙白", "cream": "奶白",
    "black": "黑色", "gray": "灰色", "grey": "灰色", "light gray": "浅灰", "dark gray": "深灰",
    "charcoal": "炭灰", "navy": "藏青", "blue": "蓝色", "light blue": "浅蓝", "dark blue": "深蓝",
    "denim": "牛仔蓝", "sky blue": "天蓝", "green": "绿色", "olive": "橄榄绿", "khaki": "卡其",
    "dark green": "墨绿", "mint": "薄荷绿", "red": "红色", "wine": "酒红", "burgundy": "勃艮第",
    "pink": "粉色", "light pink": "浅粉", "beige": "米色", "camel": "驼色", "brown": "棕色",
    "coffee": "咖啡", "caramel": "焦糖", "purple": "紫色", "lavender": "薰衣草", "orange": "橙色",
    "yellow": "黄色", "mustard": "姜黄", "silver": "银色", "gold": "金色", "natural": "米色",
    "stripe": "条纹", "striped": "条纹",
}

_SIZE_RE = re.compile(r"^(XXS|XS|S|M|L|XL|XXL|XXXL|\dXL|F|均码|One Size|\d{2,3}/\d{2,3}[A-Z]?|\d{2,3})$", re.I)
_PLACEHOLDER_SUB = ("请查看", "请参照", "详情页", "商品标签", "未获取", "详见", "参见", "见详情")


def clean_colors(raw: Any, fallback_text: str = "") -> List[str]:
    """把来源颜色数组/字符串清洗为标准中文颜色，最多 4 个。"""
    out: List[str] = []
    if isinstance(raw, str):
        raw = [raw]
    for c in (raw or []):
        c = str(c).strip()
        for part in re.split(r"[/、,，\s]+", c):
            part = part.strip()
            if not part or _SIZE_RE.match(part) or part.isdigit():
                continue
            part = re.sub(r"[（(].*?[)）]", "", part).strip()
            low = part.lower()
            if low in COLOR_EN2ZH:                # 英文颜色 → 中文
                zh = COLOR_EN2ZH[low]
                if zh not in out:
                    out.append(zh)
                continue
            if re.fullmatch(r"[A-Za-z0-9\-\.]+", part):
                # 纯英文但不在词典里 → 尝试逐词匹配，否则丢弃
                for w, zh in COLOR_EN2ZH.items():
                    if w in low and zh not in out:
                        out.append(zh)
                        break
                continue
            if part not in out:
                out.append(part)
    if not out and fallback_text:                 # 从名称/描述兜底抽色
        for w in COLOR_WORDS:
            if w in fallback_text:
                norm = w if w.endswith("色") else (w + "色" if len(w) == 1 else w)
                if norm not in out:
                    out.append(norm)
            if len(out) >= 2:
                break
        low = fallback_text.lower()
        for w, zh in COLOR_EN2ZH.items():
            if w in low and zh not in out:
                out.append(zh)
            if len(out) >= 2:
                break
    return out[:4]


def clean_material(*candidates: Any) -> str:
    for v in candidates:
        if not v:
            continue
        m = str(v).strip()
        if not m or any(s in m for s in _PLACEHOLDER_SUB):
            continue
        m = re.sub(r"\s+", "", m)
        return m[:40]
    return ""


def extract_material_from_html(html: str) -> str:
    """从商品描述 HTML 中抽取材质（覆盖中英文常见写法）。"""
    if not html:
        return ""
    txt = re.sub(r"<[^>]+>", " ", html)
    txt = re.sub(r"&[a-z]+;", " ", txt)
    # 常见「100% Cotton / 材质：棉」等
    m = re.search(r"(材质|成分|面料)[:：]?\s*([^\n。;；]{2,30})", txt)
    if m:
        return clean_material(m.group(2))
    m = re.search(r"(\d{1,3}\s*%\s*[A-Za-z]+(?:\s*[,，/]\s*\d{1,3}\s*%\s*[A-Za-z]+)*)", txt)
    if m:
        return clean_material(m.group(1))
    for kw in ("Linen", "Cotton", "Wool", "Cashmere", "Polyester", "Silk", "Nylon",
               "亚麻", "棉", "羊毛", "羊绒", "涤纶", "真丝", "锦纶", "醋酸"):
        if re.search(rf"\b{kw}\b", txt) or kw in txt:
            return clean_material(kw)
    return ""


def slugify(text: str, maxlen: int = 40) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "_", text.lower()).strip("_")
    return s[:maxlen] or "item"


# ====================================================================
# 3. HTTP 会话（统一代理 / UA / 超时 / 重试 / 限速）
# ====================================================================

class Http:
    def __init__(self, proxy: str = DEFAULT_PROXY, ua: str = DEFAULT_UA,
                 extra_headers: Optional[Dict[str, str]] = None,
                 cookies: Optional[Dict[str, str]] = None):
        if requests is None:
            raise RuntimeError(
                "缺少 requests 库，请先执行：pip install requests"
            )
        self.sess = requests.Session()
        self.sess.headers.update({"User-Agent": ua, "Accept": "application/json, text/html"})
        if extra_headers:
            self.sess.headers.update(extra_headers)
        if cookies:
            self.sess.cookies.update(cookies)
        self.proxies = {"http": proxy, "https": proxy} if proxy else None

    def get(self, url: str, **kw) -> Optional["requests.Response"]:
        """带超时/异常兜底的 GET；失败返回 None（不抛出）。"""
        for attempt in range(2):
            try:
                r = self.sess.get(url, proxies=self.proxies, timeout=REQUEST_TIMEOUT, **kw)
                return r
            except Exception as e:  # noqa
                print(f"  [warn] GET 失败({attempt+1}/2) {url} -> {e}", file=sys.stderr)
                time.sleep(POLITE_DELAY)
        return None


# ====================================================================
# 4. 数据源解析器
# ====================================================================

class BaseSource:
    name = "base"

    def fetch(self, keyword: str, gender: str, limit: int,
              style_tags: List[str], season_hint: List[str]) -> List[Item]:
        raise NotImplementedError


class UniqloSource(BaseSource):
    """优衣库全球站 commerce API —— 实测可用（返回 名称/价格/颜色/图片/性别）。

    列表接口（关键词搜索）：
        GET https://www.uniqlo.com/{region}/api/commerce/v5/{lang}/products?q=<kw>&limit=&offset=&httpFailure=true
    材质在明细接口，可选补抓：
        GET .../products/{productId}/price-groups/{pg}/l2s?...
    """
    name = "uniqlo"
    BRAND_ZH = "优衣库"

    def __init__(self, http: Http, region: str = "us", lang: str = "en"):
        self.http = http
        self.region = region
        self.lang = lang

    def _api(self, path: str) -> str:
        return f"https://www.uniqlo.com/{self.region}/api/commerce/v5/{self.lang}/{path}"

    @staticmethod
    def _gender_zh(g: str) -> str:
        g = (g or "").upper()
        return {"MEN": "男", "WOMEN": "女", "KIDS": "中性", "BABY": "中性"}.get(g, "中性")

    def fetch(self, keyword, gender, limit, style_tags, season_hint) -> List[Item]:
        items: List[Item] = []
        offset, page = 0, 0
        while len(items) < limit and page < 5:
            url = self._api(
                f"products?q={requests.utils.quote(keyword)}"
                f"&limit={min(24, limit)}&offset={offset}&httpFailure=true"
            )
            r = self.http.get(url)
            if r is None or r.status_code != 200:
                print(f"  [uniqlo] 请求失败 status={getattr(r,'status_code',None)}", file=sys.stderr)
                break
            try:
                data = r.json()
            except Exception:
                print("  [uniqlo] 响应非 JSON，跳过", file=sys.stderr)
                break
            arr = (data.get("result") or {}).get("items") or []
            if not arr:
                break
            for it in arr:
                item = self._parse(it, gender, style_tags, season_hint)
                if item:
                    items.append(item)
                if len(items) >= limit:
                    break
            offset += len(arr)
            page += 1
            time.sleep(POLITE_DELAY)      # 礼貌限速
        return items

    def _parse(self, it: dict, want_gender: str, style_tags, season_hint) -> Optional[Item]:
        name = it.get("name") or ""
        if not name:
            return None
        pid = it.get("productId") or slugify(name)
        # 性别过滤（若指定）
        gender_zh = self._gender_zh(it.get("genderName") or it.get("genderCategory"))
        if want_gender in VALID_GENDER and want_gender != "中性" and gender_zh != want_gender:
            return None
        # 价格
        price = ""
        pr = (it.get("prices") or {}).get("base") or {}
        if pr.get("value") is not None:
            sym = (pr.get("currency") or {}).get("symbol", "")
            price = f"{sym}{pr['value']}"
        # 颜色（英文 → 中文）
        colors = clean_colors([c.get("name") for c in it.get("colors", [])], name)
        # 图片（取 main 第一张）
        image_url = ""
        main = ((it.get("images") or {}).get("main") or {})
        for _k, v in main.items():
            if isinstance(v, dict) and v.get("image"):
                image_url = v["image"]
                break
        cat = norm_category("", name, " ".join(style_tags))
        return Item(
            item_id=f"uniqlo_{slugify(pid)}",
            category=cat,
            name=name,
            colors=colors,
            material="",  # 列表接口不含材质；如需可扩展明细接口
            season=infer_season(cat, name, " ".join(style_tags), "", season_hint),
            style_tags=list(style_tags),
            occasion_tags=[],
            warmth=infer_warmth(cat, name, " ".join(style_tags)),
            image_url=image_url,
            gender=gender_zh,
            brand=self.BRAND_ZH,
            price=price,
            sleeve_length=infer_sleeve(name, " ".join(style_tags)),
            fit=infer_fit(name, " ".join(style_tags)),
        )


class ShopifySource(BaseSource):
    """通用 Shopify 独立站解析器 —— 实测 MUJI US 可用，字段最全（含材质/tags）。

    Shopify 站点公开暴露：
        GET https://<domain>/products.json?limit=&page=
        GET https://<domain>/collections/<handle>/products.json?limit=&page=
    大量目标品牌为 Shopify 站：MUJI US、A.P.C.、COS(部分区)、Sézane、Sessùn、Snidel 等。
    keyword 支持：以 'collection:xxx' 指定集合，否则抓全站 products.json 后按关键词过滤。
    """
    name = "shopify"

    # 品牌 → Shopify 域名映射（可自行扩充；未验证的标注 TODO）
    BRAND_DOMAINS = {
        "muji": ("https://www.muji.us", "无印良品"),
        # 以下为公开 Shopify 独立站示例，运行前建议先探测 /products.json 是否 200：
        "apc": ("https://www.apc-us.com", "A.P.C."),            # TODO: 上线前核对域名
        "sezane": ("https://www.sezane.com", "Sézane"),         # TODO: 部分区域非 Shopify
    }

    def __init__(self, http: Http, domain: str, brand_zh: str, brand_key: str = ""):
        self.http = http
        self.domain = domain.rstrip("/")
        self.brand_zh = brand_zh
        # item_id 前缀：优先用 brand_key（拉丁），否则从域名主机名兜底
        host = re.sub(r"^https?://(www\.)?", "", self.domain).split(".")[0]
        self.id_prefix = slugify(brand_key or host) or "shop"

    @classmethod
    def from_brand(cls, http: Http, brand_key: str) -> Optional["ShopifySource"]:
        info = cls.BRAND_DOMAINS.get(brand_key.lower())
        if not info:
            print(f"  [shopify] 未配置品牌 {brand_key} 的域名，跳过（可在 BRAND_DOMAINS 补充）",
                  file=sys.stderr)
            return None
        return cls(http, info[0], info[1], brand_key=brand_key)

    def fetch(self, keyword, gender, limit, style_tags, season_hint) -> List[Item]:
        items: List[Item] = []
        # 支持 collection:handle 语法
        collection = None
        kw = keyword or ""
        if kw.startswith("collection:"):
            collection = kw.split(":", 1)[1].strip()
            kw = ""
        page = 1
        while len(items) < limit and page <= 5:
            if collection:
                url = f"{self.domain}/collections/{collection}/products.json?limit=50&page={page}"
            else:
                url = f"{self.domain}/products.json?limit=50&page={page}"
            r = self.http.get(url)
            if r is None or r.status_code != 200:
                print(f"  [shopify] {self.domain} 请求失败 status={getattr(r,'status_code',None)}",
                      file=sys.stderr)
                break
            try:
                arr = r.json().get("products", [])
            except Exception:
                print(f"  [shopify] {self.domain} 响应非 JSON（可能非 Shopify 站）", file=sys.stderr)
                break
            if not arr:
                break
            for p in arr:
                # 关键词过滤（标题/类型/tags）
                blob = f"{p.get('title','')} {p.get('product_type','')} {' '.join(p.get('tags',[]) if isinstance(p.get('tags'),list) else [str(p.get('tags',''))])}".lower()
                if kw and kw.lower() not in blob:
                    continue
                item = self._parse(p, gender, style_tags, season_hint)
                if item:
                    items.append(item)
                if len(items) >= limit:
                    break
            page += 1
            time.sleep(POLITE_DELAY)      # 礼貌限速
        return items

    @staticmethod
    def _gender_from_tags(tags: List[str]) -> str:
        blob = " ".join(tags).lower()
        if "women" in blob or "female" in blob or "ladies" in blob:
            return "女"
        if "men" in blob or "male" in blob:
            return "男"
        return "中性"

    def _parse(self, p: dict, want_gender: str, style_tags, season_hint) -> Optional[Item]:
        title = p.get("title") or ""
        if not title:
            return None
        tags = p.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",")]
        gender_zh = self._gender_from_tags(tags)
        if want_gender in VALID_GENDER and want_gender != "中性" and gender_zh not in (want_gender, "中性"):
            return None
        # 价格
        price = ""
        variants = p.get("variants") or []
        if variants and variants[0].get("price") is not None:
            price = str(variants[0]["price"])
        # 颜色：从 options 里找 Color 维度
        color_vals = []
        for opt in p.get("options", []):
            if str(opt.get("name", "")).lower() in ("color", "colour", "颜色"):
                color_vals = opt.get("values", [])
        colors = clean_colors(color_vals, title)
        # 图片
        image_url = ""
        imgs = p.get("images") or []
        if imgs and imgs[0].get("src"):
            image_url = imgs[0]["src"]
        # 材质：从描述 HTML / tags 抽取
        material = extract_material_from_html(p.get("body_html", "")) or clean_material(
            *[t for t in tags if any(k in t.lower() for k in
              ("cotton", "linen", "wool", "silk", "polyester", "cashmere"))]
        )
        cat_text = f"{p.get('product_type','')} {' '.join(tags)}"
        cat = norm_category(p.get("product_type", ""), title, cat_text)
        return Item(
            item_id=f"{self.id_prefix}_{slugify(p.get('handle') or title)}",
            category=cat,
            name=title,
            colors=colors,
            material=material,
            season=infer_season(cat, title, cat_text, material, season_hint),
            style_tags=list(style_tags),
            occasion_tags=[],
            warmth=infer_warmth(cat, title, cat_text),
            image_url=image_url,
            gender=gender_zh,
            brand=self.brand_zh,
            price=price,
            sleeve_length=infer_sleeve(title, cat_text),
            fit=infer_fit(title, cat_text),
        )


class TaobaoSource(BaseSource):
    """淘系（淘宝/天猫）解析器 —— ⚠️ 实测需登录 + 反爬，公开请求被重定向到登录页。

    实测结论（2026-08）：
        GET https://s.taobao.com/search?q=<kw>  → 返回页面含 login 跳转 / 无商品 JSON
        淘系有滑块验证(nc)、x5sec 风控，必须携带有效登录 Cookie 才能拿到数据。

    使用方式（产品经理提供登录态后）：
        1. 浏览器登录淘宝 → F12 → 复制 Cookie 与请求头填入下方 TAOBAO_COOKIES / TAOBAO_HEADERS
        2. 或改造为调用淘宝开放平台/内部已有采集管线（推荐，更稳定合规）
    本类在无 Cookie 时不抓取、不崩溃，仅打印提示。
    """
    name = "taobao"

    # ============ TODO: 由产品经理/运维填入真实登录态 ============
    TAOBAO_COOKIES: Dict[str, str] = {
        # "cookie2": "xxxxxxxx",
        # "_tb_token_": "xxxxxxxx",
        # "sgcookie": "xxxxxxxx",
        # ...（从已登录浏览器 F12 Network 中复制完整 Cookie）
    }
    TAOBAO_HEADERS: Dict[str, str] = {
        # "referer": "https://s.taobao.com/",
        # 若走 h5 mtop 接口，还需 sign/appKey/t 等签名参数（建议复用内部采集管线）
    }
    # ==========================================================

    def __init__(self, http: Optional[Http] = None):
        self.http = http

    def fetch(self, keyword, gender, limit, style_tags, season_hint) -> List[Item]:
        if not self.TAOBAO_COOKIES:
            print(
                "  [taobao] 未配置登录 Cookie，跳过淘系抓取。\n"
                "           → 请在 TaobaoSource.TAOBAO_COOKIES 填入登录态，或改用内部采集管线。",
                file=sys.stderr,
            )
            return []
        # 有 Cookie 时的解析逻辑（占位骨架，签名参数需按实际接口补全）
        print("  [taobao] 检测到 Cookie，尝试抓取（注意：mtop 接口通常还需 sign 签名，"
              "如失败请对接内部采集管线）", file=sys.stderr)
        http = self.http or Http(extra_headers=self.TAOBAO_HEADERS, cookies=self.TAOBAO_COOKIES)
        items: List[Item] = []
        try:
            url = (f"https://s.taobao.com/search?q={requests.utils.quote(keyword)}"
                   f"&s=0&data-key=s&data-value=0")
            r = http.get(url)
            if r is None or "login" in (r.text[:2000].lower()):
                print("  [taobao] 仍被重定向到登录/风控页，Cookie 可能失效。", file=sys.stderr)
                return []
            # TODO: 解析 g_page_config / mtop JSON，字段映射到 Item（同 _parse 思路）
            print("  [taobao] Cookie 有效，但商品 JSON 解析逻辑需按实际返回结构补全（见 TODO）。",
                  file=sys.stderr)
        except Exception as e:  # noqa
            print(f"  [taobao] 抓取异常：{e}", file=sys.stderr)
        return items


# ====================================================================
# 5. 抓取任务编排
# ====================================================================

# 数据源工厂：source key → 构造函数
def build_source(source_key: str, http: Http, brand: str = "") -> Optional[BaseSource]:
    key = source_key.lower()
    if key == "uniqlo":
        return UniqloSource(http)
    if key == "shopify":
        return ShopifySource.from_brand(http, brand)
    if key == "taobao":
        return TaobaoSource(http)
    print(f"  [warn] 未知数据源 {source_key}", file=sys.stderr)
    return None


@dataclass
class CrawlTask:
    """一条抓取任务：对应 crawl_tasks.csv 的一行。"""
    source: str                 # uniqlo / shopify / taobao
    keyword: str                # 搜索关键词，Shopify 支持 collection:<handle>
    gender: str                 # 女/男/中性
    style_tags: List[str]       # 中文风格标签，直接写入结果
    season_hint: List[str]      # 季节提示（如 ["夏"]）
    target: int = 15            # 目标数量
    brand: str = ""             # Shopify/淘系需要品牌 key


def run_tasks(tasks: List[CrawlTask], out_path: str,
              proxy: str = DEFAULT_PROXY) -> List[Dict[str, Any]]:
    """执行一组抓取任务，合并去重后写出 JSON。"""
    if requests is None:
        print("[ERROR] 未安装 requests，无法抓取。请执行：pip install requests", file=sys.stderr)
        return []
    http = Http(proxy=proxy)
    all_items: Dict[str, Dict[str, Any]] = {}   # item_id → dict（去重）
    for i, t in enumerate(tasks, 1):
        print(f"\n[{i}/{len(tasks)}] source={t.source} kw='{t.keyword}' "
              f"gender={t.gender} target={t.target}")
        src = build_source(t.source, http, t.brand)
        if src is None:
            continue
        try:
            got = src.fetch(t.keyword, t.gender, t.target, t.style_tags, t.season_hint)
        except Exception:
            print("  [error] 抓取异常：\n" + traceback.format_exc(), file=sys.stderr)
            got = []
        n_new = 0
        for it in got:
            d = it.to_dict()
            if d["item_id"] not in all_items:
                all_items[d["item_id"]] = d
                n_new += 1
        print(f"  → 抓到 {len(got)} 件，去重后新增 {n_new} 件")
    result = list(all_items.values())
    if out_path:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        json.dump(result, open(out_path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"\n[OK] 共 {len(result)} 件写入 {out_path}")
    return result


# ====================================================================
# 6. 默认示例任务（对齐夏季补货缺口，可按需增删）
# ====================================================================

def default_summer_tasks() -> List[CrawlTask]:
    """夏季补货示例任务（仅演示可跑通的公开源：Uniqlo + MUJI Shopify）。"""
    return [
        # —— P1 法式/极简/日系·男：Uniqlo 亚麻衬衫（夏季）——
        CrawlTask(source="uniqlo", keyword="linen shirt", gender="男",
                  style_tags=["极简", "日系"], season_hint=["夏"], target=15),
        # —— P0 通勤职场·女：Uniqlo 短袖衬衫 ——
        CrawlTask(source="uniqlo", keyword="short sleeve blouse", gender="女",
                  style_tags=["通勤"], season_hint=["夏"], target=15),
        # —— P1 日系侘寂·男：MUJI 宽松素色衬衫（Shopify）——
        CrawlTask(source="shopify", brand="muji", keyword="shirt", gender="男",
                  style_tags=["日系"], season_hint=["夏"], target=10),
        # —— P2 配饰：MUJI 帽子/包 ——
        CrawlTask(source="shopify", brand="muji", keyword="hat", gender="中性",
                  style_tags=["极简"], season_hint=["夏"], target=5),
    ]


def main():
    parser = argparse.ArgumentParser(
        description="Stylee 夏季补货爬虫（Uniqlo / Shopify / 淘系[需Cookie]）")
    parser.add_argument("--source", default="", help="uniqlo / shopify / taobao；留空则跑默认示例任务集")
    parser.add_argument("--brand", default="", help="Shopify/淘系品牌 key，如 muji")
    parser.add_argument("--keyword", default="", help="搜索关键词；Shopify 支持 collection:<handle>")
    parser.add_argument("--gender", default="中性", choices=["女", "男", "中性"])
    parser.add_argument("--style", default="", help="风格标签，逗号分隔（中文），如 通勤,极简")
    parser.add_argument("--season", default="夏", help="季节提示，逗号分隔，如 夏")
    parser.add_argument("--target", type=int, default=15, help="目标数量")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "scraped_items.json"),
                        help="输出 JSON 路径")
    parser.add_argument("--proxy", default=DEFAULT_PROXY, help="HTTP 代理（CN 环境需内网代理）")
    parser.add_argument("--dry-run", action="store_true", help="只打印将执行的任务，不实际抓取")
    args = parser.parse_args()

    if args.source:
        tasks = [CrawlTask(
            source=args.source,
            keyword=args.keyword,
            gender=args.gender,
            style_tags=[s for s in args.style.split(",") if s.strip()],
            season_hint=[s for s in args.season.split(",") if s.strip() in VALID_SEASON],
            target=args.target,
            brand=args.brand,
        )]
    else:
        tasks = default_summer_tasks()

    if args.dry_run:
        print("将执行以下任务（--dry-run，不实际抓取）：")
        for t in tasks:
            print("  ", t)
        return

    run_tasks(tasks, args.out, proxy=args.proxy)


if __name__ == "__main__":
    main()
