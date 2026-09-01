import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WARDROBE_IMPORT_CONFLICT_TARGET,
  wardrobePersistenceMethod,
} from './wardrobePersistencePolicy.ts';

test('only durable batch import keys select idempotent upsert persistence', () => {
  assert.equal(wardrobePersistenceMethod({}), 'insert');
  assert.equal(wardrobePersistenceMethod({ import_key: '' }), 'insert');
  assert.equal(wardrobePersistenceMethod({ import_key: 'import_1:0' }), 'upsert');
  assert.equal(WARDROBE_IMPORT_CONFLICT_TARGET, 'user_id,import_key');
});

test('wardrobe persistence and migration share the same durable conflict key', () => {
  const libDirectory = dirname(fileURLToPath(import.meta.url));
  const store = readFileSync(resolve(libDirectory, '../stores/wardrobeStore.ts'), 'utf8');
  const migration = readFileSync(resolve(
    libDirectory,
    '../../supabase/migrations/20260901170000_wardrobe_import_idempotency.sql',
  ), 'utf8');

  assert.match(store, /wardrobeTable\.upsert\s*\(/);
  assert.match(store, /onConflict: WARDROBE_IMPORT_CONFLICT_TARGET/);
  assert.match(migration, /UNIQUE \(user_id, import_key\)/);
});
