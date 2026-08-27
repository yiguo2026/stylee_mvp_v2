import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOutfitCanvasLayout,
  classifyOutfitCanvasRole,
  fitAndCenterPlacements,
  garmentImageOffsetY,
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

const CANVAS_ASPECT_RATIO = 0.8;
const MIN_CANVAS_HEIGHT = 360;

function renderedBounds(
  layout: OutfitCanvasPlacement[],
  loadedAspectRatios: Readonly<Record<string, number>> = {},
) {
  const rects = layout.map((entry) => {
    const frameLeft = entry.left;
    const frameTop = entry.top / CANVAS_ASPECT_RATIO;
    const frameWidth = entry.width;
    const frameHeight = entry.height / CANVAS_ASPECT_RATIO;
    const frameCenterX = frameLeft + frameWidth / 2;
    const frameCenterY = frameTop + frameHeight / 2;
    const hasImage = Boolean(entry.item.imageUri || entry.item.imageSource);
    const declaredSourceAspect = (
      entry.item as OutfitCanvasLayoutItem & { imageAspectRatio?: number | null }
    ).imageAspectRatio;
    const loadedSourceAspect = loadedAspectRatios[entry.item.id];
    const sourceAspect = typeof loadedSourceAspect === 'number'
      ? loadedSourceAspect
      : declaredSourceAspect;
    const hasKnownSourceAspect = typeof sourceAspect === 'number'
      && Number.isFinite(sourceAspect)
      && sourceAspect > 0;
    let containedWidth = frameWidth;
    let containedHeight = frameHeight;
    if (hasKnownSourceAspect) {
      const frameAspect = frameWidth / frameHeight;
      containedWidth = sourceAspect > frameAspect
        ? frameWidth
        : frameHeight * sourceAspect;
      containedHeight = sourceAspect > frameAspect
        ? frameWidth / sourceAspect
        : frameHeight;
    }
    const renderedWidth = hasImage
      ? containedWidth * garmentImageScale(entry.role)
      : frameWidth;
    const renderedHeight = hasImage
      ? containedHeight * garmentImageScale(entry.role)
      : frameHeight;
    const imageOffset = hasImage
      ? (garmentImageOffsetY(entry.role) / MIN_CANVAS_HEIGHT * 100) / CANVAS_ASPECT_RATIO
      : 0;
    const radians = entry.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const imageCenterX = frameCenterX;
    const imageCenterY = frameCenterY + imageOffset;
    const corners = [
      [-renderedWidth / 2, -renderedHeight / 2],
      [renderedWidth / 2, -renderedHeight / 2],
      [renderedWidth / 2, renderedHeight / 2],
      [-renderedWidth / 2, renderedHeight / 2],
    ].map(([offsetX, offsetY]) => {
      const x = imageCenterX + offsetX;
      const y = imageCenterY + offsetY;
      const relativeX = x - frameCenterX;
      const relativeY = y - frameCenterY;
      return {
        x: frameCenterX + relativeX * cosine - relativeY * sine,
        y: frameCenterY + relativeX * sine + relativeY * cosine,
      };
    });
    return {
      left: Math.min(...corners.map((corner) => corner.x)),
      right: Math.max(...corners.map((corner) => corner.x)),
      top: Math.min(...corners.map((corner) => corner.y)) * CANVAS_ASPECT_RATIO,
      bottom: Math.max(...corners.map((corner) => corner.y)) * CANVAS_ASPECT_RATIO,
    };
  });
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function assertInsideSafeInset(bounds: ReturnType<typeof renderedBounds>) {
  assert.ok(bounds.left >= 2 - 1e-6, `left ${bounds.left}`);
  assert.ok(bounds.right <= 98 + 1e-6, `right ${bounds.right}`);
  assert.ok(bounds.top >= 2 - 1e-6, `top ${bounds.top}`);
  assert.ok(bounds.bottom <= 98 + 1e-6, `bottom ${bounds.bottom}`);
}

function assertSafeAndCentered(bounds: ReturnType<typeof renderedBounds>) {
  assertInsideSafeInset(bounds);
  assert.ok(Math.abs(bounds.centerX - 50) <= 1e-6, `centerX ${bounds.centerX}`);
  assert.ok(Math.abs(bounds.centerY - 50) <= 1e-6, `centerY ${bounds.centerY}`);
}

function assertPairwiseNonOverlapping(entries: OutfitCanvasPlacement[]) {
  entries.forEach((entry, index) => {
    for (const other of entries.slice(index + 1)) {
      assert.equal(overlaps(entry, other), false, `${entry.item.id} overlaps ${other.item.id}`);
    }
  });
}

function visibleSizeTolerance(role: OutfitCanvasRole) {
  return role === 'bag' ? 0.5 : 0;
}

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
    imageUri: `${role}.png`,
  } satisfies OutfitCanvasLayoutItem;
  const core = [
    { id: 'base', name: 'T恤', category: '上装', layoutRole: 'base' as const, imageUri: 'base.png' },
    { id: 'bottom', name: '长裤', category: '下装', layoutRole: 'bottom' as const, imageUri: 'bottom.png' },
    { id: 'core-shoes', name: '鞋', category: '鞋履', layoutRole: 'shoes' as const, imageUri: 'shoes.png' },
  ];
  const items = role === 'shoes' ? core : [...core, accessory];
  const targetId = role === 'shoes' ? 'core-shoes' : role;
  const entry = placement(buildOutfitCanvasLayout(items), targetId);
  const frameHeightInCanvasWidth = entry.height / CANVAS_ASPECT_RATIO;
  const frameAspectRatio = entry.width / frameHeightInCanvasWidth;
  const containedWidth = sourceAspectRatio > frameAspectRatio
    ? entry.width
    : frameHeightInCanvasWidth * sourceAspectRatio;
  const containedHeight = sourceAspectRatio > frameAspectRatio
    ? entry.width / sourceAspectRatio
    : frameHeightInCanvasWidth;
  return {
    frameWidth: entry.width,
    frameHeightInCanvasWidth,
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
  const tolerance = visibleSizeTolerance(role);
  assert.ok(
    size.width >= minWidth - tolerance && size.width <= maxWidth + tolerance,
    `${role} width ${size.width}`,
  );
  assert.ok(
    size.height >= minHeight - tolerance && size.height <= maxHeight + tolerance,
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
  const tolerance = visibleSizeTolerance(role);
  assert.ok(
    size.width >= minWidth - tolerance && size.width <= maxWidth + tolerance,
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

test('square fixture contain geometry models the production canvas aspect ratio', () => {
  for (const role of ['bag', 'hat', 'scarf', 'shoes'] as const) {
    const size = visibleSizeFor(role, { width: 1, height: 1 });
    const containedSide = Math.min(size.frameWidth, size.frameHeightInCanvasWidth);
    assert.equal(size.containedWidth, containedSide);
    assert.equal(size.containedHeight, containedSide);
  }
});

test('only backpack visible-size assertions receive the 0.5 point tolerance', () => {
  assert.equal(visibleSizeTolerance('bag'), 0.5);
  for (const role of ['hat', 'scarf', 'shoes', 'accessory'] as const) {
    assert.equal(visibleSizeTolerance(role), 0);
  }
  const backpack = visibleSizeFor('bag', { width: 0.623, height: 0.847 });
  assert.ok(backpack.width < 18 && backpack.width >= 17.5);
});

test('opaque square outerwear rendered with contain stays inside the safe inset', () => {
  const opaqueOuter = {
    ...roleItem('opaque-outer', 'outer'),
    imageUri: 'opaque-square.png',
    imageAspectRatio: 1,
  } satisfies OutfitCanvasLayoutItem;
  const layout = buildOutfitCanvasLayout([
    opaqueOuter,
    ...baseSeparates,
  ]);

  assertSafeAndCentered(renderedBounds(layout));
});

test('unknown image ratios conservatively fit portrait garment and wide shoe envelopes', () => {
  const items = [
    {
      ...roleItem('portrait-base', 'base'),
      imageUri: 'portrait-base.png',
    },
    roleItem('portrait-bottom', 'bottom'),
    {
      ...roleItem('unknown-wide-shoe', 'shoes'),
      imageUri: 'unknown-wide-shoe.png',
    },
  ];

  const layout = buildOutfitCanvasLayout(items);

  assert.equal(layout.length, items.length);
  assertSafeAndCentered(renderedBounds(layout));
  assertInsideSafeInset(renderedBounds(layout, {
    'portrait-base': 0.5,
    'unknown-wide-shoe': 2.8,
  }));
});

test('loaded portrait and wide image ratios preserve gaps, safety, and center', () => {
  const items = [
    {
      ...roleItem('loaded-portrait-base', 'base'),
      imageUri: 'loaded-portrait-base.png',
      imageAspectRatio: 0.5,
    },
    roleItem('loaded-bottom', 'bottom'),
    {
      ...roleItem('loaded-wide-shoe', 'shoes'),
      imageUri: 'loaded-wide-shoe.png',
      imageAspectRatio: 2.8,
    },
  ];

  const layout = buildOutfitCanvasLayout(items);
  const upper = placement(layout, 'loaded-portrait-base');
  const bottom = placement(layout, 'loaded-bottom');
  const shoes = placement(layout, 'loaded-wide-shoe');

  assert.deepEqual(
    new Set(layout.map((entry) => entry.item.id)),
    new Set(items.map((item) => item.id)),
  );
  assert.ok(bottom.top - (upper.top + upper.height) >= 2);
  assert.ok(bottom.top - (upper.top + upper.height) <= 4);
  assert.ok(shoes.top - (bottom.top + bottom.height) >= 5);
  assert.ok(shoes.top - (bottom.top + bottom.height) <= 8);
  assertSafeAndCentered(renderedBounds(layout));
});

test('fit accounts for known source aspect, rotation, and shoe image offset', () => {
  const wideShoe = {
    ...roleItem('wide-shoe', 'shoes'),
    imageUri: 'wide-shoe.png',
    imageAspectRatio: 2.4,
  } as OutfitCanvasLayoutItem & { imageAspectRatio: number };
  const fitted = fitAndCenterPlacements([{
    item: wideShoe,
    role: 'shoes',
    zone: 'foot',
    left: 68,
    top: 82,
    width: 29,
    height: 18,
    rotation: -14,
    zIndex: 9,
  }]);

  assertSafeAndCentered(renderedBounds(fitted));
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
  const fallbackRow = ['dress', 'base', 'mid', 'bottom'].map((id) => placement(layout, id));
  assert.ok(fallbackRow.every((entry) => entry.zone === 'core'));
  assert.equal(new Set(fallbackRow.map((entry) => entry.top)).size, 1);
  assert.equal(new Set(fallbackRow.map((entry) => entry.height)).size, 1);
  for (let index = 1; index < fallbackRow.length; index += 1) {
    assert.ok(fallbackRow[index - 1].left + fallbackRow[index - 1].width <= fallbackRow[index].left);
  }
  const shoes = placement(layout, 'shoes');
  const core = layout.filter((entry) => entry.zone === 'core');
  assert.ok(shoes.top >= Math.max(...core.map((entry) => entry.top + entry.height)));
  assert.ok(core.every((entry) => !overlaps(entry, shoes)));
});

test('three scarves use distinct non-overlapping neck placements', () => {
  const items = [
    ...baseSeparates,
    roleItem('scarf-one', 'scarf'),
    roleItem('scarf-two', 'scarf'),
    roleItem('scarf-three', 'scarf'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  const scarves = ['scarf-one', 'scarf-two', 'scarf-three']
    .map((id) => placement(layout, id));

  assert.ok(scarves.every((entry) => entry.zone === 'neck'));
  assertPairwiseNonOverlapping(scarves);
});

test('five generic accessories use distinct micro placements and preserve every input once', () => {
  const items = [
    ...baseSeparates,
    roleItem('watch', 'accessory'),
    roleItem('belt', 'accessory'),
    roleItem('jewelry', 'accessory'),
    roleItem('gloves', 'accessory'),
    roleItem('brooch', 'accessory'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  assert.equal(layout.length, items.length);
  assert.equal(new Set(layout.map((entry) => entry.item.id)).size, items.length);
  const accessories = ['watch', 'belt', 'jewelry', 'gloves', 'brooch']
    .map((id) => placement(layout, id));
  assert.ok(accessories.every((entry) => entry.zone === 'micro'));
  assertPairwiseNonOverlapping(accessories);
});

test('mixed semantic accessory roles share one non-overlapping occupancy map', () => {
  const items = [
    dress,
    shoesRole,
    roleItem('mixed-hat', 'hat'),
    roleItem('mixed-scarf', 'scarf'),
    roleItem('mixed-bag', 'bag'),
    roleItem('mixed-watch', 'accessory'),
    roleItem('mixed-brooch', 'accessory'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  const accessories = [
    placement(layout, 'mixed-hat'),
    placement(layout, 'mixed-scarf'),
    placement(layout, 'mixed-bag'),
    placement(layout, 'mixed-watch'),
    placement(layout, 'mixed-brooch'),
  ];

  assert.deepEqual(
    accessories.map((entry) => entry.zone),
    ['head', 'neck', 'carry', 'micro', 'micro'],
  );
  assertPairwiseNonOverlapping(accessories);
});

test('candidate exhaustion reflows scarf and five generic accessories without reusing rectangles', () => {
  const items = [
    dress,
    shoesRole,
    roleItem('rich-scarf', 'scarf'),
    roleItem('rich-watch', 'accessory'),
    roleItem('rich-belt', 'accessory'),
    roleItem('rich-jewelry', 'accessory'),
    roleItem('rich-gloves', 'accessory'),
    roleItem('rich-brooch', 'accessory'),
  ];
  const layout = buildOutfitCanvasLayout(items);

  assert.equal(layout.length, 8);
  assert.deepEqual(
    new Set(layout.map((entry) => entry.item.id)),
    new Set(items.map((item) => item.id)),
  );
  assert.equal(layout.filter((entry) => entry.zone === 'foot').length, 1);
  assert.equal(placement(layout, 'shoes').zone, 'foot');
  assert.equal(placement(layout, 'rich-scarf').zone, 'neck');
  const genericAccessories = [
    'rich-watch',
    'rich-belt',
    'rich-jewelry',
    'rich-gloves',
    'rich-brooch',
  ].map((id) => placement(layout, id));
  assert.ok(genericAccessories.every((entry) => entry.zone === 'micro'));
  assertPairwiseNonOverlapping([
    placement(layout, 'rich-scarf'),
    ...genericAccessories,
  ]);
});
