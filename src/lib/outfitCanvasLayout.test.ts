import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOutfitCanvasLayout,
  classifyOutfitCanvasRole,
  fitAndCenterPlacements,
  garmentImageOffsetY,
  garmentImageScale,
  placementBounds,
  sourceImageGeometryForVisiblePlacement,
  visibleContentAspect,
  type OutfitCanvasLayoutItem,
  type OutfitCanvasPlacement,
  type OutfitCanvasRole,
} from './outfitCanvasLayout.ts';
import {
  presetOutfitImageMetrics,
  type OutfitVisibleBounds,
} from './outfitImageMetrics.ts';

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

const metricItem = (
  id: string,
  role: OutfitCanvasRole,
  sourceAspectRatio: number,
  visibleBounds: OutfitVisibleBounds,
): OutfitCanvasLayoutItem => ({
  id,
  name: id,
  category: role,
  layoutRole: role,
  imageUri: `${id}.png`,
  imageAspectRatio: sourceAspectRatio,
  visibleBounds,
});

const shirt = metricItem('shirt', 'base', 1, {
  left: 0.0747, top: 0.0885, width: 0.8506, height: 0.8242,
});
const trousers = metricItem('trousers', 'bottom', 1, {
  left: 0.3353, top: 0.0757, width: 0.3299, height: 0.8505,
});
const shorts = metricItem('shorts', 'bottom', 1, {
  left: 0.3111, top: 0.0764, width: 0.3757, height: 0.8466,
});
const skirt = metricItem('skirt', 'bottom', 1, {
  left: 0.1763, top: 0.0783, width: 0.6473, height: 0.8458,
});
const shoesWithMetrics = metricItem('shoes-with-metrics', 'shoes', 1, {
  left: 0.2243, top: 0.3181, width: 0.7009, height: 0.2459,
});
const outerWithMetrics = metricItem('outer-with-metrics', 'outer', 1, {
  left: 0.1411, top: 0.0743, width: 0.7153, height: 0.8502,
});

function presetMetricItem(id: string, role: OutfitCanvasRole, imageUri: string) {
  const metrics = presetOutfitImageMetrics(imageUri);
  assert.ok(metrics?.sourceAspectRatio && metrics.visibleBounds, `missing metrics for ${imageUri}`);
  return metricItem(id, role, metrics.sourceAspectRatio, metrics.visibleBounds);
}

function assertVisibleSeparateGeometry(
  upper: OutfitCanvasPlacement,
  lower: OutfitCanvasPlacement,
  shoes: OutfitCanvasPlacement,
) {
  const dressingGap = lower.top - (upper.top + upper.height);
  const footGap = shoes.top - (lower.top + lower.height);
  assert.ok(dressingGap >= 2 && dressingGap <= 4, `${dressingGap}`);
  assert.ok(footGap >= 5 && footGap <= 8, `${footGap}`);
  assert.ok(upper.width / lower.width < 2, `${upper.width / lower.width}`);
  assert.ok(lower.height > upper.height, `${lower.height} <= ${upper.height}`);
}

const CANVAS_ASPECT_RATIO = 0.8;
const MIN_CANVAS_HEIGHT = 360;

function renderedRectFor(
  entry: OutfitCanvasPlacement,
  loadedAspectRatio?: number,
) {
  const frameLeft = entry.left;
  const frameTop = entry.top / CANVAS_ASPECT_RATIO;
  const frameWidth = entry.width;
  const frameHeight = entry.height / CANVAS_ASPECT_RATIO;
  const frameCenterX = frameLeft + frameWidth / 2;
  const frameCenterY = frameTop + frameHeight / 2;
  const sourceAspect = loadedAspectRatio ?? entry.item.imageAspectRatio;
  const bounds = entry.item.visibleBounds;
  const hasValidBounds = Boolean(
    bounds
    && Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height)
    && bounds.left >= 0
    && bounds.top >= 0
    && bounds.width > 0
    && bounds.height > 0
    && bounds.left + bounds.width <= 1
    && bounds.top + bounds.height <= 1,
  );
  const hasVisibleSubject = hasValidBounds
    && typeof sourceAspect === 'number'
    && Number.isFinite(sourceAspect)
    && sourceAspect > 0;
  const hasImage = Boolean(entry.item.imageUri || entry.item.imageSource);
  const hasKnownSourceAspect = typeof sourceAspect === 'number'
    && Number.isFinite(sourceAspect)
    && sourceAspect > 0;

  let renderedWidth = frameWidth;
  let renderedHeight = frameHeight;
  let imageOffset = 0;
  if (hasImage && !hasVisibleSubject) {
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
    renderedWidth = containedWidth * garmentImageScale(entry.role);
    renderedHeight = containedHeight * garmentImageScale(entry.role);
    imageOffset = (garmentImageOffsetY(entry.role) / MIN_CANVAS_HEIGHT * 100)
      / CANVAS_ASPECT_RATIO;
  }

  const radians = entry.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const imageCenterY = frameCenterY + imageOffset;
  const corners = [
    [-renderedWidth / 2, -renderedHeight / 2],
    [renderedWidth / 2, -renderedHeight / 2],
    [renderedWidth / 2, renderedHeight / 2],
    [-renderedWidth / 2, renderedHeight / 2],
  ].map(([offsetX, offsetY]) => {
    const x = frameCenterX + offsetX;
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
}

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

function visibleSizeTolerance(role: OutfitCanvasRole) {
  return role === 'bag' ? 0.5 : 0;
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
    const bounds = renderedBounds(layout);
    assertInsideSafeInset(bounds);
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

test('visible shirt and trousers use role envelopes and preserve a real gap', () => {
  const layout = buildOutfitCanvasLayout([shirt, trousers, shoesWithMetrics]);
  assertVisibleSeparateGeometry(
    placement(layout, 'shirt'),
    placement(layout, 'trousers'),
    placement(layout, 'shoes-with-metrics'),
  );
});

test('visible shorts preserve the separate garment gaps', () => {
  const layout = buildOutfitCanvasLayout([shirt, shorts, shoesWithMetrics]);
  assertVisibleSeparateGeometry(
    placement(layout, 'shirt'),
    placement(layout, 'shorts'),
    placement(layout, 'shoes-with-metrics'),
  );
});

test('visible skirt preserves the separate garment gaps', () => {
  const layout = buildOutfitCanvasLayout([shirt, skirt, shoesWithMetrics]);
  assertVisibleSeparateGeometry(
    placement(layout, 'shirt'),
    placement(layout, 'skirt'),
    placement(layout, 'shoes-with-metrics'),
  );
});

test('visible outer layer leaves the lower garment and shoes separated', () => {
  const layout = buildOutfitCanvasLayout([
    outerWithMetrics,
    shirt,
    trousers,
    shoesWithMetrics,
  ]);
  const lower = placement(layout, 'trousers');
  const shoes = placement(layout, 'shoes-with-metrics');
  const footGap = renderedRectFor(shoes).top - renderedRectFor(lower).bottom;
  assert.ok(footGap >= 5 && footGap <= 8, `${footGap}`);
  assert.equal(placement(layout, 'outer-with-metrics').role, 'outer');
  assert.equal(lower.role, 'bottom');
});

test('visible metric legal 2 through 6 item fixtures remain complete and centered', () => {
  const metricFixtures = [
    [metricItem('dress-2', 'dress', 1, { left: 0.1, top: 0.05, width: 0.8, height: 0.9 }), shoesWithMetrics],
    [shirt, trousers, shoesWithMetrics],
    [outerWithMetrics, shirt, trousers, shoesWithMetrics],
    [outerWithMetrics, shirt, trousers, shoesWithMetrics, metricItem('scarf-5', 'scarf', 1, { left: 0.15, top: 0.05, width: 0.7, height: 0.85 })],
    [outerWithMetrics, shirt, trousers, shoesWithMetrics, metricItem('bag-6', 'bag', 1, { left: 0.12, top: 0.08, width: 0.76, height: 0.84 }), metricItem('hat-6', 'hat', 1, { left: 0.08, top: 0.1, width: 0.84, height: 0.8 })],
  ];

  for (const items of metricFixtures) {
    const layout = buildOutfitCanvasLayout(items);
    assert.equal(layout.length, items.length);
    assert.deepEqual(new Set(layout.map((entry) => entry.item.id)), new Set(items.map((item) => item.id)));
    const rects = layout.map((entry) => renderedRectFor(entry));
    const bounds = {
      left: Math.min(...rects.map((entry) => entry.left)),
      right: Math.max(...rects.map((entry) => entry.right)),
      top: Math.min(...rects.map((entry) => entry.top)),
      bottom: Math.max(...rects.map((entry) => entry.bottom)),
      centerX: (Math.min(...rects.map((entry) => entry.left)) + Math.max(...rects.map((entry) => entry.right))) / 2,
      centerY: (Math.min(...rects.map((entry) => entry.top)) + Math.max(...rects.map((entry) => entry.bottom))) / 2,
    };
    assertInsideSafeInset(bounds);
    assert.ok(Math.abs(bounds.centerX - 50) <= 1, `${bounds.centerX}`);
    assert.ok(Math.abs(bounds.centerY - 50) <= 1, `${items.length}: ${bounds.centerY}`);
  }
});

test('visible placement source geometry maps the subject bounds instead of scaling it twice', () => {
  const knownPlacement = placement(buildOutfitCanvasLayout([shirt, trousers, shoesWithMetrics]), 'shirt');
  const geometry = sourceImageGeometryForVisiblePlacement(knownPlacement);
  assert.ok(Math.abs(geometry.left - (-0.0747 / 0.8506 * 100)) < 1e-9);
  assert.ok(Math.abs(geometry.top - (-0.0885 / 0.8242 * 100)) < 1e-9);
  assert.ok(Math.abs(geometry.width - (100 / 0.8506)) < 1e-9);
  assert.ok(Math.abs(geometry.height - (100 / 0.8242)) < 1e-9);
  assert.equal(knownPlacement.width <= 44, true);

  const unknownPlacement = placement(buildOutfitCanvasLayout([
    { ...roleItem('unknown', 'base'), imageUri: 'unknown.png' },
    roleItem('unknown-bottom', 'bottom'),
  ]), 'unknown');
  assert.deepEqual(sourceImageGeometryForVisiblePlacement(unknownPlacement), {
    left: 0, top: 0, width: 100, height: 100,
  });
});

test('visible content aspect requires both source aspect and visible bounds', () => {
  assert.ok(Math.abs((visibleContentAspect(shirt) ?? 0) - (0.8506 / 0.8242)) < 1e-6);
  assert.equal(visibleContentAspect({ ...shirt, visibleBounds: undefined }), 1);
  assert.equal(visibleContentAspect({ ...shirt, imageAspectRatio: undefined }), null);
});

test('visible placements preserve square, non-square, and off-center physical aspects', () => {
  const visibleSubjects = [
    metricItem('square-visible', 'base', 1, { left: 0, top: 0, width: 1, height: 1 }),
    metricItem('wide-visible', 'base', 2, { left: 0, top: 0, width: 1, height: 1 }),
    metricItem('off-center-visible', 'base', 1.5, { left: 0.2, top: 0.1, width: 0.6, height: 0.8 }),
  ];

  for (const subject of visibleSubjects) {
    const entry = placement(buildOutfitCanvasLayout([subject, trousers, shoesWithMetrics]), subject.id);
    const renderedPhysicalAspect = entry.width * CANVAS_ASPECT_RATIO / entry.height;
    assert.ok(
      Math.abs(renderedPhysicalAspect - (visibleContentAspect(subject) ?? 0)) < 1e-6,
      `${subject.id}: ${renderedPhysicalAspect}`,
    );
  }
});

test('invalid metric bounds and aspects always use conservative full-frame geometry', () => {
  const invalidBounds = [
    { left: 0.2, top: 0.2, width: 0, height: 0.5 },
    { left: 0.2, top: 0.2, width: -0.1, height: 0.5 },
    { left: Number.NaN, top: 0.2, width: 0.5, height: 0.5 },
    { left: 0.2, top: Number.POSITIVE_INFINITY, width: 0.5, height: 0.5 },
    { left: 0.7, top: 0.2, width: 0.5, height: 0.5 },
    { left: 0.2, top: 0.7, width: 0.5, height: 0.5 },
    { left: 0.2, top: 0.2, width: undefined, height: 0.5 },
  ] as unknown as OutfitVisibleBounds[];
  const invalidAspects = [0, -1, Number.NaN, Number.POSITIVE_INFINITY];

  for (const [index, visibleBounds] of invalidBounds.entries()) {
    const item = metricItem(`invalid-bounds-${index}`, 'base', 1, visibleBounds);
    const entry = placement(buildOutfitCanvasLayout([item, trousers]), item.id);
    assert.equal(visibleContentAspect(item), null);
    assert.deepEqual(sourceImageGeometryForVisiblePlacement(entry), {
      left: 0, top: 0, width: 100, height: 100,
    });
    assert.ok([entry.left, entry.top, entry.width, entry.height].every(Number.isFinite));
  }

  for (const [index, imageAspectRatio] of invalidAspects.entries()) {
    const item = metricItem(`invalid-aspect-${index}`, 'base', imageAspectRatio, shirt.visibleBounds!);
    const entry = placement(buildOutfitCanvasLayout([item, trousers]), item.id);
    assert.equal(visibleContentAspect(item), null);
    assert.deepEqual(sourceImageGeometryForVisiblePlacement(entry), {
      left: 0, top: 0, width: 100, height: 100,
    });
    assert.ok([entry.left, entry.top, entry.width, entry.height].every(Number.isFinite));
  }
});

test('duplicate base and duplicate mid layers leave a gap below the lowest rendered upper', () => {
  for (const role of ['base', 'mid'] as const) {
    const first = metricItem(`${role}-one`, role, 1, shirt.visibleBounds!);
    const second = metricItem(`${role}-two`, role, 1, shirt.visibleBounds!);
    const layout = buildOutfitCanvasLayout([first, second, trousers, shoesWithMetrics]);
    const uppers = [first.id, second.id].map((id) => renderedRectFor(placement(layout, id)));
    const lower = renderedRectFor(placement(layout, 'trousers'));
    const gap = lower.top - Math.max(...uppers.map((entry) => entry.bottom));
    assert.ok(gap >= 2 && gap <= 4, `${role}: ${gap}`);
  }
});

test('fully metric-backed legal six-item composition preserves final rendered gaps', () => {
  const items = [
    presetMetricItem('trench', 'outer', '/preset-items/khaki-trench.png'),
    presetMetricItem('shirt-6', 'base', '/preset-items/black-tshirt.png'),
    presetMetricItem('trousers-6', 'bottom', '/preset-items/black-trousers.png'),
    presetMetricItem('loafers-6', 'shoes', '/preset-items/womens-loafers.png'),
    presetMetricItem('scarf-6', 'scarf', '/preset-items/beige-scarf.png'),
    presetMetricItem('backpack-6', 'bag', '/preset-items/black-backpack.png'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  const upper = renderedRectFor(placement(layout, 'shirt-6')).bottom;
  const lower = renderedRectFor(placement(layout, 'trousers-6'));
  const shoes = renderedRectFor(placement(layout, 'loafers-6'));
  assert.ok(lower.top - upper >= 2 && lower.top - upper <= 4, `${lower.top - upper}`);
  assert.ok(shoes.top - lower.bottom >= 5 && shoes.top - lower.bottom <= 8, `${shoes.top - lower.bottom}`);
});

test('legacy accessory and shoe fixtures retain approved final visible ranges', () => {
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

test('metric preset accessories and shoes fit the approved final visible ranges', () => {
  const items = [
    presetMetricItem('metric-shirt', 'base', '/preset-items/black-tshirt.png'),
    presetMetricItem('metric-trousers', 'bottom', '/preset-items/black-trousers.png'),
    presetMetricItem('metric-shoes', 'shoes', '/preset-items/womens-loafers.png'),
    presetMetricItem('metric-bag', 'bag', '/preset-items/black-backpack.png'),
    presetMetricItem('metric-scarf', 'scarf', '/preset-items/beige-scarf.png'),
  ];
  const layout = buildOutfitCanvasLayout(items);
  const range = (id: string, minWidth: number, maxWidth: number, minHeight: number, maxHeight: number) => {
    const entry = placement(layout, id);
    const width = entry.width;
    const height = entry.height / CANVAS_ASPECT_RATIO;
    assert.ok(width >= minWidth && width <= maxWidth, `${id} width ${width}`);
    assert.ok(height >= minHeight && height <= maxHeight, `${id} height ${height}`);
  };
  range('metric-bag', 17.5, 22.5, 18, 24);
  range('metric-scarf', 14, 18, 18, 26);
  const shoeWidth = placement(layout, 'metric-shoes').width;
  assert.ok(shoeWidth >= 20 && shoeWidth <= 25, `${shoeWidth}`);
});

test('square fixture contain geometry models the production canvas aspect ratio', () => {
  for (const role of ['bag', 'hat', 'scarf', 'shoes'] as const) {
    const size = visibleSizeFor(role, { width: 1, height: 1 });
    const containedSide = Math.min(size.frameWidth, size.frameHeightInCanvasWidth);
    assert.equal(size.containedWidth, containedSide);
    assert.equal(size.containedHeight, containedSide);
  }
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
  assert.deepEqual(
    new Set(layout.map((entry) => entry.item.id)),
    new Set(items.map((item) => item.id)),
  );
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
