import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOutfitCanvasLayout,
  classifyOutfitCanvasRole,
  garmentImageScale,
  placementBounds,
  type OutfitCanvasLayoutItem,
  type OutfitCanvasPlacement,
  type OutfitCanvasRole,
} from './outfitCanvasLayout.ts';

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

const roleItem = (id: string, layoutRole: OutfitCanvasRole): OutfitCanvasLayoutItem => ({
  id,
  name: id,
  category: layoutRole,
  layoutRole,
});

const dress = roleItem('dress', 'dress');
const baseRole = roleItem('base', 'base');
const mid = roleItem('mid', 'mid');
const outer = roleItem('outer', 'outer');
const bottomRole = roleItem('bottom', 'bottom');
const shoesRole = roleItem('shoes', 'shoes');
const bag = roleItem('bag', 'bag');
const hat = roleItem('hat', 'hat');
const scarf = roleItem('scarf', 'scarf');

const legalRoleFixtures: OutfitCanvasLayoutItem[][] = [
  [dress, shoesRole],
  [baseRole, bottomRole, shoesRole],
  [outer, baseRole, bottomRole, shoesRole],
  [outer, baseRole, bottomRole, shoesRole, scarf],
  [outer, baseRole, bottomRole, shoesRole, bag, scarf],
  [outer, baseRole, mid, bottomRole, shoesRole, bag, scarf],
  [outer, baseRole, mid, bottomRole, shoesRole, bag, hat, scarf],
  [baseRole, mid, bottomRole, shoesRole],
];

const baseSeparates = [
  { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' as const },
  { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' as const },
  { id: 'shoes', name: '鞋', category: '鞋履', layoutRole: 'shoes' as const },
];

const VISIBLE_SIZE_TOLERANCE = 0.5;

function visibleSizeFor(
  role: OutfitCanvasRole,
  alpha: { width: number; height: number },
  sourceAspectRatio = 1,
) {
  const accessory = {
    id: role,
    name: role,
    category: role,
    layoutRole: role,
  } satisfies OutfitCanvasLayoutItem;
  const core = [
    { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' as const },
    { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' as const },
    { id: 'core-shoes', name: '鞋', category: '鞋履', layoutRole: 'shoes' as const },
  ];
  const items = role === 'shoes' ? core : [...core, accessory];
  const targetId = role === 'shoes' ? 'core-shoes' : role;
  const entry = placement(buildOutfitCanvasLayout(items), targetId);
  const frameAspectRatio = entry.width / entry.height;
  const containedWidth = sourceAspectRatio > frameAspectRatio
    ? entry.width
    : entry.height * sourceAspectRatio;
  const containedHeight = sourceAspectRatio > frameAspectRatio
    ? entry.width / sourceAspectRatio
    : entry.height;
  return {
    containedWidth,
    containedHeight,
    width: containedWidth * garmentImageScale(role) * alpha.width,
    height: containedHeight * garmentImageScale(role) * alpha.height,
  };
}

function assertVisibleRange(
  role: OutfitCanvasRole,
  alpha: { width: number; height: number },
  minWidth: number,
  maxWidth: number,
  minHeight: number,
  maxHeight: number,
) {
  const size = visibleSizeFor(role, alpha);
  assert.ok(
    size.width >= minWidth - VISIBLE_SIZE_TOLERANCE
      && size.width <= maxWidth + VISIBLE_SIZE_TOLERANCE,
    `${role} width ${size.width}`,
  );
  assert.ok(
    size.height >= minHeight - VISIBLE_SIZE_TOLERANCE
      && size.height <= maxHeight + VISIBLE_SIZE_TOLERANCE,
    `${role} height ${size.height}`,
  );
}

function assertVisibleWidthRange(
  role: OutfitCanvasRole,
  alpha: { width: number; height: number },
  minWidth: number,
  maxWidth: number,
) {
  const size = visibleSizeFor(role, alpha);
  assert.ok(
    size.width >= minWidth - VISIBLE_SIZE_TOLERANCE
      && size.width <= maxWidth + VISIBLE_SIZE_TOLERANCE,
    `${role} width ${size.width}`,
  );
}

test('service layout_role wins over ambiguous category text', () => {
  assert.equal(classifyOutfitCanvasRole({
    id: 'x', name: '帽巾单品', category: '帽巾', layoutRole: 'scarf',
  }), 'scarf');
});

test('service layout_role controls the final semantic zone despite ambiguous text', () => {
  const layout = buildOutfitCanvasLayout([
    ...baseSeparates,
    { id: 'x', name: '针织帽', category: '帽巾', layoutRole: 'scarf' },
  ]);
  assert.equal(placement(layout, 'x').role, 'scarf');
  assert.equal(placement(layout, 'x').zone, 'neck');
});

test('semantic accessories never enter the foot zone', () => {
  const layout = buildOutfitCanvasLayout([
    { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' },
    { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' },
    { id: 'shoes', name: '乐福鞋', category: '鞋履', layoutRole: 'shoes' },
    { id: 'hat', name: '帽', category: '帽巾', layoutRole: 'hat' },
    { id: 'scarf', name: '围巾', category: '帽巾', layoutRole: 'scarf' },
    { id: 'bag', name: '包', category: '包袋', layoutRole: 'bag' },
  ]);
  assert.equal(placement(layout, 'shoes').zone, 'foot');
  assert.equal(placement(layout, 'hat').zone, 'head');
  assert.equal(placement(layout, 'scarf').zone, 'neck');
  assert.equal(placement(layout, 'bag').zone, 'carry');
  assert.equal(layout.filter((item) => item.zone === 'foot').length, 1);
});

test('every legal 2 through 8 item role set stays complete and centered', () => {
  for (const items of legalRoleFixtures) {
    const layout = buildOutfitCanvasLayout(items);
    assert.deepEqual(new Set(layout.map((x) => x.item.id)), new Set(items.map((x) => x.id)));
    assert.equal(layout.length, items.length);
    const bounds = placementBounds(layout);
    assert.ok(bounds.left >= 2 && bounds.right <= 98);
    assert.ok(bounds.top >= 2 && bounds.bottom <= 98);
    assert.ok(Math.abs(bounds.centerX - 50) <= 1);
    assert.ok(Math.abs(bounds.centerY - 50) <= 1);
  }
});

test('legacy duplicate inferred tops stay visible in core instead of falling into foot', () => {
  const items = [
    { id: 'one', name: 'T恤', category: '上装' },
    { id: 'two', name: '毛衣', category: '上装' },
    { id: 'bottom', name: '长裤', category: '下装' },
    { id: 'shoes', name: '鞋', category: '鞋履' },
  ];
  const layout = buildOutfitCanvasLayout(items);
  assert.equal(layout.length, items.length);
  assert.equal(placement(layout, 'one').zone, 'core');
  assert.equal(placement(layout, 'two').zone, 'core');
  assert.equal(layout.filter((item) => item.zone === 'foot').length, 1);
});

test('separates preserve dressing and footwear gaps', () => {
  const layout = buildOutfitCanvasLayout(baseSeparates);
  const upper = placement(layout, 'base');
  const bottom = placement(layout, 'bottom');
  const shoes = placement(layout, 'shoes');
  assert.ok(bottom.top - (upper.top + upper.height) >= 2);
  assert.ok(bottom.top - (upper.top + upper.height) <= 4);
  assert.ok(shoes.top - (bottom.top + bottom.height) >= 5);
  assert.ok(shoes.top - (bottom.top + bottom.height) <= 8);
});

test('fixture alpha ratios land in approved visible size ranges', () => {
  const alpha = {
    bag: { width: 0.623, height: 0.847 },
    hat: { width: 0.847, height: 0.821 },
    scarf: { width: 0.773, height: 0.847 },
    shoes: { width: 0.701, height: 0.246 },
  } as const;
  assertVisibleRange('bag', alpha.bag, 18, 22, 18, 24);
  assertVisibleRange('hat', alpha.hat, 14, 18, 10, 15);
  assertVisibleRange('scarf', alpha.scarf, 14, 18, 18, 26);
  assertVisibleWidthRange('shoes', alpha.shoes, 20, 25);
});

test('square fixture contain geometry uses the shorter frame edge before image scale', () => {
  for (const role of ['bag', 'hat', 'scarf', 'shoes'] as const) {
    const size = visibleSizeFor(role, { width: 1, height: 1 });
    const frame = placement(buildOutfitCanvasLayout([
      ...baseSeparates,
      ...(role === 'shoes' ? [] : [roleItem(role, role)]),
    ]), role === 'shoes' ? 'shoes' : role);
    assert.equal(size.containedWidth, Math.min(frame.width, frame.height));
    assert.equal(size.containedHeight, Math.min(frame.width, frame.height));
  }
});

test('malformed dress with separates preserves every item and anchors shoes below all core garments', () => {
  const items = [
    roleItem('dress', 'dress'),
    roleItem('base', 'base'),
    roleItem('mid', 'mid'),
    roleItem('bottom', 'bottom'),
    roleItem('shoes', 'shoes'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  assert.equal(layout.length, items.length);
  assert.deepEqual(new Set(layout.map((entry) => entry.item.id)), new Set(items.map((item) => item.id)));
  const separates = ['base', 'mid', 'bottom'].map((id) => placement(layout, id));
  assert.ok(separates.every((entry) => entry.zone === 'core'));
  assert.ok(separates[0].left + separates[0].width <= separates[1].left);
  assert.ok(separates[1].left + separates[1].width <= separates[2].left);
  const shoes = placement(layout, 'shoes');
  const core = layout.filter((entry) => entry.zone === 'core');
  assert.ok(shoes.top >= Math.max(...core.map((entry) => entry.top + entry.height)));
  assert.ok(core.every((entry) => !overlaps(entry, shoes)));
});

test('generic accessories use micro zones and preserve every input exactly once', () => {
  const items = [
    ...baseSeparates,
    roleItem('watch', 'accessory'),
    roleItem('belt', 'accessory'),
    roleItem('jewelry', 'accessory'),
    roleItem('gloves', 'accessory'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  assert.equal(layout.length, items.length);
  assert.equal(new Set(layout.map((entry) => entry.item.id)).size, items.length);
  for (const id of ['watch', 'belt', 'jewelry', 'gloves']) {
    assert.equal(placement(layout, id).zone, 'micro');
  }
});
