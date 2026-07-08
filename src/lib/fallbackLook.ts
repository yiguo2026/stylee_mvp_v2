import { WardrobeItem, Outfit, OutfitItem, RecommendedItem, ClothingCategory } from '@/types';

// ─── 本地兜底推荐单品库 ──────────────────────────────────────
// 方案A：当用户衣橱为空 / 单品不足以凑成完整搭配时，用这里的单品补位，
// 生成一套完整 look（用户已有单品标「已拥有」，补位单品标「你还没有」）。
// 结构与 RecommendedItem 一致，方便后续替换为真实"全网单品库"接口。

type LookConcept = 'top' | 'bottom' | 'shoes' | 'bag' | 'acc';

/** 每个品类内置几件，含名称 / 分类 / 颜色 / 占位图，保证空衣橱也能出完整搭配。 */
export const RECOMMEND_CATALOG: Record<LookConcept, RecommendedItem[]> = {
  top: [
    { name: '基础款白T恤', category: '上装', color: '白色', description: '百搭内搭·四季', image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300&h=300&fit=crop' },
    { name: '柔软针织衫', category: '上装', color: '米色', description: '温柔基础款·春秋', image_url: 'https://images.unsplash.com/photo-1434389677669-e08b4cda3a7a?w=300&h=300&fit=crop' },
  ],
  bottom: [
    { name: '直筒牛仔裤', category: '下装', color: '蓝色', description: '经典耐穿·四季', image_url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&h=300&fit=crop' },
    { name: '黑色西装长裤', category: '下装', color: '黑色', description: '利落显瘦·三季', image_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&h=300&fit=crop' },
  ],
  shoes: [
    { name: '百搭小白鞋', category: '鞋履', color: '白色', description: '清爽百搭·四季', image_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&h=300&fit=crop' },
  ],
  bag: [
    { name: '简约托特包', category: '包袋', color: '棕色', description: '通勤容量·四季', image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&h=300&fit=crop' },
  ],
  acc: [
    { name: '金属小耳饰', category: '配饰', color: '金色', description: '点睛配饰·四季' },
  ],
};

const pick = (list: RecommendedItem[]): RecommendedItem =>
  list[Math.floor(Math.random() * list.length)] ?? list[0];

/**
 * 构建"全品类混搭"兜底搭配：
 * - 用户已有的 active 单品原样放入（result 页标记「已拥有」）
 * - 缺失的核心品类（上装 / 下装 / 鞋履）用推荐库补位（标记「你还没有」）
 * - 单品过少时再补一件配饰点缀
 */
export function buildFallbackLook(
  activeItems: WardrobeItem[],
  userId: string,
  sessionId: string,
): Outfit {
  const outfit_id = `fallback_look_${Date.now()}`;

  // 已有单品（最多取 5 件，避免搭配过于臃肿）
  const owned = activeItems.slice(0, 5);
  const items: OutfitItem[] = owned.map((item, idx) => ({
    item_id: item.item_id,
    outfit_id,
    display_order: idx,
    item,
  }));

  const cats = new Set<ClothingCategory>(owned.map(i => i.category));
  const hasDress = cats.has('连体装');
  const hasTop = cats.has('上装') || cats.has('外套') || hasDress;
  const hasBottom = cats.has('下装') || hasDress;
  const hasShoes = cats.has('鞋履');

  const recommended: RecommendedItem[] = [];
  if (!hasTop) recommended.push(pick(RECOMMEND_CATALOG.top));
  if (!hasBottom) recommended.push(pick(RECOMMEND_CATALOG.bottom));
  if (!hasShoes) recommended.push(pick(RECOMMEND_CATALOG.shoes));
  // 单品太少时补一件配饰，保证整套更完整
  if (items.length + recommended.length < 3) recommended.push(pick(RECOMMEND_CATALOG.acc));

  const comment = owned.length > 0
    ? `已用你衣橱里的 ${owned.length} 件单品，智能补齐 ${recommended.length} 件缺失品类，凑成一套完整的日常搭配。缺的单品可一键加入心愿单。`
    : `你的衣橱还是空的，先用推荐单品搭一套完整 look 参考～ 喜欢的单品可加入心愿单，或拍照上传到衣橱。`;

  return {
    outfit_id,
    user_id: userId,
    session_id: sessionId,
    name: '全品类混搭',
    ai_comment: comment,
    source: 'ai_generated',
    items,
    recommended_items: recommended.length > 0 ? recommended : undefined,
    created_at: new Date().toISOString(),
  };
}
