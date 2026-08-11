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
      { name: '红色针织帽', category: '帽巾', color: '红色', image_url: '/inspirations/items/look1_01_red_beanie.png' },
      { name: '黑色高领针织衫', category: '上装', color: '黑色', image_url: '/inspirations/items/look1_02_black_turtleneck.png' },
      { name: '黑色皮衣', category: '外套', color: '黑色', image_url: '/inspirations/items/look1_03_black_leather_jacket.png' },
      { name: '蓝色牛仔裤', category: '下装', color: '蓝色', image_url: '/inspirations/items/look1_04_blue_jeans.png' },
      { name: '黑色靴子', category: '鞋履', color: '黑色', image_url: '/inspirations/items/look1_05_black_boots.png' },
      { name: '黑色托特包', category: '包袋', color: '黑色', image_url: '/inspirations/items/look1_06_black_tote_bag.png' },
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
      { name: '蓝色衬衫', category: '上装', color: '蓝色', image_url: '/inspirations/items/look2_01_blue_shirt.png' },
      { name: '条纹毛衣', category: '上装', color: '多色', image_url: '/inspirations/items/look2_02_striped_sweater.png' },
      { name: '浅色牛仔裤', category: '下装', color: '蓝色', image_url: '/inspirations/items/look2_03_light_jeans.png' },
      { name: '黑框眼镜', category: '配饰', color: '黑色', image_url: '/inspirations/items/look2_04_black_glasses.png' },
      { name: '金色项链', category: '配饰', color: '金色', image_url: '/inspirations/items/look2_05_gold_necklace.png' },
      { name: '金色耳环', category: '配饰', color: '金色', image_url: '/inspirations/items/look2_06_gold_earrings.png' },
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
      { name: '草编帽', category: '帽巾', color: '米色', image_url: '/inspirations/items/look3_01_straw_hat.png' },
      { name: '白色衬衫', category: '上装', color: '白色', image_url: '/inspirations/items/look3_02_white_shirt.png' },
      { name: '白色长裤', category: '下装', color: '白色', image_url: '/inspirations/items/look3_03_white_trousers.png' },
      { name: '白色乐福鞋', category: '鞋履', color: '白色', image_url: '/inspirations/items/look3_04_white_loafers.png' },
      { name: '编织包', category: '包袋', color: '米色', image_url: '/inspirations/items/look3_05_knit_bag.png' },
      { name: '蓝色墨镜', category: '配饰', color: '蓝色', image_url: '/inspirations/items/look3_06_blue_sunglasses.png' },
      { name: '珍珠项链', category: '配饰', color: '白色', image_url: '/inspirations/items/look3_07_pearl_necklace.png' },
      { name: '珍珠耳环', category: '配饰', color: '白色', image_url: '/inspirations/items/look3_08_pearl_earrings.png' },
      { name: '黑色手杖', category: '配饰', color: '黑色', image_url: '/inspirations/items/look3_09_black_cane.png' },
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
      { name: '条纹抹胸上衣', category: '上装', color: '多色', image_url: '/inspirations/items/look4_01_striped_bustier_top.png' },
      { name: '条纹迷你裙', category: '下装', color: '多色', image_url: '/inspirations/items/look4_02_striped_mini_skirt.png' },
      { name: '白色菱格包', category: '包袋', color: '白色', image_url: '/inspirations/items/look4_03_white_quilted_bag.png' },
      { name: '玳瑁墨镜', category: '配饰', color: '棕色', image_url: '/inspirations/items/look4_04_tortoise_sunglasses.png' },
      { name: '金色手镯', category: '配饰', color: '金色', image_url: '/inspirations/items/look4_05_gold_bracelets.png' },
      { name: '金色耳钉', category: '配饰', color: '金色', image_url: '/inspirations/items/look4_06_gold_stud_earrings.png' },
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
      { name: '灰色 Polo 衫', category: '上装', color: '灰色', image_url: '/inspirations/items/look5_01_grey_polo.png' },
      { name: '白色长裤', category: '下装', color: '白色', image_url: '/inspirations/items/look5_02_white_trousers.png' },
      { name: '棕色麂皮乐福鞋', category: '鞋履', color: '棕色', image_url: '/inspirations/items/look5_03_brown_suede_loafers.png' },
      { name: '棕色麂皮棒球帽', category: '帽巾', color: '棕色', image_url: '/inspirations/items/look5_04_brown_suede_cap.png' },
      { name: '棕色编织腰带', category: '配饰', color: '棕色', image_url: '/inspirations/items/look5_05_brown_braided_belt.png' },
      { name: '深色墨镜', category: '配饰', color: '黑色', image_url: '/inspirations/items/look5_06_dark_sunglasses.png' },
      { name: '金色手表', category: '配饰', color: '金色', image_url: '/inspirations/items/look5_07_gold_watch.png' },
      { name: '金色戒指', category: '配饰', color: '金色', image_url: '/inspirations/items/look5_08_gold_rings.png' },
      { name: '金色耳环', category: '配饰', color: '金色', image_url: '/inspirations/items/look5_09_gold_hoop_earring.png' },
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
