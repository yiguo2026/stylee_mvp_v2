// ─────────────────────────────────────────────────────────
// Stylee MVP v2 — Type Definitions
// ─────────────────────────────────────────────────────────

// ── Enums ──────────────────────────────────────────────
export type Gender = 'female' | 'male' | 'other' | 'private';

export type ClothingCategory =
  | '上装'
  | '下装'
  | '连体装'
  | '外套'
  | '鞋'
  | '包'
  | '帽子'
  | '围巾';

export const CLOTHING_CATEGORIES: ClothingCategory[] = [
  '上装', '下装', '连体装', '外套', '鞋', '包', '帽子', '围巾',
];

export const CLOTHING_CATEGORIES_WITH_ALL: (ClothingCategory | '全部')[] = [
  '全部', '上装', '下装', '连体装', '外套', '鞋', '包', '帽子', '围巾',
];

export type Season = '春' | '夏' | '秋' | '冬';
export type TagType = 'occasion' | 'style' | 'color_system' | 'season' | 'custom';
export type SourceType = 'manual' | 'photo_ai' | 'album_ai' | 'ai_recommended';
export type ItemStatus = 'active' | 'inactive' | 'archived';
export type OutfitSource = 'ai_generated' | 'user_created';
export type WeatherCondition = '晴' | '多云' | '阴' | '小雨' | '大雨' | '雪' | '雷阵雨' | '雾';

export type SleeveLength = '无袖' | '短袖' | '长袖';
export type FitType = '紧身' | '修身' | '宽松' | '标准' | 'oversize';
export type BodyShape = '沙漏形' | '梨形' | '苹果形' | '倒三角' | '矩形';

export type MaterialType =
  | '纯棉' | '精梳棉' | '亚麻' | '天丝' | '莫代尔' | '真丝'
  | '羊毛' | '羊绒' | '醋酸' | '涤纶' | '冰丝' | '雪纺'
  | '灯芯绒' | '金丝绒' | '牛仔' | '帆布' | 'PU皮' | '麂皮'
  | '摇粒绒' | '网纱' | '空气层' | '棉氨混纺' | '毛混纺'
  | '羽绒' | '羊羔毛';

export const MATERIAL_OPTIONS: MaterialType[] = [
  '纯棉', '精梳棉', '亚麻', '天丝', '莫代尔', '真丝',
  '羊毛', '羊绒', '醋酸', '涤纶', '冰丝', '雪纺',
  '灯芯绒', '金丝绒', '牛仔', '帆布', 'PU皮', '麂皮',
  '摇粒绒', '网纱', '空气层', '棉氨混纺', '毛混纺',
  '羽绒', '羊羔毛',
];

export const SLEEVE_OPTIONS: SleeveLength[] = ['无袖', '短袖', '长袖'];
export const FIT_OPTIONS: FitType[] = ['紧身', '修身', '宽松', '标准', 'oversize'];
export const BODY_SHAPE_OPTIONS: BodyShape[] = ['沙漏形', '梨形', '苹果形', '倒三角', '矩形'];

// ── Interfaces ─────────────────────────────────────────

export interface UserProfile {
  user_id: string;
  nickname: string;
  gender: Gender;
  age?: number;
  profession?: string;
  permanent_city?: string;
  avatar_url?: string;
  body_shape?: BodyShape;
  skin_tone?: string;
  username?: string;
  created_at: string;
  updated_at: string;
}

export interface StyleTag {
  tag_id: string;
  tag_name: string;
  tag_type: TagType;
  icon?: string;
  image_url?: string; // v2: 看图选风格
}

export interface UserStylePreference {
  preference_id: string;
  user_id: string;
  tag_id: string;
  preference_type: 'like' | 'dislike';
  tag?: StyleTag;
  created_at: string;
}

export interface WardrobeItem {
  item_id: string;
  user_id: string;
  name: string;
  category: ClothingCategory;
  color: string;
  material?: string;
  brand?: string;
  price?: number;
  images?: string[];      // v2: 多图
  image_url?: string;     // 保留兼容：主图
  source_type: SourceType;
  source_label?: string;  // v2: '手动添加' | 'AI推荐添加'
  fit_type?: string;
  sleeve_length?: SleeveLength; // v2
  season?: Season[];      // v2: 多选季节
  purchase_date?: string;  // v2
  occasion_tags?: string[]; // v2: 场合标签
  ai_recognized_attrs?: Record<string, string>;
  status: ItemStatus;
  tags?: StyleTag[];
  wear_count?: number;    // v2: 穿着次数（计算字段）
  last_worn_at?: string;  // v2: 最近穿着时间
  created_at: string;
  updated_at: string;
}

export interface OutfitItem {
  item_id: string;
  outfit_id: string;
  role?: string;
  display_order: number;
  item?: WardrobeItem;
}

export interface RecommendedItem {
  name: string;
  category: ClothingCategory;
  color: string;
  image_url?: string;
  description?: string;
}

export interface Outfit {
  outfit_id: string;
  user_id: string;
  session_id?: string;
  name?: string;
  ai_comment?: string;
  source: OutfitSource;
  items?: OutfitItem[];
  recommended_items?: RecommendedItem[];
  style_tags?: string[];      // v2: 风格标签
  occasion_tag?: string;      // v2: 场合标签
  temp_range?: string;        // v2: 温度范围 如 "18-24°C"
  is_favorited?: boolean;     // v2: 是否收藏
  try_on_images?: string[];   // v2: AI试穿效果图
  created_at: string;
}

export interface WeatherData {
  city: string;
  temp: number;
  condition: WeatherCondition;
  icon: string;
  humidity?: number;
  wind?: string;
}

export interface RecommendationSession {
  session_id: string;
  user_id: string;
  raw_query?: string;
  nlp_keywords?: string[];
  city?: string;
  temperature?: number;
  weather_type?: WeatherCondition;
  selected_tags?: string[];
  input_mode?: 'description' | 'tags'; // v2: 输入路径
  created_at: string;
}

export interface FilterTag {
  id: string;
  label: string;
  type: 'occasion' | 'style' | 'color_system' | 'temperature';
  selected: boolean;
}

export interface RecognitionResult {
  category: ClothingCategory;
  color: string;
  material?: string;
  style?: string;
  brand?: string;
  sleeve_length?: SleeveLength;
  fit_type?: FitType;
}

// ── v2 New Types ───────────────────────────────────────

export interface WishlistItem {
  wish_id: string;
  user_id: string;
  name: string;
  category: ClothingCategory;
  color: string;
  image_url?: string;
  description?: string;
  source: 'ai_recommended' | 'user_added';
  created_at: string;
}

export interface OutfitFavorite {
  favorite_id: string;
  user_id: string;
  outfit_id: string;
  outfit?: Outfit;
  created_at: string;
}

export interface InspirationCard {
  card_id: string;
  image_url: string;
  style_tags: string[];
  comment: string;
  occasion?: string;
  sort_order: number;
}

export interface BodyModel {
  model_id: string;
  user_id: string;
  selfie_url?: string;     // 自拍照
  fullbody_url?: string;   // 全身照
  body_shape?: BodyShape;  // 体型
  model_version?: string;
  created_at: string;
  updated_at: string;
}

// ── Filter Tags (v2 updated) ───────────────────────────

export const OCCASION_TAGS: FilterTag[] = [
  { id: 'commute', label: '通勤', type: 'occasion', selected: false },
  { id: 'date', label: '约会', type: 'occasion', selected: false },
  { id: 'travel', label: '出游', type: 'occasion', selected: false },
  { id: 'casual', label: '休闲', type: 'occasion', selected: false },
  { id: 'work', label: '职场', type: 'occasion', selected: false },
  { id: 'sport', label: '运动', type: 'occasion', selected: false },
];

export const STYLE_TAGS: FilterTag[] = [
  { id: 'korean', label: '韩系风', type: 'style', selected: false },
  { id: 'sweet', label: '甜美风', type: 'style', selected: false },
  { id: 'new_chinese', label: '新中式', type: 'style', selected: false },
  { id: 'preppy', label: '学院风', type: 'style', selected: false },
  { id: 'city_chic', label: '都市风', type: 'style', selected: false },
  { id: 'artsy', label: '文艺风', type: 'style', selected: false },
  { id: 'sporty_casual', label: '运动休闲', type: 'style', selected: false },
  { id: 'commute_style', label: '通勤风', type: 'style', selected: false },
  { id: 'french', label: '法式', type: 'style', selected: false },
  { id: 'maillard', label: '美拉德风', type: 'style', selected: false },
  { id: 'japanese', label: '日系风', type: 'style', selected: false },
  { id: 'business', label: '商务风', type: 'style', selected: false },
  { id: 'american', label: '美式', type: 'style', selected: false },
  { id: 'british', label: '英伦风', type: 'style', selected: false },
];

export const COLOR_TAGS: FilterTag[] = [
  { id: 'black', label: '黑色系', type: 'color_system', selected: false },
  { id: 'white', label: '白色系', type: 'color_system', selected: false },
  { id: 'gray', label: '灰色系', type: 'color_system', selected: false },
  { id: 'blue', label: '蓝色系', type: 'color_system', selected: false },
  { id: 'green', label: '绿色系', type: 'color_system', selected: false },
  { id: 'warm', label: '暖色系', type: 'color_system', selected: false },
  { id: 'morandi', label: '莫兰迪', type: 'color_system', selected: false },
  { id: 'clash', label: '撞色', type: 'color_system', selected: false },
];

export const TEMP_TAGS: FilterTag[] = [
  { id: 'temp_hot', label: '热天 25°C+', type: 'temperature', selected: false },
  { id: 'temp_warm', label: '暖天 15–25°C', type: 'temperature', selected: false },
  { id: 'temp_cool', label: '凉天 5–15°C', type: 'temperature', selected: false },
  { id: 'temp_cold', label: '冷天 5°C-', type: 'temperature', selected: false },
];

// ── Style Preferences (v2 updated — same list as STYLE_TAGS) ──

export const PRESET_STYLE_PREFERENCES: StyleTag[] = STYLE_TAGS.map(t => ({
  tag_id: t.id,
  tag_name: t.label,
  tag_type: 'style' as TagType,
}));

export const PRESET_STYLE_DISLIKES: StyleTag[] = [
  { tag_id: 'punk', tag_name: '朋克', tag_type: 'style' },
  { tag_id: 'oversize', tag_name: 'Oversize', tag_type: 'style' },
  { tag_id: 'dark', tag_name: '暗黑', tag_type: 'style' },
  { tag_id: 'hiphop', tag_name: '嘻哈', tag_type: 'style' },
  { tag_id: 'sexy', tag_name: '性感', tag_type: 'style' },
  { tag_id: 'avantgarde', tag_name: '前卫', tag_type: 'style' },
  { tag_id: 'ethnic', tag_name: '民族', tag_type: 'style' },
  { tag_id: 'luxury', tag_name: '奢华', tag_type: 'style' },
  { tag_id: 'logo_mania', tag_name: '大Logo', tag_type: 'style' },
  { tag_id: 'neon', tag_name: '荧光色', tag_type: 'style' },
  { tag_id: 'sheer', tag_name: '透视', tag_type: 'style' },
  { tag_id: 'crop', tag_name: '露脐', tag_type: 'style' },
  { tag_id: 'matchy', tag_name: '成套穿', tag_type: 'style' },
  { tag_id: 'childlike', tag_name: '幼稚', tag_type: 'style' },
];

// ── Tag Display Mapping (v2) ───────────────────────────

export const TAG_DISPLAY: Record<string, string> = {
  // Occasion
  commute: '通勤', date: '约会', travel: '出游', casual: '休闲',
  work: '职场', sport: '运动',
  // Style
  korean: '韩系风', sweet: '甜美风', new_chinese: '新中式',
  preppy: '学院风', city_chic: '都市风', artsy: '文艺风',
  sporty_casual: '运动休闲', commute_style: '通勤风',
  french: '法式', maillard: '美拉德风', japanese: '日系风',
  business: '商务风', american: '美式', british: '英伦风',
  // Dislike styles
  punk: '朋克', oversize: 'Oversize', dark: '暗黑', hiphop: '嘻哈',
  sexy: '性感', avantgarde: '前卫', ethnic: '民族', luxury: '奢华',
  logo_mania: '大Logo', neon: '荧光色', sheer: '透视', crop: '露脐',
  matchy: '成套穿', childlike: '幼稚',
  // Color system
  black: '黑色系', white: '白色系', gray: '灰色系',
  blue: '蓝色系', green: '绿色系', warm: '暖色系',
  morandi: '莫兰迪', clash: '撞色',
  // Temperature
  temp_hot: '热天', temp_warm: '暖天', temp_cool: '凉天', temp_cold: '冷天',
  // Legacy compatibility
  daily: '日常', party: '派对', interview: '面试',
  ceremony: '典礼', holiday: '度假', gathering: '聚会',
  elegant: '优雅', street: '街头', minimalist: '极简',
  vintage: '复古', old_money: '老钱风', bohemian: '波西米亚',
  cool: '酷帅', romantic: '浪漫', neutral: '中性',
  black_white: '黑白', pastel: '马卡龙', earth: '大地色',
  jewel: '宝石色', monochrome: '单色系',
};

// ── Preset Basic Wardrobe Items (v2) ───────────────────

export interface PresetWardrobeItem {
  name: string;
  category: ClothingCategory;
  color: string;
}

export const PRESET_BASIC_ITEMS: PresetWardrobeItem[] = [
  // 上装
  { name: '白色T恤', category: '上装', color: '白色' },
  { name: '黑色T恤', category: '上装', color: '黑色' },
  { name: '白衬衫', category: '上装', color: '白色' },
  { name: '灰色卫衣', category: '上装', color: '灰色' },
  { name: '黑色卫衣', category: '上装', color: '黑色' },
  { name: '条纹T恤', category: '上装', color: '条纹' },
  { name: '针织衫', category: '上装', color: '米色' },
  // 下装
  { name: '蓝色牛仔裤', category: '下装', color: '蓝色' },
  { name: '黑色长裤', category: '下装', color: '黑色' },
  { name: '运动裤', category: '下装', color: '黑色' },
  { name: '短裤', category: '下装', color: '蓝色' },
  // 连体装
  { name: '白色连衣裙', category: '连体装', color: '白色' },
  { name: '黑色连衣裙', category: '连体装', color: '黑色' },
  // 外套
  { name: '黑色羽绒服', category: '外套', color: '黑色' },
  { name: '牛仔外套', category: '外套', color: '蓝色' },
  { name: '黑色西服外套', category: '外套', color: '黑色' },
  { name: '针织开衫', category: '外套', color: '米色' },
  { name: '米色风衣', category: '外套', color: '米色' },
  // 鞋
  { name: '小白鞋', category: '鞋', color: '白色' },
  { name: '帆布鞋', category: '鞋', color: '白色' },
  { name: '白色运动鞋', category: '鞋', color: '白色' },
  { name: '马丁靴', category: '鞋', color: '黑色' },
  // 帽子
  { name: '棒球帽', category: '帽子', color: '黑色' },
  { name: '渔夫帽', category: '帽子', color: '米色' },
  { name: '针织冷帽', category: '帽子', color: '灰色' },
  // 围巾
  { name: '纯色针织围巾', category: '围巾', color: '灰色' },
  // 包
  { name: '双肩包', category: '包', color: '黑色' },
  { name: '帆布包', category: '包', color: '米色' },
];

// ── Category options for pickers ────────────────────────

export const CATEGORY_OPTIONS: ClothingCategory[] = [
  '上装', '下装', '连体装', '外套', '鞋', '包', '帽子', '围巾',
];

export const COLOR_OPTIONS: string[] = [
  '白色', '黑色', '灰色', '米色', '蓝色', '深蓝', '浅蓝',
  '红色', '酒红', '粉色', '绿色', '军绿', '卡其', '棕色',
  '驼色', '焦糖', '橙色', '黄色', '紫色', '条纹', '格纹', '印花',
];

export const OCCASION_OPTIONS: string[] = [
  '职场', '休闲', '约会', '运动', '正式', '度假',
];
