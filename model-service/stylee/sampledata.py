"""示例衣橱 + 场景(供 demo / 评测用)。

直接用 dataclass 构造,省去 JSON 反序列化样板。真实接入时由触点 A(识别)产出 WardrobeItem。
"""
from __future__ import annotations

from .contracts import (
    BodyShape,
    Category as C,
    Fit as F,
    FilterTags,
    InputMode,
    RequestContext,
    Season as S,
    Sleeve as SL,
    UserProfile,
    WardrobeItem as W,
    Weather,
)

_ALL = [S.SPRING, S.SUMMER, S.AUTUMN, S.WINTER]


def sample_wardrobe() -> list[W]:
    return [
        # 上装
        W("t1", C.TOP, "白色T恤", ["白色"], "纯棉", SL.SHORT, F.STANDARD,
          [S.SPRING, S.SUMMER], ["运动休闲", "美式"], ["休闲"], warmth=0),
        W("t2", C.TOP, "白衬衫", ["白色"], "棉", SL.LONG, F.SLIM,
          _ALL, ["通勤", "法式"], ["通勤", "约会"], warmth=1),
        W("t3", C.TOP, "米白针织衫", ["米白"], "羊毛", SL.LONG, F.LOOSE,
          [S.AUTUMN, S.WINTER], ["法式", "通勤"], ["通勤", "约会"], warmth=2),
        W("t4", C.TOP, "黑色T恤", ["黑色"], "纯棉", SL.SHORT, F.STANDARD,
          [S.SUMMER], ["美式"], ["休闲"], warmth=0),
        W("t5", C.TOP, "条纹T恤", ["白色"], "纯棉", SL.SHORT, F.STANDARD,
          [S.SPRING, S.SUMMER], ["日系"], ["休闲"], warmth=0),
        W("t6", C.TOP, "灰色卫衣", ["灰色"], "棉", SL.LONG, F.OVERSIZE,
          [S.SPRING, S.AUTUMN], ["运动休闲", "美式"], ["休闲", "运动"], warmth=2),
        # 下装
        W("b1", C.BOTTOM, "蓝色牛仔裤", ["牛仔蓝"], "牛仔", None, F.STANDARD,
          _ALL, ["美式", "都市"], ["休闲", "通勤"], warmth=1),
        W("b2", C.BOTTOM, "黑色西装裤", ["黑色"], "涤纶", None, F.SLIM,
          _ALL, ["通勤", "商务"], ["通勤", "正式"], warmth=1),
        W("b3", C.BOTTOM, "米色阔腿裤", ["米色"], "棉麻", None, F.LOOSE,
          [S.SPRING, S.AUTUMN], ["法式", "新中式"], ["通勤", "约会"], warmth=1),
        W("b4", C.BOTTOM, "运动裤", ["黑色"], "聚酯", None, F.LOOSE,
          _ALL, ["运动休闲"], ["运动", "居家"], warmth=1),
        W("b5", C.BOTTOM, "卡其A字半裙", ["卡其"], "棉", None, F.STANDARD,
          [S.SPRING, S.SUMMER, S.AUTUMN], ["法式", "学院风"], ["约会", "通勤"], warmth=1),
        # 连衣裙
        W("d1", C.DRESS, "黑色连衣裙", ["黑色"], "醋酸", SL.SHORT, F.SLIM,
          [S.SPRING, S.SUMMER, S.AUTUMN], ["法式", "通勤"], ["约会", "聚会", "正式"], warmth=1),
        W("d2", C.DRESS, "白色连衣裙", ["白色"], "雪纺", SL.NONE, F.STANDARD,
          [S.SUMMER], ["甜美", "韩系"], ["约会", "逛街"], warmth=0),
        # 外套
        W("o1", C.OUTERWEAR, "黑色西装外套", ["黑色"], "涤纶", SL.LONG, F.SLIM,
          _ALL, ["通勤", "商务"], ["通勤", "正式"], warmth=2),
        W("o2", C.OUTERWEAR, "牛仔外套", ["牛仔蓝"], "牛仔", SL.LONG, F.STANDARD,
          [S.SPRING, S.AUTUMN], ["美式", "都市"], ["休闲"], warmth=2),
        W("o3", C.OUTERWEAR, "米色风衣", ["米色"], "棉", SL.LONG, F.LOOSE,
          [S.SPRING, S.AUTUMN], ["法式", "通勤"], ["通勤", "约会"], warmth=3),
        W("o4", C.OUTERWEAR, "黑色羽绒服", ["黑色"], "羽绒", SL.LONG, F.OVERSIZE,
          [S.WINTER], ["运动休闲"], ["休闲"], warmth=4),
        # 鞋
        W("s1", C.SHOES, "小白鞋", ["白色"], "皮", None, None,
          _ALL, ["运动休闲", "都市"], ["休闲", "通勤"], warmth=1),
        W("s2", C.SHOES, "黑色乐福鞋", ["黑色"], "皮", None, None,
          _ALL, ["通勤", "法式"], ["通勤", "约会"], warmth=1),
        W("s3", C.SHOES, "马丁靴", ["棕色"], "皮", None, None,
          [S.AUTUMN, S.WINTER], ["美式", "都市"], ["休闲"], warmth=2),
        # 配饰
        W("a1", C.BAG, "帆布包", ["米色"], "帆布", None, None,
          _ALL, ["休闲"], ["休闲"], warmth=0),
        W("a2", C.SCARF, "针织围巾", ["灰色"], "羊毛", None, None,
          [S.WINTER], ["通勤"], ["通勤"], warmth=2),
    ]


def sparse_wardrobe() -> list[W]:
    """缺鞋的小衣橱,用于演示"缺口生成"(B3 给 owned=False 建议)。"""
    return [
        W("x1", C.TOP, "白衬衫", ["白色"], "棉", SL.LONG, F.SLIM,
          _ALL, ["通勤", "法式"], ["通勤"], warmth=1),
        W("x2", C.BOTTOM, "黑色西装裤", ["黑色"], "涤纶", None, F.SLIM,
          _ALL, ["通勤"], ["通勤"], warmth=1),
        # 没有鞋 → FEET 缺口
    ]


def scenarios() -> list[tuple[str, RequestContext]]:
    wr = sample_wardrobe()
    return [
        ("A · 自然语言 · 约会晚间 22°C",
         RequestContext(
             input_mode=InputMode.NL, wardrobe=wr,
             query_text="周末外滩约会,晚上",
             user_profile=UserProfile(gender="female", age=26, body_shape=BodyShape.PEAR,
                                      skin_tone="黄黑皮", height_cm=162,
                                      style_prefs=["法式", "通勤"]),
             weather=Weather(22, "晴", "上海", "evening"), n=4)),
        ("B · 标签 · 通勤 12°C",
         RequestContext(
             input_mode=InputMode.TAGS, wardrobe=wr,
             filter_tags=FilterTags(occasion="通勤", style="通勤"),
             user_profile=UserProfile(gender="female", body_shape=BodyShape.RECTANGLE,
                                      skin_tone="白皙"),
             weather=Weather(12, "阴", "北京", "day"), n=4)),
        ("C · 自然语言 · 运动 28°C",
         RequestContext(
             input_mode=InputMode.NL, wardrobe=wr,
             query_text="周末去运动出汗",
             user_profile=UserProfile(gender="male"),
             weather=Weather(28, "晴", "广州", "day"), n=3)),
        ("D · 自然语言 · 面试正式 8°C(需外套)",
         RequestContext(
             input_mode=InputMode.NL, wardrobe=wr,
             query_text="明天面试,穿正式一点",
             user_profile=UserProfile(gender="female", body_shape=BodyShape.APPLE,
                                      skin_tone="自然"),
             weather=Weather(8, "阴", "北京", "day"), n=3)),
        ("E · 缺口演示 · 小衣橱无鞋 18°C",
         RequestContext(
             input_mode=InputMode.TAGS, wardrobe=sparse_wardrobe(),
             filter_tags=FilterTags(occasion="通勤"),
             user_profile=UserProfile(gender="female"),
             weather=Weather(18, "晴", "杭州", "day"), n=2)),
    ]
