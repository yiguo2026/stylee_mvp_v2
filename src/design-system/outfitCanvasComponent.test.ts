import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rememberOutfitCanvasImageAspect } from '../lib/outfitCanvasLayout.ts';

test('editorial canvas composes transparent sources without per-item cards', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /buildOutfitCanvasLayout\(layoutItems\)/);
  assert.match(source, /garmentImageScale\(entry\.role\)/);
  assert.match(source, /garmentImageOffsetY\(entry\.role\)/);
  assert.match(source, /resizeMode="contain"/);
  assert.doesNotMatch(source, /\.filter\(/);
  assert.doesNotMatch(source, /accessory-band/);
  assert.doesNotMatch(source, /StyleeGarmentMedia/);
  assert.match(source, /ds\.color\.semantic\.surface\.input/);
});

test('each visible garment remains accessible and has an enlarged touch target', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /accessibilityLabel=\{entry\.item\.name\}/);
  assert.match(source, /hitSlop=\{ds\.space\[2\]\}/);
});

test('canvas resolves local and loaded image dimensions before rebuilding layout', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /Image\.resolveAssetSource/);
  assert.match(source, /onLoad=\{/);
  assert.match(source, /buildOutfitCanvasLayout\(layoutItems\)/);
  assert.match(source, /rememberOutfitCanvasImageAspect/);
});

test('repeated loaded dimensions reuse the same aspect registry object', () => {
  const initial = {};
  const portrait = rememberOutfitCanvasImageAspect(
    initial, 'garment', 'portrait.png', 600, 1200,
  );
  assert.notStrictEqual(portrait, initial);
  assert.deepEqual(portrait.garment, {
    sourceKey: 'portrait.png',
    aspectRatio: 0.5,
  });
  assert.strictEqual(
    rememberOutfitCanvasImageAspect(portrait, 'garment', 'portrait.png', 600, 1200),
    portrait,
  );
  assert.strictEqual(
    rememberOutfitCanvasImageAspect(portrait, 'garment', 'portrait.png', 0, 1200),
    portrait,
  );
  assert.deepEqual(
    rememberOutfitCanvasImageAspect(portrait, 'garment', 'wide.png', 2800, 1000).garment,
    {
      sourceKey: 'wide.png',
      aspectRatio: 2.8,
    },
  );
});
