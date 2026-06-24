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
export type SourceType = 'manual' | 'photo_ai' | 'album_ai' | 'ai_recommended' | 'link';
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
  title?: string;
  image_url: string;
  style_tags: string[];
  comment: string;
  occasion?: string;
  sort_order?: number;
  items?: InspirationItem[];
}

export interface InspirationItem {
  name: string;
  category: string;
  color: string;
  image_url?: string;
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
  { id: 'quiet_luxury', label: '静奢/老钱', type: 'style', selected: false },
  { id: 'minimalist', label: '极简', type: 'style', selected: false },
  { id: 'commute_style', label: '通勤职场', type: 'style', selected: false },
  { id: 'french', label: '法式慵懒', type: 'style', selected: false },
  { id: 'preppy', label: '学院风', type: 'style', selected: false },
  { id: 'safari', label: '猎装风', type: 'style', selected: false },
  { id: 'vintage', label: '复古年代', type: 'style', selected: false },
  { id: 'street', label: '街头潮流', type: 'style', selected: false },
  { id: 'sporty_casual', label: '运动机能', type: 'style', selected: false },
  { id: 'rock', label: '摇滚机车', type: 'style', selected: false },
  { id: 'goth', label: '哥特暗黑', type: 'style', selected: false },
  { id: 'sweet', label: '甜美少女', type: 'style', selected: false },
  { id: 'romantic', label: '浪漫田园', type: 'style', selected: false },
  { id: 'bohemian', label: '波西米亚/度假', type: 'style', selected: false },
  { id: 'western', label: '西部牛仔', type: 'style', selected: false },
  { id: 'utility', label: '工装实用', type: 'style', selected: false },
  { id: 'wabi_sabi', label: '日系侘寂', type: 'style', selected: false },
  { id: 'avantgarde', label: '先锋设计师', type: 'style', selected: false },
  { id: 'urban_cool', label: '都市酷感', type: 'style', selected: false },
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

export const PRESET_STYLE_DISLIKES: StyleTag[] = [];

// ── Tag Display Mapping (v2) ───────────────────────────

export const TAG_DISPLAY: Record<string, string> = {
  // Occasion
  commute: '通勤', date: '约会', travel: '出游', casual: '休闲',
  work: '职场', sport: '运动',
  // Style
  quiet_luxury: '静奢/老钱', minimalist: '极简', commute_style: '通勤职场',
  french: '法式慵懒', preppy: '学院风', safari: '猎装风',
  vintage: '复古年代', street: '街头潮流', sporty_casual: '运动机能',
  rock: '摇滚机车', goth: '哥特暗黑', sweet: '甜美少女',
  romantic: '浪漫田园', bohemian: '波西米亚/度假', western: '西部牛仔',
  utility: '工装实用', wabi_sabi: '日系侘寂', avantgarde: '先锋设计师',
  urban_cool: '都市酷感',
  // Color system
  black: '黑色系', white: '白色系', gray: '灰色系',
  blue: '蓝色系', green: '绿色系', warm: '暖色系',
  morandi: '莫兰迪', clash: '撞色',
  // Temperature
  temp_hot: '热天', temp_warm: '暖天', temp_cool: '凉天', temp_cold: '冷天',
  // Legacy compatibility
  daily: '日常', party: '派对', interview: '面试',
  ceremony: '典礼', holiday: '度假', gathering: '聚会',
  elegant: '优雅', cool: '酷帅', neutral: '中性',
  old_money: '老钱风',
  black_white: '黑白', pastel: '马卡龙', earth: '大地色',
  jewel: '宝石色', monochrome: '单色系',
};

// ── Preset Basic Wardrobe Items (v2) ───────────────────

export interface PresetWardrobeItem {
  name: string;
  category: ClothingCategory;
  color: string;
  material?: string;
  image_url?: string;
  desc?: string;
}

export const PRESET_BASIC_ITEMS: PresetWardrobeItem[] = [
  // 上装
  { name: '白色T恤', category: '上装', color: '白色', material: '纯棉', image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop', desc: '百搭必备·四季' },
  { name: '黑色T恤', category: '上装', color: '黑色', material: '纯棉', image_url: 'https://images.unsplash.com/photo-1503341504253-dff4855ab667?w=800&h=600&fit=crop', desc: '酷感基础·四季' },
  { name: '白衬衫', category: '上装', color: '白色', material: '棉', image_url: 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=800&h=600&fit=crop', desc: '通勤百搭·四季' },
  { name: '灰色卫衣', category: '上装', color: '灰色', material: '棉混纺', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&h=600&fit=crop', desc: '休闲舒适·秋冬' },
  { name: '黑色卫衣', category: '上装', color: '黑色', material: '棉混纺', image_url: 'https://images.unsplash.com/photo-1578768079052-aa76e52ff62e?w=800&h=600&fit=crop', desc: '百搭休闲·秋冬' },
  { name: '条纹T恤', category: '上装', color: '条纹', material: '纯棉', image_url: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&h=600&fit=crop', desc: '法式经典·春夏' },
  { name: '针织衫', category: '上装', color: '米色', material: '针织', image_url: 'https://images.unsplash.com/photo-1434389677669-e08b4cda3a7a?w=800&h=600&fit=crop', desc: '温柔质感·秋冬' },
  // 下装
  { name: '蓝色牛仔裤', category: '下装', color: '蓝色', material: '牛仔布', image_url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&h=600&fit=crop', desc: '经典百搭·四季' },
  { name: '黑色长裤', category: '下装', color: '黑色', material: '棉混纺', image_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&h=600&fit=crop', desc: '显瘦百搭·四季' },
  { name: '运动裤', category: '下装', color: '黑色', material: '涤纶', image_url: 'https://images.unsplash.com/photo-1515586838455-8f8f940d6853?w=800&h=600&fit=crop', desc: '舒适自在·四季' },
  { name: '短裤', category: '下装', color: '卡其', material: '棉', image_url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=800&h=600&fit=crop', desc: '清爽夏日·春夏' },
  // 连体装
  { name: '白色连衣裙', category: '连体装', color: '白色', material: '棉混纺', image_url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&h=600&fit=crop', desc: '清新优雅·春夏' },
  { name: '黑色连衣裙', category: '连体装', color: '黑色', material: '棉混纺', image_url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&h=600&fit=crop', desc: '经典小黑裙·四季' },
  // 外套
  { name: '黑色羽绒服', category: '外套', color: '黑色', material: '尼龙', image_url: 'https://images.unsplash.com/photo-1544923246-77307dd270b5?w=800&h=600&fit=crop', desc: '保暖必备·秋冬' },
  { name: '牛仔外套', category: '外套', color: '浅蓝', material: '牛仔布', image_url: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800&h=600&fit=crop', desc: '休闲利器·春秋' },
  { name: '黑色西服外套', category: '外套', color: '黑色', material: '西装料', image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&h=600&fit=crop', desc: '干练通勤·四季' },
  { name: '针织开衫', category: '外套', color: '米色', material: '针织', image_url: 'https://images.unsplash.com/photo-1583744946564-b53ac1efb997?w=800&h=600&fit=crop', desc: '温柔外搭·春秋' },
  { name: '米色风衣', category: '外套', color: '米色', material: '棉混纺', image_url: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800&h=600&fit=crop', desc: '气质优雅·春秋' },
  // 鞋
  { name: '小白鞋', category: '鞋', color: '白色', material: '合成革', image_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=600&fit=crop', desc: '休闲万能·四季' },
  { name: '帆布鞋', category: '鞋', color: '白色', material: '帆布', image_url: 'https://images.unsplash.com/photo-1605812860427-4024433a70fd?w=800&h=600&fit=crop', desc: '青春活力·春夏' },
  { name: '白色运动鞋', category: '鞋', color: '白色', material: '网面', image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=600&fit=crop', desc: '活力百搭·四季' },
  { name: '马丁靴', category: '鞋', color: '黑色', material: '真皮', image_url: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=800&h=600&fit=crop', desc: '酷帅有型·秋冬' },
  // 帽子
  { name: '棒球帽', category: '帽子', color: '黑色', material: '棉', image_url: 'https://images.unsplash.com/photo-1588850561407-ed78c334e67a?w=800&h=600&fit=crop', desc: '休闲运动·四季' },
  { name: '渔夫帽', category: '帽子', color: '米色', material: '棉', image_url: 'https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?w=800&h=600&fit=crop', desc: '遮阳利器·春夏' },
  { name: '针织冷帽', category: '帽子', color: '黑色', material: '针织', image_url: 'https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?w=800&h=600&fit=crop', desc: '保暖有型·秋冬' },
  // 围巾
  { name: '纯色针织围巾', category: '围巾', color: '灰色', material: '针织', image_url: 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=800&h=600&fit=crop', desc: '温暖配饰·秋冬' },
  { name: '腰带', category: '围巾', color: '黑色', material: '真皮', image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=600&fit=crop', desc: '基础配件·四季' },
  // 包
  { name: '双肩包', category: '包', color: '黑色', material: '尼龙', image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=600&fit=crop', desc: '通勤实用·四季' },
  { name: '帆布包', category: '包', color: '白色', material: '帆布', image_url: 'https://images.unsplash.com/photo-1601924921557-45e8e0e9c5e0?w=800&h=600&fit=crop', desc: '日常休闲·四季' },
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
