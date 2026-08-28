import assert from 'node:assert';
import { test } from 'node:test';
import {
  markOutfitCanvasImageError,
  outfitCanvasImageHasError,
  requestOutfitImageAspect,
} from './outfitCanvasImageState.ts';

test('remote size adapter resolves an aspect ratio through its callback', async () => {
  const ratio = await requestOutfitImageAspect('https://image.test/a.png', (uri, success) => {
    assert.equal(uri, 'https://image.test/a.png');
    success(600, 1200);
  });

  assert.equal(ratio, 0.5);
});

test('remote size adapter rejects invalid dimensions', async () => {
  await assert.rejects(
    requestOutfitImageAspect('https://image.test/a.png', (_uri, success) => success(0, 1200)),
    /invalid image dimensions/,
  );
});

test('remote size adapter forwards the loader failure callback', async () => {
  const failure = new Error('image unavailable');
  await assert.rejects(
    requestOutfitImageAspect('https://image.test/a.png', (_uri, _success, reject) => reject?.(failure)),
    failure,
  );
});

test('image errors are immutable and scoped to their source key', () => {
  const initial = {};
  const state = markOutfitCanvasImageError(initial, 'item', 'old.png');

  assert.notStrictEqual(state, initial);
  assert.deepEqual(state.item, { sourceKey: 'old.png', status: 'error' });
  assert.equal(outfitCanvasImageHasError(state, 'item', 'old.png'), true);
  assert.equal(outfitCanvasImageHasError(state, 'item', 'new.png'), false);
  assert.strictEqual(markOutfitCanvasImageError(state, 'item', 'old.png'), state);
  assert.deepEqual(initial, {});
});
