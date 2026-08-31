import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garmentMediaBackgroundByTone } from './garmentMediaTone.ts';
import { ds } from './tokens.ts';

test('tones map only to semantic tokens', () => {
  assert.deepEqual(garmentMediaBackgroundByTone, {
    neutral: ds.color.semantic.surface.card,
    owned: ds.color.semantic.surface.input,
    recommended: ds.color.semantic.status.attentionSubtle,
    inverse: ds.color.semantic.surface.inverse,
  });
});

test('released cards keep geometry outside the shared garment media root', () => {
  const designSystemDir = dirname(fileURLToPath(import.meta.url));
  const wardrobeCard = readFileSync(
    resolve(designSystemDir, 'StyleeWardrobeCard.tsx'),
    'utf8',
  );
  const outfitItemCard = readFileSync(
    resolve(designSystemDir, 'StyleeOutfitItemCard.tsx'),
    'utf8',
  );
  const wardrobeMediaTag = wardrobeCard.match(/<StyleeGarmentMedia[\s\S]*?>/)?.[0] ?? '';
  const outfitMediaTag = outfitItemCard.match(/<StyleeGarmentMedia[\s\S]*?>/)?.[0] ?? '';

  assert.match(
    wardrobeCard,
    /<View style=\{styles\.media\}>[\s\S]*?<StyleeGarmentMedia/,
  );
  assert.match(
    outfitItemCard,
    /<View\s+style=\{\[\s*styles\.media,\s*error && styles\.mediaError,\s*\]\}\s*>[\s\S]*?<StyleeGarmentMedia/,
  );
  assert.doesNotMatch(wardrobeMediaTag, /\bstyle=/);
  assert.doesNotMatch(outfitMediaTag, /\bstyle=/);
  assert.match(wardrobeMediaTag, /tone="owned"/);
});

test('wardrobe detail media uses the same owned-item background', () => {
  const designSystemDir = dirname(fileURLToPath(import.meta.url));
  const wardrobeDetail = readFileSync(
    resolve(designSystemDir, '../app/wardrobe/[id].tsx'),
    'utf8',
  );
  const heroMediaTags = wardrobeDetail.match(/<HeroMedia[\s\S]*?>/g) ?? [];
  assert.match(wardrobeDetail, /<StyleeGarmentMedia[^>]+tone=\{tone\}/);
  assert.ok(heroMediaTags.some(tag => /tone="owned"/.test(tag)));
  assert.ok(heroMediaTags.some(tag => /tone="recommended"/.test(tag)));
  assert.equal(heroMediaTags.some(tag => /tone="neutral"/.test(tag)), false);
});
