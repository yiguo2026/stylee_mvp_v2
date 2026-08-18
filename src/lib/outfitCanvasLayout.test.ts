import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOutfitCanvasLayout,
  classifyOutfitCanvasRole,
  garmentImageScale,
  type OutfitCanvasLayoutItem,
  type OutfitCanvasPlacement,
} from './outfitCanvasLayout.ts';

const base: OutfitCanvasLayoutItem[] = [
  { id: 'top', name: '黑色高领内搭', category: '上装' },
  { id: 'bottom', name: '黑色直筒裤', category: '下装' },
  { id: 'shoes', name: '白色乐福鞋', category: '鞋履' },
];

function placement(layout: OutfitCanvasPlacement[], id: string) {
  const value = layout.find((entry) => entry.item.id === id);
  assert.ok(value, `missing ${id}`);
  return value;
}

function overlaps(a: OutfitCanvasPlacement, b: OutfitCanvasPlacement) {
  return a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;
}

test('three-item layout keeps smaller shoes centered below trousers', () => {
  const layout = buildOutfitCanvasLayout(base);
  const top = placement(layout, 'top');
  const bottom = placement(layout, 'bottom');
  const shoes = placement(layout, 'shoes');
  assert.equal(top.left + top.width / 2, bottom.left + bottom.width / 2);
  assert.ok(shoes.width <= 22, `shoe width was ${shoes.width}`);
  assert.ok(shoes.top >= bottom.top + bottom.height);
  assert.ok(Math.abs(
    (shoes.left + shoes.width / 2) - (bottom.left + bottom.width / 2),
  ) <= 2);
  assert.equal(overlaps(bottom, shoes), false);
});

test('layered layout places outerwear behind the central clothing axis', () => {
  const layout = buildOutfitCanvasLayout([
    { id: 'outer', name: '卡其色风衣', category: '外套' },
    ...base,
  ]);
  const outer = placement(layout, 'outer');
  const top = placement(layout, 'top');
  const bottom = placement(layout, 'bottom');
  assert.ok(outer.left < top.left);
  assert.ok(outer.zIndex < top.zIndex);
  assert.equal(top.left + top.width / 2, bottom.left + bottom.width / 2);
  assert.equal(overlaps(bottom, placement(layout, 'shoes')), false);
});

test('accessories orbit only when present and never create placeholders', () => {
  const baseLayout = buildOutfitCanvasLayout(base);
  assert.equal(baseLayout.length, 3);

  const layout = buildOutfitCanvasLayout([
    { id: 'outer', name: '卡其色风衣', category: '外套' },
    ...base,
    { id: 'hat', name: '白色棒球帽', category: '帽巾' },
    { id: 'scarf', name: '米色针织围巾', category: '帽巾' },
  ]);
  assert.equal(layout.length, 6);
  assert.equal(placement(layout, 'hat').role, 'hat');
  assert.equal(placement(layout, 'scarf').role, 'scarf');
  assert.ok(placement(layout, 'hat').left > placement(layout, 'top').left);
});

test('more than two accessories move overflow items into a compact lower band', () => {
  const layout = buildOutfitCanvasLayout([
    ...base,
    { id: 'hat', name: '棒球帽', category: '帽巾' },
    { id: 'scarf', name: '围巾', category: '帽巾' },
    { id: 'bag', name: '托特包', category: '包袋' },
    { id: 'watch', name: '手表', category: '配饰' },
  ]);
  const overflow = placement(layout, 'watch');
  assert.equal(overflow.zone, 'accessory-band');
  assert.ok(overflow.top >= 82);
});

test('classification separates hats and scarves even though the database category is shared', () => {
  assert.equal(classifyOutfitCanvasRole({ id: 'h', name: '针织冷帽', category: '帽巾' }), 'hat');
  assert.equal(classifyOutfitCanvasRole({ id: 's', name: '羊绒围巾', category: '帽巾' }), 'scarf');
});

test('all placements stay inside the normalized canvas', () => {
  const layout = buildOutfitCanvasLayout([
    { id: 'outer', name: '风衣', category: '外套' },
    ...base,
    { id: 'hat', name: '帽子', category: '帽巾' },
    { id: 'scarf', name: '围巾', category: '帽巾' },
    { id: 'bag', name: '包', category: '包袋' },
    { id: 'belt', name: '腰带', category: '配饰' },
  ]);
  for (const item of layout) {
    assert.ok(item.left >= 0 && item.top >= 0);
    assert.ok(item.left + item.width <= 100);
    assert.ok(item.top + item.height <= 100);
  }
});

test('core garments are visually enlarged while shoes remain secondary', () => {
  assert.ok(garmentImageScale('outer') >= 1.50);
  assert.ok(garmentImageScale('top') >= 1.58);
  assert.ok(garmentImageScale('bottom') >= 1.54);
  assert.ok(garmentImageScale('shoes') >= 1.24);
  assert.ok(garmentImageScale('shoes') < garmentImageScale('top'));
  assert.ok(garmentImageScale('hat') < garmentImageScale('outer'));
});
