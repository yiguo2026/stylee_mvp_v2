import assert from 'node:assert';
import { test } from 'node:test';
import {
  parseOutfitVisibleBounds,
  visibleBoundsFromAttrs,
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
