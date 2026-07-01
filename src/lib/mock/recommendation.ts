import { WardrobeItem, Outfit, OutfitItem, RecommendedItem, ClothingCategory, UserStylePreference } from '@/types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const OUTFIT_TEMPLATES: Record<string, Array<{
  name: string;
  items: string[];
  scene: string;
  tags: string[];
  colorTone: string;
  comment: string;
}>> = {
  '职场': [
    {name:'简约干练', items:['白衬衫','黑色长裤','小白鞋'], scene:'职场', tags:['极简','知性'], colorTone:'中性', comment:'白衬衫+黑裤+小白鞋，最经典的职场公式，简约干练不出错。'},
    {name:'温柔知性', items:['针织衫','黑色长裤','小白鞋'], scene:'职场', tags:['知性','韩系'], colorTone:'暖色', comment:'柔软针织衫搭配黑色长裤，温柔又不失专业感。'},
    {name:'随性不随意', items:['牛仔外套','白色T恤','蓝色牛仔裤','小白鞋'], scene:'职场', tags:['休闲','街头'], colorTone:'冷色', comment:'牛仔外套+白T+牛仔裤，在休闲与得体之间拿捏分寸。'}
  ],
  '休闲': [
    {name:'韩系松弛风', items:['针织衫','蓝色牛仔裤','小白鞋'], scene:'休闲', tags:['韩系','极简'], colorTone:'暖色', comment:'针织衫+牛仔裤，韩系松弛感拉满，逛街探店都合适。'},
    {name:'清爽简约风', items:['白色T恤','蓝色牛仔裤','小白鞋'], scene:'休闲', tags:['极简','法式'], colorTone:'中性', comment:'白T+牛仔裤+小白鞋，永远清爽不出错的万能公式。'},
    {name:'慵懒随性风', items:['灰色卫衣','黑色长裤','白色运动鞋'], scene:'休闲', tags:['街头','复古'], colorTone:'中性', comment:'卫衣+黑裤+运动鞋，慵懒又有型。'}
  ],
  '日常': [
    {name:'基础懒人款', items:['黑色T恤','运动裤','白色运动鞋'], scene:'日常', tags:['极简','运动'], colorTone:'中性', comment:'黑T+运动裤+运动鞋，出门不用想的最快方案。'},
    {name:'干净耐看款', items:['白色T恤','蓝色牛仔裤','帆布鞋'], scene:'日常', tags:['极简','韩系'], colorTone:'暖色', comment:'白T+牛仔裤+帆布鞋，干净清爽的日常标配。'},
    {name:'文艺气质款', items:['针织开衫','条纹T恤','蓝色牛仔裤'], scene:'日常', tags:['复古','知性'], colorTone:'暖色', comment:'针织开衫+条纹T+牛仔裤，文质彬彬的日常首选。'}
  ],
  '约会': [
    {name:'温柔甜系', items:['白色连衣裙','小白鞋'], scene:'约会', tags:['甜美','韩系'], colorTone:'暖色', comment:'白色连衣裙+小白鞋，清新甜美，约会首选。'},
    {name:'简约气质系', items:['黑色连衣裙','马丁靴'], scene:'约会', tags:['极简','知性'], colorTone:'中性', comment:'小黑裙+马丁靴，简约却气质在线，不刻意的美。'},
    {name:'清冷高级系', items:['针织开衫','白色T恤','黑色长裤','帆布鞋'], scene:'约会', tags:['法式','极简'], colorTone:'中性', comment:'开衫外搭+白T+黑裤，清冷中带点随性，高级感十足。'}
  ],
  '运动': [
    {name:'休闲运动风', items:['白色T恤','运动裤','白色运动鞋'], scene:'运动', tags:['运动','极简'], colorTone:'中性', comment:'白T+运动裤+运动鞋，轻量运动和散步都舒适。'},
    {name:'活力穿搭', items:['黑色卫衣','运动裤','白色运动鞋'], scene:'运动', tags:['街头','运动'], colorTone:'冷色', comment:'卫衣+运动裤+运动鞋，户外轻运动的舒适选择。'}
  ],
  '正式': [
    {name:'西装正式款', items:['白衬衫','黑色长裤','小白鞋'], scene:'正式', tags:['极简','知性'], colorTone:'中性', comment:'衬衫+黑裤+小白鞋，正式场合低调大气不出错。'},
    {name:'温柔正式款', items:['黑色连衣裙','针织开衫','小白鞋'], scene:'正式', tags:['知性','韩系'], colorTone:'暖色', comment:'小黑裙+针织开衫，正式中多一份柔和。'}
  ],
  '度假': [
    {name:'城市游玩', items:['白衬衫','短裤','帆布鞋','棒球帽'], scene:'度假', tags:['法式','极简'], colorTone:'暖色', comment:'衬衫+短裤+帆布鞋，舒服又上镜的城市漫步穿搭。'},
    {name:'慵懒度假风', items:['条纹T恤','蓝色牛仔裤','帆布鞋','帆布包'], scene:'度假', tags:['街头','休闲'], colorTone:'冷色', comment:'条纹T+牛仔裤+帆布鞋，随性自在的度假标配。'}
  ]
};

const TEMPLATE_ITEM_CATEGORIES: Record<string, ClothingCategory> = {
  '白衬衫': '上装',
  '针织衫': '上装',
  '牛仔外套': '外套',
  '白色T恤': '上装',
  '灰色卫衣': '上装',
  '黑色T恤': '上装',
  '条纹T恤': '上装',
  '黑色卫衣': '上装',
  '黑色长裤': '下装',
  '蓝色牛仔裤': '下装',
  '运动裤': '下装',
  '短裤': '下装',
  '小白鞋': '鞋履',
  '白色运动鞋': '鞋履',
  '帆布鞋': '鞋履',
  '马丁靴': '鞋履',
  '针织开衫': '外套',
  '白色连衣裙': '连体装',
  '黑色连衣裙': '连体装',
  '棒球帽': '帽巾',
  '帆布包': '包袋',
};

const SCENES = ['职场', '休闲', '日常', '约会', '运动', '正式', '度假'];

function matchWardrobeItem(
  templateItemName: string,
  wardrobeItems: WardrobeItem[],
  usedIds: Set<string>
): WardrobeItem | null {
  const expectedCategory = TEMPLATE_ITEM_CATEGORIES[templateItemName];
  for (const item of wardrobeItems) {
    if (usedIds.has(item.item_id)) continue;
    if (expectedCategory && item.category !== expectedCategory) continue;
    if (item.name.includes(templateItemName) || templateItemName.includes(item.name)) {
      return item;
    }
  }
  return null;
}

function buildOutfit(
  userId: string,
  sessionId: string,
  wardrobeItems: WardrobeItem[],
  index: number,
): Outfit {
  const scene = SCENES[index % SCENES.length];
  const templates = OUTFIT_TEMPLATES[scene] ?? [];
  if (templates.length === 0) {
    return {
      outfit_id: `mock_outfit_${index}_${Date.now()}`,
      user_id: userId,
      session_id: sessionId,
      ai_comment: '暂无推荐搭配。',
      source: 'ai_generated',
      items: [],
      created_at: new Date().toISOString(),
    };
  }

  const template = templates[index % templates.length];
  const outfitItems: OutfitItem[] = [];
  const recommendedItems: RecommendedItem[] = [];
  const usedIds = new Set<string>();
  let order = 0;

  for (const templateItemName of template.items) {
    const matched = matchWardrobeItem(templateItemName, wardrobeItems, usedIds);
    if (matched) {
      usedIds.add(matched.item_id);
      outfitItems.push({
        item_id: matched.item_id,
        outfit_id: '',
        display_order: order++,
        item: matched,
      });
    } else {
      recommendedItems.push({
        name: templateItemName,
        category: TEMPLATE_ITEM_CATEGORIES[templateItemName] ?? '上装',
        color: template.colorTone === '暖色' ? '暖色系' : template.colorTone === '冷色' ? '冷色系' : '中性色系',
        description: templateItemName,
      });
    }
  }

  const outfit_id = `mock_outfit_${index}_${Date.now()}`;

  return {
    outfit_id,
    user_id: userId,
    session_id: sessionId,
    name: template.name,
    ai_comment: template.comment,
    source: 'ai_generated',
    items: outfitItems.map(i => ({ ...i, outfit_id })),
    recommended_items: recommendedItems.length > 0 ? recommendedItems : undefined,
    style_tags: template.tags,
    occasion_tag: template.scene,
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

  const activeItems = wardrobeItems.filter(i => i.status === 'active');

  // Need at least some items to build outfits
  if (activeItems.length === 0) return [];

  return [buildOutfit(userId, sessionId, activeItems, 0)];
};

export const MOCK_NLP_KEYWORDS: Record<string, string[]> = {
  '约会': ['date', 'sweet', 'warm'],
  '工作': ['commute', 'commute_style', 'minimalist'],
  '通勤': ['commute', 'commute_style', 'minimalist'],
  '职场': ['work', 'commute_style', 'quiet_luxury'],
  '周末': ['casual', 'sweet', 'warm'],
  '运动': ['sport', 'sporty_casual'],
  '旅行': ['travel', 'bohemian'],
  '出游': ['travel', 'bohemian'],
  '休闲': ['casual', 'french'],
  '法式': ['french', 'romantic'],
  '老钱': ['quiet_luxury', 'minimalist'],
  '静奢': ['quiet_luxury', 'minimalist'],
  '极简': ['minimalist', 'quiet_luxury'],
  '日系': ['wabi_sabi', 'minimalist'],
  '侘寂': ['wabi_sabi', 'minimalist'],
  '学院': ['preppy', 'commute_style'],
  '猎装': ['safari', 'utility'],
  '复古': ['vintage', 'romantic'],
  '街头': ['street', 'urban_cool'],
  '机能': ['sporty_casual', 'utility'],
  '摇滚': ['rock', 'urban_cool'],
  '机车': ['rock', 'urban_cool'],
  '哥特': ['goth', 'rock'],
  '暗黑': ['goth', 'rock'],
  '甜美': ['sweet', 'romantic'],
  '少女': ['sweet', 'romantic'],
  '浪漫': ['romantic', 'french'],
  '田园': ['romantic', 'bohemian'],
  '波西米亚': ['bohemian', 'romantic'],
  '度假': ['bohemian', 'romantic'],
  '牛仔': ['western', 'street'],
  '工装': ['utility', 'street'],
  '先锋': ['avantgarde', 'urban_cool'],
  '都市': ['urban_cool', 'commute_style'],
  '酷': ['urban_cool', 'rock'],
  '莫兰迪': ['morandi', 'quiet_luxury'],
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
