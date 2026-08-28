import assert from 'node:assert';
import { test } from 'node:test';
import {
  commitOutfitCanvasImageSources,
  markOutfitCanvasImageError,
  outfitCanvasImageAspectFor,
  outfitCanvasImageHasError,
  outfitCanvasImagePresentation,
  outfitCanvasImageRequestIsCurrent,
  outfitCanvasImageRequestIsInFlight,
  outfitCanvasImageRequestKey,
  outfitCanvasImageRequestNeedsRetry,
  outfitCanvasImageSourceKey,
  outfitCanvasImageUsesVisibleGeometry,
  rememberOutfitCanvasImageAspect,
  requestOutfitImageAspect,
  finishOutfitCanvasImageRequest,
  startOutfitCanvasImageRequest,
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

test('aspect cache retains A after an item changes from A to B and back to A', async () => {
  const initial = {};
  const aspectA = await requestOutfitImageAspect('https://image.test/a.png', (_uri, success) => {
    success(600, 1200);
  });
  const aspectB = await requestOutfitImageAspect('https://image.test/b.png', (_uri, success) => {
    success(2000, 1000);
  });
  const withA = rememberOutfitCanvasImageAspect(initial, 'item', 'uri:A', aspectA);
  const withB = rememberOutfitCanvasImageAspect(withA, 'item', 'uri:B', aspectB);

  assert.equal(outfitCanvasImageAspectFor(withB, 'item', 'uri:A'), 0.5);
  assert.equal(outfitCanvasImageAspectFor(withB, 'item', 'uri:B'), 2);
  assert.equal(outfitCanvasImageAspectFor(withB, 'item', 'uri:C'), null);
  assert.deepEqual(initial, {});
});

test('committed source generations reject a stale callback after replacement', () => {
  const sourceA = commitOutfitCanvasImageSources({}, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const generationA = sourceA.item.generation;
  const sourceB = commitOutfitCanvasImageSources(sourceA, [{ itemId: 'item', sourceKey: 'uri:B' }]);

  assert.equal(outfitCanvasImageRequestIsCurrent(sourceB, 'item', 'uri:A', generationA), false);
  assert.equal(
    outfitCanvasImageRequestIsCurrent(sourceB, 'item', 'uri:B', sourceB.item.generation),
    true,
  );
});

test('only a stale request whose source was restored needs another attempt', () => {
  const sourceA = commitOutfitCanvasImageSources({}, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const generationA = sourceA.item.generation;
  const sourceB = commitOutfitCanvasImageSources(sourceA, [{ itemId: 'item', sourceKey: 'uri:B' }]);
  const sourceAAgain = commitOutfitCanvasImageSources(sourceB, [{ itemId: 'item', sourceKey: 'uri:A' }]);

  assert.equal(outfitCanvasImageRequestNeedsRetry(sourceB, 'item', 'uri:A', generationA), false);
  assert.equal(outfitCanvasImageRequestNeedsRetry(sourceAAgain, 'item', 'uri:A', generationA), true);
});

test('request keys are in-flight only and become re-requestable after settlement', () => {
  const requestKey = outfitCanvasImageRequestKey('item', 'uri:A');
  const started = startOutfitCanvasImageRequest(new Set(), requestKey);

  assert.equal(outfitCanvasImageRequestIsInFlight(started, requestKey), true);
  assert.strictEqual(startOutfitCanvasImageRequest(started, requestKey), started);
  const settled = finishOutfitCanvasImageRequest(started, requestKey);
  assert.equal(outfitCanvasImageRequestIsInFlight(settled, requestKey), false);
  assert.notStrictEqual(startOutfitCanvasImageRequest(settled, requestKey), settled);
});

test('source keys distinguish numeric assets, URI objects, arrays, and serializable objects', () => {
  const asset = outfitCanvasImageSourceKey('item', 12);
  const uri = outfitCanvasImageSourceKey('item', { uri: 'https://image.test/a.png' });
  const firstArray = outfitCanvasImageSourceKey('item', [
    { uri: 'https://image.test/a.png' },
    { uri: 'https://image.test/b.png' },
  ]);
  const replacementArray = outfitCanvasImageSourceKey('item', [
    { uri: 'https://image.test/a.png' },
    { uri: 'https://image.test/c.png' },
  ]);
  const object = outfitCanvasImageSourceKey('item', { cache: 'reload', headers: { Accept: 'image/png' } });

  assert.match(asset, /^asset:/);
  assert.match(uri, /^uri:/);
  assert.match(firstArray, /^array:/);
  assert.match(object, /^object:/);
  assert.notEqual(firstArray, replacementArray);
  const errored = markOutfitCanvasImageError({}, 'item', firstArray);
  assert.equal(outfitCanvasImageHasError(errored, 'item', replacementArray), false);
});

test('presentation keeps errored sources in the placeholder and clears it for a replacement', () => {
  const error = markOutfitCanvasImageError({}, 'item', 'uri:old');
  assert.equal(
    outfitCanvasImagePresentation({
      hasSource: true,
      hasError: outfitCanvasImageHasError(error, 'item', 'uri:old'),
      hasCompleteVisibleMetrics: true,
    }),
    'placeholder',
  );
  assert.equal(
    outfitCanvasImagePresentation({
      hasSource: true,
      hasError: outfitCanvasImageHasError(error, 'item', 'uri:new'),
      hasCompleteVisibleMetrics: true,
    }),
    'mapped',
  );
  assert.equal(
    outfitCanvasImagePresentation({
      hasSource: true,
      hasError: false,
      hasCompleteVisibleMetrics: false,
    }),
    'legacy',
  );
});

test('array sources keep the legacy presentation even when callers provide visible metrics', () => {
  assert.equal(
    outfitCanvasImageUsesVisibleGeometry([{ uri: 'https://image.test/a.png' }], true),
    false,
  );
  assert.equal(
    outfitCanvasImageUsesVisibleGeometry({ uri: 'https://image.test/a.png' }, true),
    true,
  );
});
