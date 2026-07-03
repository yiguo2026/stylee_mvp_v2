"""I/O 数据契约 —— 模型层对外的接口。

这是触点 B(推荐生成)与 App 端之间认的格式;也是触点 A(入库识别)的产物 schema。
对照设计稿《Stylee 模型处理架构》的"触点 A 属性 schema"和"触点 B 链路"。

纯 stdlib(dataclasses + enum),零外部依赖,方便直接 `python3` 跑。
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# 枚举:固定枚举是下游 code 能信赖的地基(见设计稿"品类固定枚举")
# ---------------------------------------------------------------------------
class Category(str, Enum):
    TOP = "上装"
    BOTTOM = "下装"
    DRESS = "连衣裙"          # 连体装,自带"上+下"
    OUTERWEAR = "外套"
    SHOES = "鞋"
    BAG = "包"
    HAT = "帽子"
    SCARF = "围巾"


class Slot(str, Enum):
    """槽位:一套搭配由若干槽位拼成,是约束逻辑的基本单位。"""
    TORSO = "torso"        # 上身:由 TOP 或 DRESS 占
    BOTTOM = "bottom"      # 下身:由 BOTTOM 占;DRESS 同时覆盖 TORSO+BOTTOM
    OUTER = "outer"        # 外层:OUTERWEAR
    FEET = "feet"          # 鞋
    ACCESSORY = "accessory"  # 配饰:BAG/HAT/SCARF


# 品类 → 它能占的槽位
CATEGORY_SLOT: dict[Category, Slot] = {
    Category.TOP: Slot.TORSO,
    Category.DRESS: Slot.TORSO,        # 连衣裙特殊:见 constraints 里 covers_bottom
    Category.BOTTOM: Slot.BOTTOM,
    Category.OUTERWEAR: Slot.OUTER,
    Category.SHOES: Slot.FEET,
    Category.BAG: Slot.ACCESSORY,
    Category.HAT: Slot.ACCESSORY,
    Category.SCARF: Slot.ACCESSORY,
}


class Season(str, Enum):
    SPRING = "春"
    SUMMER = "夏"
    AUTUMN = "秋"
    WINTER = "冬"


class Sleeve(str, Enum):
    NONE = "无袖"
    SHORT = "短袖"
    LONG = "长袖"


class Fit(str, Enum):
    TIGHT = "紧身"
    SLIM = "修身"
    STANDARD = "标准"
    LOOSE = "宽松"
    OVERSIZE = "oversize"


class BodyShape(str, Enum):
    PEAR = "梨形"          # 下半身丰满
    APPLE = "苹果形"        # 腰腹丰满
    HOURGLASS = "沙漏形"
    RECTANGLE = "矩形"      # 直筒
    INVERTED = "倒三角"     # 肩宽


class Formality(str, Enum):
    CASUAL = "休闲"
    SMART_CASUAL = "半正式"
    FORMAL = "正式"


class InputMode(str, Enum):
    NL = "natural_language"   # 自然语言路径 → 走 B0 模型解析
    TAGS = "tags"             # 标签路径 → code 直接映射,免模型


class ItemSource(str, Enum):
    MANUAL = "手动添加"
    AI_SUGGEST = "AI推荐添加"


class PhotoType(str, Enum):
    """触点 A 的"拍摄类型"标签,决定标准化走抠图还是 img2img 重绘。"""
    FLATLAY = "flatlay"     # 桌面平铺 / 干净商品图 → 抠图
    ON_BODY = "on_body"     # 上身穿着 → 生成重绘
    WEB = "web"             # 网图 / 模特图 → 生成重绘
    ANGLED = "angled"       # 侧拍 / 遮挡 → 生成重绘


# ---------------------------------------------------------------------------
# 触点 A 产物 / 触点 B 食材:衣橱单品
# ---------------------------------------------------------------------------
@dataclass
class WardrobeItem:
    id: str
    category: Category
    subcategory: str = ""
    colors: list[str] = field(default_factory=list)   # 颜色名,见 scoring 的色表
    material: str = ""
    sleeve: Optional[Sleeve] = None
    fit: Optional[Fit] = None
    seasons: list[Season] = field(default_factory=list)
    style_tags: list[str] = field(default_factory=list)
    occasion_tags: list[str] = field(default_factory=list)
    # 保暖档 0(最薄,如背心)→ 4(最厚,如羽绒)。触点 A 识别时由 material/category 推导。
    warmth: int = 1
    source: ItemSource = ItemSource.MANUAL
    image_url: str = ""
    wear_count: int = 0

    @property
    def slot(self) -> Slot:
        return CATEGORY_SLOT[self.category]


# ---------------------------------------------------------------------------
# 触点 B 输入:用户画像 / 天气 / 请求上下文
# ---------------------------------------------------------------------------
@dataclass
class UserProfile:
    gender: str = ""
    age: Optional[int] = None
    body_shape: Optional[BodyShape] = None
    skin_tone: str = ""          # 如 "黄黑皮"、"白皙",用于色彩避雷
    height_cm: Optional[int] = None
    style_prefs: list[str] = field(default_factory=list)


@dataclass
class Weather:
    temp_c: float = 20.0
    condition: str = "晴"        # 晴/阴/雨/雪…
    city: str = ""
    time_of_day: str = "day"     # day/evening/night


@dataclass
class FilterTags:
    occasion: Optional[str] = None
    style: Optional[str] = None
    color: Optional[str] = None


@dataclass
class RequestContext:
    """一次推荐请求。input_mode 决定 B0 走模型还是 code。"""
    input_mode: InputMode
    wardrobe: list[WardrobeItem]
    user_profile: UserProfile = field(default_factory=UserProfile)
    weather: Weather = field(default_factory=Weather)
    query_text: str = ""                       # NL 模式
    filter_tags: FilterTags = field(default_factory=FilterTags)  # TAGS 模式
    n: int = 4                                  # 想要几套


# ---------------------------------------------------------------------------
# B0 产物:场景规格(理解的结构化结果)
# ---------------------------------------------------------------------------
@dataclass
class SceneSpec:
    occasions: list[str] = field(default_factory=list)
    formality: Formality = Formality.CASUAL
    style_keywords: list[str] = field(default_factory=list)
    hard_avoids: list[str] = field(default_factory=list)   # 明确要避开的(品类/风格/色)
    vibe: str = ""                                          # 一句话氛围,喂给 B3 当语境


# ---------------------------------------------------------------------------
# 触点 B 输出:搭配 / 推荐结果
# ---------------------------------------------------------------------------
@dataclass
class GapSuggestion:
    """缺口生成:衣橱里没有合适单品时,按审美建议补什么(owned=False)。"""
    category: Category
    desc: str
    reason: str


@dataclass
class OutfitItemRef:
    """搭配里的一件:要么引用衣橱真实 id(owned),要么是缺口建议。"""
    role: Slot
    ref: Optional[str] = None              # 衣橱 item id;owned=True 时必填
    owned: bool = True
    suggest: Optional[GapSuggestion] = None  # owned=False 时填


@dataclass
class OutfitScores:
    body_fit: float = 0.0
    occasion: float = 0.0
    style_coherence: float = 0.0
    color_harmony: float = 0.0

    def weighted(self, weights: dict[str, float]) -> float:
        return (
            self.body_fit * weights["body_fit"]
            + self.occasion * weights["occasion"]
            + self.style_coherence * weights["style_coherence"]
            + self.color_harmony * weights["color_harmony"]
        )


@dataclass
class Outfit:
    items: list[OutfitItemRef]
    style_tags: list[str] = field(default_factory=list)
    occasion: str = ""
    reasoning: str = ""
    scores: OutfitScores = field(default_factory=OutfitScores)
    confidence: float = 0.0

    def owned_refs(self) -> list[str]:
        return [it.ref for it in self.items if it.owned and it.ref]

    def has_gap(self) -> bool:
        return any(not it.owned for it in self.items)


@dataclass
class RecommendationResult:
    outfits: list[Outfit]                 # 发给用户的 top-n
    pool: list[Outfit] = field(default_factory=list)  # 备用池("换一套"从这里发,0 次模型)
    model_version: str = ""
    trace: dict = field(default_factory=dict)         # 调试:各阶段计数

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class StandardizedImage:
    """触点 A 的标准化展示图。method: cutout|img2img|cropped_fallback。"""
    image_ref: str
    method: str
    verified: bool = False


@dataclass
class IngestResult:
    """触点 A 识别产物:item 立刻可喂触点 B;needs_review 提示用户确认。"""
    item: WardrobeItem
    photo_type: PhotoType
    confidence: float = 0.0
    needs_review: bool = False
    raw: dict = field(default_factory=dict)
