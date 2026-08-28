import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rememberOutfitCanvasImageAspect,
  sourceImageGeometryForVisiblePlacement,
} from '../lib/outfitCanvasLayout.ts';

test('editorial canvas composes transparent sources without per-item cards', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /buildOutfitCanvasLayout\(layoutItems\)/);
  assert.match(source, /garmentImageScale\(entry\.role\)/);
  assert.match(source, /garmentImageOffsetY\(entry\.role\)/);
  assert.match(source, /resizeMode="stretch"/);
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
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /hitSlop=\{ds\.space\[2\]\}/);
  assert.match(source, /onPress=\{\(\) => onItemPress\?\.\(preparedItem\?\.originalItem \?\? entry\.item\)\}/);
});

test('canvas resolves remote image dimensions and uses source-keyed error fallback', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /Image\.getSize/);
  assert.match(source, /requestOutfitImageAspect/);
  assert.match(source, /onError=\{\(\) =>/);
  assert.match(source, /markOutfitCanvasImageError/);
  assert.match(source, /outfitCanvasImageHasError/);
  assert.match(source, /sourceImageGeometryForVisiblePlacement/);
  assert.match(source, /outfitCanvasImagePresentation/);
  assert.match(source, /resizeMode="stretch"/);
  assert.match(source, /resizeMode="contain"/);
  assert.match(source, /<View style=\{styles\.placeholder\}>/);
  assert.doesNotMatch(source, /Image\.resolveAssetSource/);
  assert.doesNotMatch(source, /nativeEvent\.source/);
  assert.match(source, /buildOutfitCanvasLayout\(layoutItems\)/);
  assert.match(source, /rememberOutfitCanvasImageAspect/);
});

test('mapped images have a dedicated clip wrapper while legacy images retain their overflow-visible footprint', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /<View style=\{styles\.mappedImageClip\}>/);
  assert.match(source, /mappedImageClip:\s*\{[\s\S]*?overflow: 'hidden'/);
  const garmentStyle = source.match(/garment:\s*\{([\s\S]*?)\n  \},\n  image:/)?.[1] ?? '';
  assert.doesNotMatch(garmentStyle, /overflow:/);
  assert.match(source, /presentation === 'legacy'/);
  assert.match(source, /top: imageOffsetY/);
  assert.match(source, /garmentImageScale\(entry\.role\)/);
});

test('source geometry has a conservative full-frame fallback for legacy image rendering', () => {
  assert.deepEqual(
    sourceImageGeometryForVisiblePlacement({
      item: { id: 'legacy', name: 'Legacy', category: '上装' },
      role: 'base',
      zone: 'core',
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      rotation: 0,
      zIndex: 1,
    }),
    { left: 0, top: 0, width: 100, height: 100 },
  );
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
