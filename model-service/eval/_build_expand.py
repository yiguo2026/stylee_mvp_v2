"""一次性题库扩充脚本（数据维护，不触发评测模型）。
1. 为现有 77 条补 body_shape / skin_tone 画像 mock；
2. 追加 19 道男性 query（q72~q90）；
3. 备份原文件为 queries.before_expand.json，写回 queries.json。
"""
import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "queries.json")
BAK = os.path.join(HERE, "queries.before_expand.json")

# qid -> (body_shape, skin_tone)  给现有 77 条的画像 mock
MOCK = {
    # --- 女性 ---
    "q01": ("矩形", "自然"),
    "q02": ("沙漏形", "白皙"),
    "q03": ("梨形", "小麦色"),
    "q05": ("沙漏形", "白皙"),
    "q06": ("沙漏形", "白皙"),
    "q07": ("苹果形", "自然"),
    "q08": ("梨形", "偏黄"),
    "q10": ("矩形", "自然"),
    "q11": ("倒三角", "偏黄"),
    "q15": ("梨形", "自然"),
    "q18": ("倒三角", "白皙"),
    "q19": ("沙漏形", "小麦色"),
    "q21": ("矩形", "小麦色"),
    "q22": ("沙漏形", "自然"),
    "q23": ("倒三角", "偏黄"),
    "q25": ("倒三角", "白皙"),
    "q26": ("苹果形", "小麦色"),
    "q27": ("沙漏形", "白皙"),
    "q29": ("矩形", "自然"),
    "q30": ("梨形", "偏黄"),
    "q31": ("苹果形", "自然"),
    "q32": ("梨形", "白皙"),
    "q34": ("梨形", "偏黄"),      # text: 下半身比较胖 -> 梨形
    "q35": ("矩形", "自然"),      # text: 个子不高属身高信息，不进 body_shape，此处仅 mock
    "q36": ("苹果形", "自然"),    # text: 腰腹肉比较多 -> 苹果形
    "q37a": ("矩形", "白皙"),
    "q37b": ("沙漏形", "白皙"),
    "q38a": ("倒三角", "自然"),
    "q38b": ("矩形", "偏黄"),
    "q39a": ("倒三角", "白皙"),
    "q39b": ("梨形", "白皙"),
    "q40a": ("沙漏形", "小麦色"),
    "q40b": ("倒三角", "小麦色"),
    "q41a": ("梨形", "自然"),
    "q41b": ("苹果形", "偏黄"),
    "q42": ("苹果形", "白皙"),
    "q43": ("苹果形", "偏黄"),     # text: 想遮肉 -> 苹果形
    "q44": ("沙漏形", "自然"),
    "q45": ("矩形", "自然"),
    "q46": ("矩形", "偏黄"),
    "q48": ("梨形", "白皙"),
    "q52": ("沙漏形", "偏黄"),
    "q53": ("倒三角", "白皙"),
    "q54": ("梨形", "自然"),
    "q56": ("倒三角", "小麦色"),
    "q57": ("沙漏形", "自然"),
    "q58": ("苹果形", "偏黄"),     # text: 微胖女生 -> 苹果形
    "q59": ("苹果形", "自然"),     # text: 怀孕肚子大 -> 苹果形
    "q62": ("矩形", "自然"),
    "q63": ("梨形", "偏黄"),
    "q64": ("倒三角", "白皙"),
    "q65": ("矩形", "自然"),
    "q66": ("沙漏形", "白皙"),
    "q68": ("梨形", "自然"),
    "q69": ("苹果形", "偏黄"),
    "q71": ("沙漏形", "白皙"),
    # --- 男性 ---
    "q04": ("倒三角", "小麦色"),
    "q12": ("矩形", "自然"),
    "q13": ("矩形", "自然"),
    "q16": ("苹果形", "黄黑皮"),
    "q24": ("倒三角", "自然"),
    "q49": ("倒三角", "白皙"),
    "q50": ("矩形", "自然"),
    "q51a": ("倒三角", "小麦色"),
    "q51b": ("矩形", "小麦色"),
    "q60": ("矩形", "偏黄"),
    "q67": ("苹果形", "自然"),
    # --- unisex ---
    "q09": ("矩形", "小麦色"),
    "q14": ("矩形", "白皙"),
    "q17": ("倒三角", "小麦色"),
    "q20": ("沙漏形", "自然"),
    "q28": ("矩形", "自然"),
    "q33": ("倒三角", "偏黄"),
    "q47": ("矩形", "自然"),
    "q55": ("倒三角", "偏黄"),
    "q61": ("矩形", "自然"),
    "q70": ("矩形", "自然"),
}

# 新增 19 道男性 query（q72~q90）
NEW = [
    {"query_id": "q72", "text": "下周一有个重要的商务谈判，想穿身正装显得专业稳重，天有点冷", "scenario": "面试正式商务", "style": "优雅正式", "color_system": "黑白灰无彩", "season": "冬", "temp_range": "-5~8℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "自然", "difficulty": "中", "tier": "core"},
    {"query_id": "q73", "text": "第一次跟她见面吃饭，想穿得干净有品又不刻意", "scenario": "约会", "style": "简约极简", "color_system": "大地色棕米", "season": "秋", "temp_range": "10-18℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "白皙", "difficulty": "易", "tier": "core"},
    {"query_id": "q74", "text": "周末就想穿得舒服随意点出去晃悠", "scenario": "朋友聚会/日常休闲", "style": "日系", "color_system": "大地色棕米", "season": "春", "temp_range": "10-20℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "偏黄", "difficulty": "易", "tier": "core"},
    {"query_id": "q75", "text": "去健身房撸铁，想要贴身透气好活动的一套", "scenario": "运动户外", "style": "运动机能", "color_system": "黑白灰无彩", "season": "空调房室内外温差", "temp_range": "26℃(空调房)", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "小麦色", "difficulty": "易", "tier": "core"},
    {"query_id": "q76", "text": "想走那种城市机能风，防风耐脏能应付各种天气", "scenario": "运动户外", "style": "运动机能", "color_system": "黑白灰无彩", "season": "换季早晚温差大", "temp_range": "8-22℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "自然", "difficulty": "中", "tier": "extended"},
    {"query_id": "q77", "text": "参加大学同学婚礼当伴郎，想正式体面又不过火，天挺热", "scenario": "婚礼宴会观礼", "style": "优雅正式", "color_system": "莫兰迪低饱和", "season": "夏", "temp_range": "28-35℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "自然", "difficulty": "难", "tier": "extended"},
    {"query_id": "q78", "text": "想要那种低调有质感的老钱风，周末喝个下午茶穿", "scenario": "朋友聚会/日常休闲", "style": "静奢老钱风", "color_system": "大地色棕米", "season": "秋", "temp_range": "10-18℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "白皙", "difficulty": "中", "tier": "extended"},
    {"query_id": "q79", "text": "想穿得潮一点街头感十足，出去跟朋友拍照", "scenario": "逛街", "style": "街头", "color_system": "撞色明亮", "season": "夏", "temp_range": "28-35℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "小麦色", "difficulty": "中", "tier": "core"},
    {"query_id": "q80", "text": "去东南亚海岛玩几天，想穿得清爽有度假感，超级热", "scenario": "旅行度假/海边", "style": "波西米亚度假", "color_system": "全白", "season": "夏", "temp_range": "28-35℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "苹果形", "skin_tone": "黄黑皮", "difficulty": "中", "tier": "extended"},
    {"query_id": "q81", "text": "明天去面试互联网公司，想稳重又不老气，别太正式", "scenario": "面试正式商务", "style": "通勤知性", "color_system": "蓝色系", "season": "春", "temp_range": "10-20℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "自然", "difficulty": "中", "tier": "core"},
    {"query_id": "q82", "text": "周末去山里露营，要保暖耐造还能凹造型，早晚很凉", "scenario": "运动户外", "style": "工装", "color_system": "大地色棕米", "season": "换季早晚温差大", "temp_range": "8-22℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "小麦色", "difficulty": "中", "tier": "extended"},
    {"query_id": "q83", "text": "约了哥们打篮球，想要一身清爽好动的球场look", "scenario": "运动户外", "style": "运动机能", "color_system": "撞色明亮", "season": "夏", "temp_range": "28-35℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "小麦色", "difficulty": "易", "tier": "extended"},
    {"query_id": "q84", "text": "晚上去酒吧蹦迪，想穿得酷一点有存在感", "scenario": "派对/夜晚", "style": "街头", "color_system": "黑白灰无彩", "season": "秋", "temp_range": "10-18℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "自然", "difficulty": "中", "tier": "extended"},
    {"query_id": "q85", "text": "过年回家走亲戚，想要新中式的感觉，稳重又喜庆，天冷", "scenario": "朋友聚会/日常休闲", "style": "新中式国风", "color_system": "暖色调", "season": "冬", "temp_range": "-5~8℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "偏黄", "difficulty": "中", "tier": "core"},
    {"query_id": "q86", "text": "想要韩系那种干净温柔的男生穿搭，约会穿", "scenario": "约会", "style": "韩系", "color_system": "莫兰迪低饱和", "season": "春", "temp_range": "10-20℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "矩形", "skin_tone": "白皙", "difficulty": "易", "tier": "extended"},
    {"query_id": "q87", "text": "我有件卡其色机能夹克，帮我搭套周末出门穿的", "scenario": "朋友聚会/日常休闲", "style": "运动机能", "color_system": "大地色棕米", "season": "秋", "temp_range": "10-18℃", "gender": "male", "special": "指定单品", "profile_variant": "", "body_shape": "矩形", "skin_tone": "自然", "difficulty": "中", "tier": "core"},
    {"query_id": "q88", "text": "上一套太板正了，通勤的帮我换个休闲点的", "scenario": "通勤/工作", "style": "通勤知性", "color_system": "蓝色系", "season": "秋", "temp_range": "10-18℃", "gender": "male", "special": "反馈迭代", "profile_variant": "", "body_shape": "矩形", "skin_tone": "自然", "difficulty": "中", "tier": "extended"},
    {"query_id": "q89", "text": "天冷想穿暖和点，但又不想显臃肿显矮，约会穿", "scenario": "约会", "style": "简约极简", "color_system": "黑白灰无彩", "season": "冬", "temp_range": "-5~8℃", "gender": "male", "special": "冲突需求", "profile_variant": "", "body_shape": "苹果形", "skin_tone": "自然", "difficulty": "难", "tier": "extended"},
    {"query_id": "q90", "text": "上班穿的商务休闲，最近早晚温差大不好穿", "scenario": "通勤/工作", "style": "通勤知性", "color_system": "大地色棕米", "season": "换季早晚温差大", "temp_range": "8-22℃", "gender": "male", "special": "", "profile_variant": "", "body_shape": "倒三角", "skin_tone": "偏黄", "difficulty": "中", "tier": "core"},
]

# 统一字段顺序
ORDER = ["query_id", "text", "scenario", "style", "color_system", "season",
         "temp_range", "gender", "special", "profile_variant",
         "body_shape", "skin_tone", "height_cm", "difficulty", "tier"]


def reorder(rec):
    out = {}
    for k in ORDER:
        if k in rec:
            out[k] = rec[k]
    # 保底：任何未列入 ORDER 的键追加在后（理论上不该有）
    for k in rec:
        if k not in out:
            out[k] = rec[k]
    return out


def main():
    with open(SRC, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, list)
    assert len(data) == 77, f"预期 77 条，实际 {len(data)}"

    # 备份原文件（仅首次；已存在则不覆盖，保留最初版本）
    if not os.path.exists(BAK):
        with open(BAK, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # 1) 现有 77 条补 body_shape / skin_tone
    for rec in data:
        qid = rec["query_id"]
        assert qid in MOCK, f"缺少 mock 映射: {qid}"
        bs, st = MOCK[qid]
        rec["body_shape"] = bs
        rec["skin_tone"] = st

    # 2) 追加新男性题
    existing_ids = {r["query_id"] for r in data}
    for rec in NEW:
        assert rec["query_id"] not in existing_ids, f"query_id 冲突: {rec['query_id']}"
    data.extend(NEW)

    # 3) 统一字段顺序
    data = [reorder(r) for r in data]

    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 统计打印
    total = len(data)
    gender = Counter(r["gender"] for r in data)
    bshape = Counter(r["body_shape"] for r in data)
    stone = Counter(r["skin_tone"] for r in data)
    print("total:", total)
    print("gender:", dict(gender))
    print("body_shape:", dict(bshape))
    print("skin_tone:", dict(stone))
    # 77 条画像分布（不含新增）
    old = data[:77]
    print("--- old77 ---")
    print("body_shape77:", dict(Counter(r["body_shape"] for r in old)))
    print("skin_tone77:", dict(Counter(r["skin_tone"] for r in old)))


if __name__ == "__main__":
    main()
