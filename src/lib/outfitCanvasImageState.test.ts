import assert from 'node:assert';
import { test } from 'node:test';
import {
  commitOutfitCanvasImageSources,
  markOutfitCanvasImageError,
  outfitCanvasImageAspectFor,
  outfitCanvasImageHasError,
  outfitCanvasImagePresentation,
  outfitCanvasImageRequestIsCurrent,
  outfitCanvasImageSourceKey,
  outfitCanvasImageUsesVisibleGeometry,
  rememberOutfitCanvasImageAspect,
  requestOutfitImageAspect,
  planOutfitCanvasImageRequest,
  settleOutfitCanvasImageRequest,
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

test('a rejected in-flight A1 schedules exactly one restored A3 retry', async () => {
  const sourceA1 = commitOutfitCanvasImageSources({}, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const firstPlan = planOutfitCanvasImageRequest({}, sourceA1, 'item', 'uri:A');
  assert.equal(firstPlan.request?.generation, 1);
  const sourceB2 = commitOutfitCanvasImageSources(sourceA1, [{ itemId: 'item', sourceKey: 'uri:B' }]);
  const sourceA3 = commitOutfitCanvasImageSources(sourceB2, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const restoredPlan = planOutfitCanvasImageRequest(firstPlan.registry, sourceA3, 'item', 'uri:A');
  assert.equal(restoredPlan.request, null);

  await assert.rejects(
    requestOutfitImageAspect('https://image.test/a.png', () => { throw new Error('sync failure'); }),
    /sync failure/,
  );
  const settled = settleOutfitCanvasImageRequest(
    restoredPlan.registry,
    sourceA3,
    firstPlan.request!,
    'failure',
  );
  assert.equal(settled.scheduleRetry, true);
  const retry = planOutfitCanvasImageRequest(settled.registry, sourceA3, 'item', 'uri:A');
  assert.equal(retry.request?.generation, 3);
  assert.equal(planOutfitCanvasImageRequest(retry.registry, sourceA3, 'item', 'uri:A').request, null);
});

test('a stale fulfillment also schedules one restored-source retry', () => {
  const sourceA1 = commitOutfitCanvasImageSources({}, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const firstPlan = planOutfitCanvasImageRequest({}, sourceA1, 'item', 'uri:A');
  const sourceB2 = commitOutfitCanvasImageSources(sourceA1, [{ itemId: 'item', sourceKey: 'uri:B' }]);
  const sourceA3 = commitOutfitCanvasImageSources(sourceB2, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const restoredPlan = planOutfitCanvasImageRequest(firstPlan.registry, sourceA3, 'item', 'uri:A');

  assert.equal(
    settleOutfitCanvasImageRequest(restoredPlan.registry, sourceA3, firstPlan.request!, 'success')
      .scheduleRetry,
    true,
  );
});

test('a current-generation failure is remembered across equivalent plans but a newer generation retries once', () => {
  const sourceA1 = commitOutfitCanvasImageSources({}, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const firstPlan = planOutfitCanvasImageRequest({}, sourceA1, 'item', 'uri:A');
  const failed = settleOutfitCanvasImageRequest(firstPlan.registry, sourceA1, firstPlan.request!, 'failure');
  assert.equal(failed.scheduleRetry, false);

  let repeated = failed.registry;
  for (let index = 0; index < 5; index += 1) {
    const plan = planOutfitCanvasImageRequest(repeated, sourceA1, 'item', 'uri:A');
    assert.equal(plan.request, null);
    assert.strictEqual(plan.registry, repeated);
    repeated = plan.registry;
  }

  const sourceB2 = commitOutfitCanvasImageSources(sourceA1, [{ itemId: 'item', sourceKey: 'uri:B' }]);
  const sourceA3 = commitOutfitCanvasImageSources(sourceB2, [{ itemId: 'item', sourceKey: 'uri:A' }]);
  const retry = planOutfitCanvasImageRequest(repeated, sourceA3, 'item', 'uri:A');
  assert.equal(retry.request?.generation, 3);
  assert.equal(planOutfitCanvasImageRequest(retry.registry, sourceA3, 'item', 'uri:A').request, null);
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
