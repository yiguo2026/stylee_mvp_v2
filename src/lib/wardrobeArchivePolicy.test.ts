import assert from 'node:assert';
import { test } from 'node:test';
import { buildWardrobeArchiveUpdate } from './wardrobeArchivePolicy.ts';

test('removing an item from the wardrobe persists an archive update', () => {
  assert.deepEqual(
    buildWardrobeArchiveUpdate('2026-09-01T00:00:00.000Z'),
    {
      status: 'archived',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
  );
});
