import { test } from 'node:test';
import assert from 'node:assert';
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
