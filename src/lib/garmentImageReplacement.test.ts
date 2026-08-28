import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  beginReplacementAfterInitialWrite,
  buildFinalReplacementImageUpdate,
  buildInitialReplacementImageUpdate,
} from './garmentImageReplacement.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const oldAttrs = {
  category: '上装',
  manual_fields: ['color'],
  visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
};

test('initial replacement update atomically changes source and clears predecessor bounds', () => {
  assert.deepEqual(
    buildInitialReplacementImageUpdate('file:///replacement.jpg', oldAttrs),
    {
      image_url: 'file:///replacement.jpg',
      ai_recognized_attrs: {
        category: '上装',
        manual_fields: ['color'],
      },
    },
  );
});

test('replacement background starts only after the initial write settles', async () => {
  const initial = deferred<void>();
  const events: string[] = [];
  const flow = beginReplacementAfterInitialWrite({
    writeInitial: async () => {
      events.push('initial');
      await initial.promise;
      events.push('initial-settled');
    },
    isCurrent: () => true,
    startBackground: () => { events.push('background'); },
  });

  await Promise.resolve();
  assert.deepEqual(events, ['initial']);
  initial.resolve();
  assert.equal(await flow, 'started');
  assert.deepEqual(events, ['initial', 'initial-settled', 'background']);
});

test('failed or unmounted initial replacement never starts background work', async () => {
  const failed: string[] = [];
  assert.equal(await beginReplacementAfterInitialWrite({
    writeInitial: async () => { throw new Error('write failed'); },
    isCurrent: () => true,
    startBackground: () => { failed.push('background'); },
  }), 'failed');
  assert.deepEqual(failed, []);

  const unmounted: string[] = [];
  assert.equal(await beginReplacementAfterInitialWrite({
    writeInitial: async () => {},
    isCurrent: () => false,
    startBackground: () => { unmounted.push('background'); },
  }), 'stale');
  assert.deepEqual(unmounted, []);
});

test('final replacement metadata merges with the latest unrelated attrs', () => {
  assert.deepEqual(
    buildFinalReplacementImageUpdate(
      'https://storage.test/replacement.png',
      {
        ...oldAttrs,
        manual_fields: ['color', 'material'],
        editor_note: 'latest value',
      },
      {
        standardization_ok: true,
        visible_bounds: { left: 0, top: 0.1, width: 1, height: 0.8 },
      },
    ),
    {
      image_url: 'https://storage.test/replacement.png',
      ai_recognized_attrs: {
        category: '上装',
        manual_fields: ['color', 'material'],
        editor_note: 'latest value',
        standardization_ok: true,
        visible_bounds: { left: 0, top: 0.1, width: 1, height: 0.8 },
      },
    },
  );
});

test('replacement hook delegates ordered writes and final attrs to the current item ref', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(testDirectory, '../hooks/useGarmentImageReplace.ts'), 'utf8');

  assert.match(source, /await beginReplacementAfterInitialWrite\s*\(/);
  assert.match(source, /buildInitialReplacementImageUpdate\s*\(/);
  assert.match(source, /buildFinalReplacementImageUpdate\s*\(/);
  assert.match(source, /currentItemRef\.current\?\.ai_recognized_attrs/);
});
