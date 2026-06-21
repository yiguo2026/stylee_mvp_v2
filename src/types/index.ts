export type Gender = 'female' | 'male' | 'other' | 'private';
export type ClothingCategory = '上装' | '下装' | '连衣裙' | '外套' | '鞋' | '包' | '配饰';
export type Season = '春' | '夏' | '秋' | '冬';
export type TagType = 'occasion' | 'style' | 'season' | 'color_system' | 'custom';
export type SourceType = 'manual' | 'photo_ai' | 'album_ai';
export type ItemStatus = 'active' | 'inactive' | 'archived';
export type OutfitSource = 'ai_generated' | 'user_created';
export type WeatherCondition = '晴' | '多云' | '阴' | '小雨' | '大雨' | '雪';

export interface UserProfile {
  user_id: string;
  nickname: string;
  gender: Gender;
  age?: number;
  profession?: string;
  permanent_city?: string;
  avatar_url?: string;
  body_shape?: string;
  skin_tone?: string;
  created_at: string;
  updated_at: string;
}

export interface StyleTag {
  tag_id: string;
  tag_name: string;
  tag_type: TagType;
  icon?: string;
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
  image_url?: string;
  source_type: SourceType;
  fit_type?: string;
  ai_recognized_attrs?: Record<string, string>;
  status: ItemStatus;
  tags?: StyleTag[];
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
}

export const OCCASION_TAGS: FilterTag[] = [
  { id: 'daily', label: '日常', type: 'occasion', selected: false },
  { id: 'work', label: '工作', type: 'occasion', selected: false },
  { id: 'date', label: '约会', type: 'occasion', selected: false },
  { id: 'sport', label: '运动', type: 'occasion', selected: false },
  { id: 'party', label: '派对', type: 'occasion', selected: false },
  { id: 'travel', label: '旅行', type: 'occasion', selected: false },
  { id: 'interview', label: '面试', type: 'occasion', selected: false },
  { id: 'ceremony', label: '典礼', type: 'occasion', selected: false },
  { id: 'holiday', label: '度假', type: 'occasion', selected: false },
  { id: 'gathering', label: '聚会', type: 'occasion', selected: false },
];

export const STYLE_TAGS: FilterTag[] = [
  { id: 'casual', label: '休闲', type: 'style', selected: false },
  { id: 'elegant', label: '优雅', type: 'style', selected: false },
  { id: 'french', label: '法式', type: 'style', selected: false },
  { id: 'street', label: '街头', type: 'style', selected: false },
  { id: 'minimalist', label: '极简', type: 'style', selected: false },
  { id: 'vintage', label: '复古', type: 'style', selected: false },
  { id: 'artsy', label: '文艺', type: 'style', selected: false },
  { id: 'old_money', label: '老钱风', type: 'style', selected: false },
  { id: 'sporty', label: '运动风', type: 'style', selected: false },
  { id: 'bohemian', label: '波西米亚', type: 'style', selected: false },
  { id: 'korean', label: '韩系', type: 'style', selected: false },
  { id: 'japanese', label: '日系', type: 'style', selected: false },
  { id: 'cool', label: '酷帅', type: 'style', selected: false },
  { id: 'romantic', label: '浪漫', type: 'style', selected: false },
];

export const COLOR_TAGS: FilterTag[] = [
  { id: 'warm', label: '暖色', type: 'color_system', selected: false },
  { id: 'cool', label: '冷色', type: 'color_system', selected: false },
  { id: 'neutral', label: '中性', type: 'color_system', selected: false },
  { id: 'black_white', label: '黑白', type: 'color_system', selected: false },
  { id: 'pastel', label: '马卡龙', type: 'color_system', selected: false },
  { id: 'earth', label: '大地色', type: 'color_system', selected: false },
  { id: 'jewel', label: '宝石色', type: 'color_system', selected: false },
  { id: 'monochrome', label: '单色系', type: 'color_system', selected: false },
];

export const TEMP_TAGS: FilterTag[] = [
  { id: 'temp_hot', label: '热天 25°C+', type: 'temperature', selected: false },
  { id: 'temp_warm', label: '暖天 15–25°C', type: 'temperature', selected: false },
  { id: 'temp_cool', label: '凉天 5–15°C', type: 'temperature', selected: false },
  { id: 'temp_cold', label: '冷天 5°C-', type: 'temperature', selected: false },
];

export const PRESET_STYLE_PREFERENCES: StyleTag[] = [
  { tag_id: 'casual', tag_name: '休闲', tag_type: 'style' },
  { tag_id: 'elegant', tag_name: '优雅', tag_type: 'style' },
  { tag_id: 'french', tag_name: '法式', tag_type: 'style' },
  { tag_id: 'street', tag_name: '街头', tag_type: 'style' },
  { tag_id: 'minimalist', tag_name: '极简', tag_type: 'style' },
  { tag_id: 'vintage', tag_name: '复古', tag_type: 'style' },
  { tag_id: 'sport', tag_name: '运动', tag_type: 'style' },
  { tag_id: 'bohemian', tag_name: '波西米亚', tag_type: 'style' },
  { tag_id: 'preppy', tag_name: '学院', tag_type: 'style' },
  { tag_id: 'feminine', tag_name: '甜美', tag_type: 'style' },
  { tag_id: 'commute', tag_name: '通勤', tag_type: 'style' },
  { tag_id: 'gentle', tag_name: '温柔', tag_type: 'style' },
  { tag_id: 'korean', tag_name: '韩系', tag_type: 'style' },
  { tag_id: 'japanese', tag_name: '日系', tag_type: 'style' },
  { tag_id: 'cool', tag_name: '酷帅', tag_type: 'style' },
  { tag_id: 'artsy', tag_name: '文艺', tag_type: 'style' },
  { tag_id: 'old_money', tag_name: '老钱风', tag_type: 'style' },
  { tag_id: 'city_chic', tag_name: '都市', tag_type: 'style' },
  { tag_id: 'cottagecore', tag_name: '田园', tag_type: 'style' },
  { tag_id: 'dark_academia', tag_name: '暗黑学院', tag_type: 'style' },
  { tag_id: 'gorpcore', tag_name: '户外机能', tag_type: 'style' },
  { tag_id: 'romantic', tag_name: '浪漫', tag_type: 'style' },
  { tag_id: 'smart_casual', tag_name: '商务休闲', tag_type: 'style' },
  { tag_id: 'normcore', tag_name: '基础款', tag_type: 'style' },
  { tag_id: 'y2k', tag_name: 'Y2K', tag_type: 'style' },
  { tag_id: 'mori', tag_name: '森系', tag_type: 'style' },
];

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

// Tag ID → Chinese display name mapping
export const TAG_DISPLAY: Record<string, string> = {
  casual: '休闲', elegant: '优雅', french: '法式', street: '街头',
  minimalist: '极简', vintage: '复古', sport: '运动', bohemian: '波西米亚',
  preppy: '学院', feminine: '甜美', commute: '通勤', gentle: '温柔',
  korean: '韩系', japanese: '日系', cool: '酷帅',
  artsy: '文艺', old_money: '老钱风', city_chic: '都市',
  cottagecore: '田园', dark_academia: '暗黑学院', gorpcore: '户外机能',
  romantic: '浪漫', smart_casual: '商务休闲', normcore: '基础款',
  y2k: 'Y2K', mori: '森系',
  punk: '朋克', oversize: 'Oversize', dark: '暗黑', hiphop: '嘻哈',
  sexy: '性感', avantgarde: '前卫', ethnic: '民族', luxury: '奢华',
  logo_mania: '大Logo', neon: '荧光色', sheer: '透视', crop: '露脐',
  matchy: '成套穿', childlike: '幼稚',
  // Occasion tags
  daily: '日常', work: '工作', date: '约会',
  party: '派对', travel: '旅行', interview: '面试', ceremony: '典礼',
  holiday: '度假', gathering: '聚会',
  // Color system tags
  warm: '暖色', neutral: '中性', black_white: '黑白',
  pastel: '马卡龙', earth: '大地色', jewel: '宝石色', monochrome: '单色系',
  // Temperature tags
  temp_hot: '热天', temp_warm: '暖天', temp_cool: '凉天', temp_cold: '冷天',
};
