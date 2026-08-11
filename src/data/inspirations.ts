import { InspirationCard, InspirationItem } from '@/types';

// ─── 编辑精选灵感（穿搭灵感单一数据源）────────────────────────────
// DB inspiration_cards 表不含 items 明细字段，真实单品缩略图
// (/inspirations/items/*.png) 只在这里定义。首页与灵感详情页共用同一份
// 数据，避免"图标占位 vs 真实图片"两处数据不一致。非测试用 mock。
export const FALLBACK_INSPIRATIONS: InspirationCard[] = [
  {
    card_id: 'insp-1',
    title: '法式复古街头',
    image_url: '/inspirations/insp-1.png',
    style_tags: ['french', 'vintage'],
    comment: '皮衣配做旧牛仔，巴黎街头的慵懒松弛',
    occasion: '休闲',
    items: [
      { name: '红色针织帽', category: '帽巾', color: '红色', image_url: '/inspirations/items/insp-1-hat.png' },
      { name: 'oversize黑色皮衣', category: '外套', color: '黑色', image_url: '/inspirations/items/insp-1-jacket.png' },
      { name: '做旧阔腿牛仔裤', category: '下装', color: '蓝色', image_url: '/inspirations/items/insp-1-pants.png' },
      { name: '黑色尖头鞋', category: '鞋履', color: '黑色', image_url: '/inspirations/items/insp-1-shoes.png' },
      { name: '黑色托特包', category: '包袋', color: '黑色', image_url: '/inspirations/items/insp-1-bag.png' },
    ],
  },
  {
    card_id: 'insp-2',
    title: '撞色街头风',
    image_url: '/inspirations/insp-2.png',
    style_tags: ['street', 'urban_cool'],
    comment: '一条红围巾，点亮蓝调基础款',
    occasion: '休闲',
    items: [
      { name: 'oversize蓝色衬衫', category: '上装', color: '蓝色', image_url: '/inspirations/items/insp-2-shirt.png' },
      { name: '红色毛绒围巾', category: '帽巾', color: '红色', image_url: '/inspirations/items/insp-2-scarf.png' },
      { name: '浅色直筒牛仔裤', category: '下装', color: '蓝色', image_url: '/inspirations/items/insp-2-jeans.png' },
    ],
  },
  {
    card_id: 'insp-3',
    title: '海边度假甜风',
    image_url: '/inspirations/insp-3.png',
    style_tags: ['sweet', 'bohemian'],
    comment: '蓝白条纹套装，清爽的海边假日',
    occasion: '度假',
    items: [
      { name: '蓝白条纹抹胸', category: '上装', color: '蓝色', image_url: '/inspirations/items/insp-3-top.png' },
      { name: '蓝白条纹短裙', category: '下装', color: '蓝色', image_url: '/inspirations/items/insp-3-skirt.png' },
      { name: '猫眼墨镜', category: '配饰', color: '黑色', image_url: '/inspirations/items/insp-3-sunglass.png' },
      { name: '白色手提包', category: '包袋', color: '白色', image_url: '/inspirations/items/insp-3-bag.png' },
    ],
  },
  {
    card_id: 'insp-4',
    title: '静奢老钱风',
    image_url: '/inspirations/insp-4.png',
    style_tags: ['quiet_luxury', 'minimalist'],
    comment: '灰白配色，低调而从容的格调',
    occasion: '休闲',
    items: [
      { name: '深灰古巴领短袖', category: '上装', color: '灰色', image_url: '/inspirations/items/insp-4-top.png' },
      { name: '白色阔腿裤', category: '下装', color: '白色', image_url: '/inspirations/items/insp-4-pants.png' },
      { name: '棕色棒球帽', category: '帽巾', color: '棕色', image_url: '/inspirations/items/insp-4-cap.png' },
      { name: '棕色麂皮乐福鞋', category: '鞋履', color: '棕色', image_url: '/inspirations/items/insp-4-shoes.png' },
    ],
  },
  {
    card_id: 'insp-5',
    title: '夏日全白风',
    image_url: '/inspirations/insp-5.png',
    style_tags: ['quiet_luxury', 'bohemian'],
    comment: '通身白系，松弛又优雅的度假姿态',
    occasion: '度假',
    items: [
      { name: '白色亚麻衬衫', category: '上装', color: '白色', image_url: '/inspirations/items/insp-5-shirt.png' },
      { name: '白色长裤', category: '下装', color: '白色', image_url: '/inspirations/items/insp-5-pants.png' },
      { name: '草编帽', category: '帽巾', color: '米色', image_url: '/inspirations/items/insp-5-hat.png' },
      { name: '米色编织包', category: '包袋', color: '米色', image_url: '/inspirations/items/insp-5-bag.png' },
      { name: '白色乐福鞋', category: '鞋履', color: '白色', image_url: '/inspirations/items/insp-5-shoes.png' },
    ],
  },
];

/**
 * 单一数据源辅助：按 card_id 取回编辑精选灵感卡。
 * 供灵感详情页在 route params 缺失 items / image_url 时做兜底回填。
 */
export function getFallbackInspiration(cardId?: string | null): InspirationCard | undefined {
  if (!cardId) return undefined;
  return FALLBACK_INSPIRATIONS.find(c => c.card_id === cardId);
}

/**
 * 将 route params 传来的 breakdown items 与编辑精选灵感卡对齐：
 * - 若传入为空但命中编辑精选卡，直接用编辑精选 items；
 * - 若传入 item 缺 image_url，则按 name / (category+color) 从编辑精选卡回填。
 * 保证详情页单品拆解始终拿到真实单品图片路径。
 */
export function reconcileBreakdownItems(
  items: InspirationItem[],
  cardId?: string | null,
): InspirationItem[] {
  const canonical = getFallbackInspiration(cardId);
  const canonicalItems = canonical?.items ?? [];
  if (canonicalItems.length === 0) return items;
  if (items.length === 0) return canonicalItems;
  return items.map(it => {
    if (it.image_url) return it;
    const match =
      canonicalItems.find(ci => ci.name === it.name) ??
      canonicalItems.find(ci => ci.category === it.category && ci.color === it.color);
    return match?.image_url ? { ...it, image_url: match.image_url } : it;
  });
}
