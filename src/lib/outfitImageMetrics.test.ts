import assert from 'node:assert';
import { test } from 'node:test';
import {
  mergeReplacementImageAttrs,
  parseOutfitVisibleBounds,
  visibleBoundsFromAttrs,
  presetOutfitImageMetrics,
  outfitImageMetricsForWardrobeItem,
} from './outfitImageMetrics.ts';

test('accepts normalized visible bounds', () => {
  assert.deepEqual(parseOutfitVisibleBounds({
    left: 0.1, top: 0.2, width: 0.5, height: 0.6,
  }), { left: 0.1, top: 0.2, width: 0.5, height: 0.6 });
});

test('rejects malformed visible bounds without partial output', () => {
  for (const value of [
    null,
    { left: 0, top: 0, width: 0, height: 1 },
    { left: 0.8, top: 0, width: 0.3, height: 1 },
    { left: Number.NaN, top: 0, width: 1, height: 1 },
  ]) assert.equal(parseOutfitVisibleBounds(value), undefined);
});

test('reads bounds from existing JSON metadata only', () => {
  assert.deepEqual(visibleBoundsFromAttrs({
    visible_bounds: { left: 0, top: 0.1, width: 1, height: 0.8 },
  }), { left: 0, top: 0.1, width: 1, height: 0.8 });
  assert.equal(visibleBoundsFromAttrs(undefined), undefined);
});

test('replacement fallback removes bounds belonging to the previous image', () => {
  const attrs = mergeReplacementImageAttrs(
    {
      category: '上装',
      visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
    },
    { standardization_ok: false, standardization: 'fallback_original' },
  );

  assert.deepEqual(attrs, {
    category: '上装',
    standardization_ok: false,
    standardization: 'fallback_original',
  });
  assert.equal('visible_bounds' in attrs, false);
});

test('replacement keeps only its own valid visible bounds', () => {
  const validReplacement = mergeReplacementImageAttrs(
    { visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 } },
    {
      standardization_ok: true,
      visible_bounds: { left: 0, top: 0.1, width: 1, height: 0.8 },
    },
  );
  assert.deepEqual(validReplacement.visible_bounds, { left: 0, top: 0.1, width: 1, height: 0.8 });

  const invalidReplacement = mergeReplacementImageAttrs(
    { visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 } },
    {
      standardization_ok: true,
      visible_bounds: { left: 0.9, top: 0, width: 0.2, height: 1 },
    },
  );
  assert.equal('visible_bounds' in invalidReplacement, false);
});

test('resolves generated preset bounds from absolute and base-prefixed URLs', () => {
  const direct = presetOutfitImageMetrics('/preset-items/black-tshirt.png');
  const preview = presetOutfitImageMetrics('/preview/outfit-19/preset-items/black-tshirt.png');
  assert.ok(direct?.visibleBounds);
  assert.deepEqual(preview, direct);
  assert.ok(Math.abs((direct?.visibleBounds.width ?? 0) - 0.851) <= 0.01);
});

test('does not guess metrics for arbitrary remote images', () => {
  assert.equal(presetOutfitImageMetrics('https://storage.example/user.png'), undefined);
  assert.equal(presetOutfitImageMetrics('https://storage.example/preset-items/black-tshirt.png'), undefined);
  assert.equal(
    presetOutfitImageMetrics('https://storage.example/user.png?next=/preset-items/black-tshirt.png'),
    undefined,
  );
  assert.equal(presetOutfitImageMetrics('//storage.example/preset-items/black-tshirt.png'), undefined);
});

test('persisted bounds override preset metrics while preset aspect fills missing values', () => {
  const metrics = outfitImageMetricsForWardrobeItem({
    image_url: '/preset-items/black-tshirt.png',
    ai_recognized_attrs: {
      visible_bounds: { left: 0.1, top: 0.1, width: 0.8, height: 0.8 },
    },
  });
  assert.deepEqual(metrics?.visibleBounds, { left: 0.1, top: 0.1, width: 0.8, height: 0.8 });
  assert.equal(metrics?.sourceAspectRatio, 1);
});

test('invalid persisted bounds do not suppress valid preset metrics', () => {
  const metrics = outfitImageMetricsForWardrobeItem({
    image_url: '/preset-items/black-tshirt.png',
    ai_recognized_attrs: {
      visible_bounds: { left: 0.9, top: 0, width: 0.2, height: 1 },
    },
  });
  assert.deepEqual(metrics, presetOutfitImageMetrics('/preset-items/black-tshirt.png'));
});

test('keeps valid persisted bounds without guessing an aspect for remote items', () => {
  const metrics = outfitImageMetricsForWardrobeItem({
    image_url: 'https://storage.example/user.png',
    ai_recognized_attrs: {
      visible_bounds: { left: 0.1, top: 0.1, width: 0.8, height: 0.8 },
    },
  });
  assert.deepEqual(metrics, {
    sourceAspectRatio: undefined,
    visibleBounds: { left: 0.1, top: 0.1, width: 0.8, height: 0.8 },
  });
});
