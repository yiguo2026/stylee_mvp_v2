import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('editorial canvas composes transparent sources without per-item cards', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'StyleeOutfitCanvas.tsx'),
    'utf8',
  );
  assert.match(source, /buildOutfitCanvasLayout\(items\)/);
  assert.match(source, /resizeMode="contain"/);
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
