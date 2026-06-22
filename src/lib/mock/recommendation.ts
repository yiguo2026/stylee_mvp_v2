import { WardrobeItem, Outfit, ClothingCategory, UserStylePreference } from '@/types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const AI_COMMENTS = [
  '白色上衣搭配深色下装是经典的显瘦组合，简约而不失质感。',
  '这套搭配色调统一，层次感丰富，很适合今日的天气与场合。',
  '轻松的休闲风格，百搭实用，让你在保持舒适的同时展现时髦感。',
  '经典法式风格，优雅而低调，细节处体现品味。',
  '色彩对比恰到好处，整体造型有活力又不失稳重。',
];

const STYLE_AI_COMMENTS: Record<string, string> = {
  'korean': '韩系风格温柔清新，这套搭配让你散发迷人的少女感。',
  'sweet': '甜美风格温柔可人，这套搭配给人亲切又精致的感觉。',
  'new_chinese': '新中式风格将传统与现代完美融合，这套搭配韵味十足。',
  'preppy': '学院风青春活力，这套搭配减龄又时髦。',
  'city_chic': '都市风格干练洒脱，这套搭配让你在都市中自信出众。',
  'artsy': '文艺风格注重内涵表达，这套搭配透着独特的审美品味。',
  'sporty_casual': '运动休闲风格活力满满，这套搭配让你行动自如又不失时尚。',
  'commute_style': '通勤风格简洁利落，这套搭配职场日常两不误。',
  'french': '法式风情讲究不经意的优雅，随性中自有品味。',
  'maillard': '美拉德风格用温暖棕色系打造质感，高级又耐看。',
  'japanese': '日系风格清新自然，这套搭配舒适中透着小精致。',
  'business': '商务风格稳重得体，这套搭配展现专业气场。',
  'american': '美式风格自由随性，这套搭配自信又有型。',
  'british': '英伦风格经典优雅，这套搭配低调中彰显品味。',
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildOutfit(
  userId: string,
  sessionId: string,
  tops: WardrobeItem[],
  bottoms: WardrobeItem[],
  dresses: WardrobeItem[],
  shoes: WardrobeItem[],
  others: WardrobeItem[],
  index: number,
  likedStyleNames?: string[]
): Outfit {
  const items: Outfit['items'] = [];
  let order = 0;

  // Alternate between top+bottom and dress
  const useDress = dresses.length > 0 && index === 1;
  if (useDress) {
    const dress = dresses[index % dresses.length];
    if (dress) items.push({ item_id: dress.item_id, outfit_id: '', display_order: order++, item: dress });
  } else {
    const top = tops[index % tops.length];
    if (top) items.push({ item_id: top.item_id, outfit_id: '', display_order: order++, item: top });

    const bottom = bottoms[index % bottoms.length];
    if (bottom) items.push({ item_id: bottom.item_id, outfit_id: '', display_order: order++, item: bottom });
  }

  const shoe = shoes[index % shoes.length];
  if (shoe) items.push({ item_id: shoe.item_id, outfit_id: '', display_order: order++, item: shoe });

  if (others.length > 0) {
    const extra = others[(index + 1) % others.length];
    if (extra) items.push({ item_id: extra.item_id, outfit_id: '', display_order: order++, item: extra });
  }

  const outfit_id = `mock_outfit_${index}_${Date.now()}`;

  let ai_comment: string;
  if (likedStyleNames && likedStyleNames.length > 0) {
    const styleName = likedStyleNames[index % likedStyleNames.length];
    const styleComment = STYLE_AI_COMMENTS[styleName];
    ai_comment = styleComment ?? `这套搭配很适合你的${styleName}风格，穿出属于自己的独特气质。`;
  } else {
    ai_comment = AI_COMMENTS[index % AI_COMMENTS.length];
  }

  return {
    outfit_id,
    user_id: userId,
    session_id: sessionId,
    ai_comment,
    source: 'ai_generated',
    items: items.map(i => ({ ...i, outfit_id })),
    created_at: new Date().toISOString(),
  };
}

export const mockGetOutfitRecommendations = async (
  wardrobeItems: WardrobeItem[],
  userId: string,
  sessionId: string,
  stylePreferences?: UserStylePreference[]
): Promise<Outfit[]> => {
  await delay(2000);

  const byCategory = (cat: ClothingCategory) =>
    wardrobeItems.filter(i => i.category === cat && i.status === 'active');

  const tops = byCategory('上装');
  const bottoms = byCategory('下装');
  const dresses = byCategory('连体装');
  const shoes = byCategory('鞋');
  const coats = byCategory('外套');
  const bags = byCategory('包');
  const hats = byCategory('帽子');
  const scarves = byCategory('围巾');
  const extras = [...coats, ...bags, ...hats, ...scarves];

  // Need at least top+bottom or a dress
  if (tops.length === 0 && dresses.length === 0) return [];
  if (bottoms.length === 0 && dresses.length === 0) return [];

  const likedStyleNames = stylePreferences
    ?.filter(p => p.preference_type === 'like' && p.tag?.tag_name)
    .map(p => p.tag!.tag_name) ?? [];
  const outfits: Outfit[] = [];

  for (let i = 0; i < 3; i++) {
    outfits.push(buildOutfit(userId, sessionId, tops, bottoms, dresses, shoes, extras, i, likedStyleNames));
  }

  return outfits;
};

export const MOCK_NLP_KEYWORDS: Record<string, string[]> = {
  '约会': ['date', 'sweet', 'warm'],
  '工作': ['commute', 'commute_style', 'morandi'],
  '通勤': ['commute', 'commute_style', 'morandi'],
  '周末': ['casual', 'korean', 'warm'],
  '运动': ['sport', 'sporty_casual'],
  '旅行': ['travel', 'casual'],
  '出游': ['travel', 'french'],
  '休闲': ['casual', 'korean'],
  '法式': ['french', 'sweet'],
  '韩系': ['korean', 'sweet'],
  '日系': ['japanese', 'morandi'],
  '商务': ['business', 'british'],
  '英伦': ['british', 'business'],
  '美拉德': ['maillard', 'warm'],
  '新中式': ['new_chinese', 'morandi'],
  '学院': ['preppy', 'korean'],
  '都市': ['city_chic', 'commute_style'],
  '文艺': ['artsy', 'japanese'],
  '美式': ['american', 'casual'],
};

export const extractTagsFromQuery = (query: string): string[] => {
  const matched = new Set<string>();
  for (const [keyword, tags] of Object.entries(MOCK_NLP_KEYWORDS)) {
    if (query.includes(keyword)) {
      tags.forEach(t => matched.add(t));
    }
  }
  return Array.from(matched);
};
