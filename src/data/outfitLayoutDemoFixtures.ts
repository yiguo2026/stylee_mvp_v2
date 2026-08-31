import type { WardrobeItem } from '@/types';
import type { RecommendRespOutfit } from '@/lib/styleeMapping';
import { withBase } from '@/lib/withBase';

const createdAt = '2026-08-26T00:00:00.000Z';

function wardrobeItem(
  item_id: string,
  name: string,
  category: WardrobeItem['category'],
  imagePath: string,
): WardrobeItem {
  return {
    item_id,
    user_id: 'layout-demo',
    name,
    category,
    color: '',
    image_url: withBase(imagePath),
    source_type: 'manual',
    status: 'active',
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export const outfitLayoutDemoWardrobe = [
  wardrobeItem('dress', '黑色连衣裙', '连体装', '/preset-items/black-dress.png'),
  wardrobeItem('base', '黑色T恤', '上装', '/preset-items/black-tshirt.png'),
  wardrobeItem('mid', '灰色卫衣中层', '上装', '/preset-items/gray-sweatshirt.png'),
  wardrobeItem('outer', '卡其色风衣', '外套', '/preset-items/khaki-trench.png'),
  wardrobeItem('bottom', '黑色直筒裤', '下装', '/preset-items/black-trousers.png'),
  wardrobeItem('shoes', '白色乐福鞋', '鞋履', '/preset-items/womens-loafers.png'),
  wardrobeItem('bag', '黑色背包', '包袋', '/preset-items/black-backpack.png'),
  wardrobeItem('hat', '黑色针织帽', '帽巾', '/preset-items/beanie.png'),
  wardrobeItem('scarf', '米色针织围巾', '帽巾', '/preset-items/beige-scarf.png'),
] satisfies WardrobeItem[];

const roleById = {
  dress: 'dress',
  base: 'base',
  mid: 'mid',
  outer: 'outer',
  bottom: 'bottom',
  shoes: 'shoes',
  bag: 'bag',
  hat: 'hat',
  scarf: 'scarf',
} as const;

function response(name: string, ids: Array<keyof typeof roleById>): RecommendRespOutfit {
  return {
    name,
    owned_item_ids: ids,
    recommended_items: [],
    comment: '',
    layout_items: ids.map(item_id => ({
      source: 'owned',
      item_id,
      layout_role: roleById[item_id],
    })),
  };
}

export const outfitLayoutDemoFixtures: Array<{
  id: string;
  label: string;
  kind: 'validated-response' | 'structural-stress';
  outfit: RecommendRespOutfit;
}> = [
  {
    id: 'dress-2', label: '合法响应 fixture · 2件裙装', kind: 'validated-response',
    outfit: response('裙装', ['dress', 'shoes']),
  },
  {
    id: 'base-3', label: '合法响应 fixture · 3件基础', kind: 'validated-response',
    outfit: response('基础', ['base', 'bottom', 'shoes']),
  },
  {
    id: 'layer-4', label: '合法响应 fixture · 4件两层', kind: 'validated-response',
    outfit: response('两层', ['outer', 'base', 'bottom', 'shoes']),
  },
  {
    id: 'accessory-5', label: '合法响应 fixture · 5件单配饰', kind: 'validated-response',
    outfit: response('单配饰', ['outer', 'base', 'bottom', 'shoes', 'scarf']),
  },
  {
    id: 'accessory-6', label: '合法响应 fixture · 6件双配饰', kind: 'validated-response',
    outfit: response('双配饰', ['outer', 'base', 'bottom', 'shoes', 'bag', 'scarf']),
  },
  {
    id: 'stress-8', label: '8件结构压力测试 · 明确三层与丰富配饰', kind: 'structural-stress',
    outfit: response('结构压力测试', [
      'outer', 'base', 'mid', 'bottom', 'shoes', 'bag', 'hat', 'scarf',
    ]),
  },
];
