import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  beginReplacementAfterInitialWrite,
  buildFinalReplacementImageUpdate,
  buildInitialReplacementImageUpdate,
  imageUriAfterInitialReplacementWrite,
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

test('an explicit false initial write rolls display back and never starts background work', async () => {
  const background: string[] = [];
  const result = await beginReplacementAfterInitialWrite({
    writeInitial: () => false,
    isCurrent: () => true,
    startBackground: () => { background.push('background'); },
  });

  assert.equal(result, 'failed');
  assert.deepEqual(background, []);
  assert.equal(
    imageUriAfterInitialReplacementWrite(
      'https://storage.test/committed.jpg',
      'file:///replacement.jpg',
      result,
    ),
    'https://storage.test/committed.jpg',
  );
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
  const refDeclaration = source.indexOf('const currentItemRef = useRef(item);');
  const refEffect = source.indexOf('useEffect(() => { currentItemRef.current = item; }, [item]);');
  assert.ok(refDeclaration >= 0 && refEffect > refDeclaration);
  assert.doesNotMatch(source.slice(refDeclaration, refEffect), /currentItemRef\.current\s*=/);
});

test('final success effects run only after the durable write succeeds', async () => {
  const replacementModule = await import('./garmentImageReplacement.ts');
  const finishReplacementAfterFinalWrite = replacementModule.finishReplacementAfterFinalWrite;
  assert.equal(typeof finishReplacementAfterFinalWrite, 'function');

  const write = deferred<boolean>();
  const events: string[] = [];
  const flow = finishReplacementAfterFinalWrite({
    writeFinal: async () => {
      events.push('write');
      const result = await write.promise;
      events.push('write-settled');
      return result;
    },
    isCurrent: () => true,
    commitSuccess: () => { events.push('success'); },
    reportFailure: () => { events.push('failure'); },
  });

  await Promise.resolve();
  assert.deepEqual(events, ['write']);
  write.resolve(true);
  assert.equal(await flow, 'committed');
  assert.deepEqual(events, ['write', 'write-settled', 'success']);
});

test('failed or stale final writes route only the matching outcome callback', async () => {
  const replacementModule = await import('./garmentImageReplacement.ts');
  const finishReplacementAfterFinalWrite = replacementModule.finishReplacementAfterFinalWrite;
  assert.equal(typeof finishReplacementAfterFinalWrite, 'function');

  const failed: string[] = [];
  assert.equal(await finishReplacementAfterFinalWrite({
    writeFinal: async () => false,
    isCurrent: () => true,
    commitSuccess: () => { failed.push('success'); },
    reportFailure: () => { failed.push('failure'); },
  }), 'failed');
  assert.deepEqual(failed, ['failure']);

  assert.equal(await finishReplacementAfterFinalWrite({
    writeFinal: async () => { throw new Error('write failed'); },
    isCurrent: () => true,
    commitSuccess: () => { failed.push('thrown-success'); },
    reportFailure: () => { failed.push('thrown-failure'); },
  }), 'failed');
  assert.deepEqual(failed, ['failure', 'thrown-failure']);

  const stale: string[] = [];
  assert.equal(await finishReplacementAfterFinalWrite({
    writeFinal: async () => true,
    isCurrent: () => false,
    commitSuccess: () => { stale.push('success'); },
    reportFailure: () => { stale.push('failure'); },
  }), 'stale');
  assert.deepEqual(stale, []);
});
