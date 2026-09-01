import assert from 'node:assert';
import { test } from 'node:test';
import type { WardrobeItem } from '@/types';
import {
  applyWardrobeOptimisticUpdate,
  rollbackWardrobeOptimisticUpdate,
  type WardrobeOptimisticState,
} from './wardrobeOptimisticUpdate.ts';

const item: WardrobeItem = {
  item_id: 'item-1',
  user_id: 'user-1',
  name: '旧名称',
  category: '上装',
  color: '白色',
  image_url: 'https://storage.test/old.png',
  source_type: 'album_ai',
  status: 'active',
  ai_recognized_attrs: {
    manual_fields: ['color'],
    visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  },
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

const initialState = (): WardrobeOptimisticState => ({
  items: [structuredClone(item)],
  pendingEdits: {},
  mutationGenerations: {},
});

test('failed replacement restores touched item fields and removes new pending fields', () => {
  const applied = applyWardrobeOptimisticUpdate(
    initialState(),
    item.item_id,
    {
      image_url: 'file:///replacement.jpg',
      ai_recognized_attrs: { manual_fields: ['color'] },
    },
    '2026-08-31T01:00:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    applied.state,
    applied.transaction,
  );

  assert.deepEqual(rolledBack.items, [item]);
  assert.deepEqual(rolledBack.pendingEdits, {});
});

test('rollback restores pre-existing pending values instead of dropping them', () => {
  const state = initialState();
  state.pendingEdits[item.item_id] = { name: '待提交名称', image_url: item.image_url };
  const applied = applyWardrobeOptimisticUpdate(
    state,
    item.item_id,
    { image_url: 'file:///replacement.jpg' },
    '2026-08-31T01:00:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    applied.state,
    applied.transaction,
  );

  assert.equal(rolledBack.pendingEdits[item.item_id]?.name, '待提交名称');
  assert.equal(rolledBack.pendingEdits[item.item_id]?.image_url, item.image_url);
});

test('stale failure preserves a newer same-field replacement', () => {
  const first = applyWardrobeOptimisticUpdate(
    initialState(), item.item_id, { image_url: 'file:///first.jpg' },
    '2026-08-31T01:00:00.000Z',
  );
  const second = applyWardrobeOptimisticUpdate(
    first.state, item.item_id, { image_url: 'file:///second.jpg' },
    '2026-08-31T01:01:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    second.state,
    first.transaction,
  );

  assert.equal(rolledBack.items[0].image_url, 'file:///second.jpg');
  assert.equal(rolledBack.pendingEdits[item.item_id]?.image_url, 'file:///second.jpg');
});

test('rollback restores failed image fields while preserving an unrelated newer edit', () => {
  const replacement = applyWardrobeOptimisticUpdate(
    initialState(), item.item_id, { image_url: 'file:///replacement.jpg' },
    '2026-08-31T01:00:00.000Z',
  );
  const renamed = applyWardrobeOptimisticUpdate(
    replacement.state, item.item_id, { name: '新名称' },
    '2026-08-31T01:01:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    renamed.state,
    replacement.transaction,
  );

  assert.equal(rolledBack.items[0].image_url, item.image_url);
  assert.equal(rolledBack.items[0].name, '新名称');
  assert.equal(rolledBack.pendingEdits[item.item_id]?.name, '新名称');
});

test('rollbackable persistence restores optimistic fields after rejection', async () => {
  const optimisticModule = await import('./wardrobeOptimisticUpdate.ts');
  const runRollbackableWardrobeUpdate = optimisticModule.runRollbackableWardrobeUpdate;
  assert.equal(typeof runRollbackableWardrobeUpdate, 'function');

  let state = initialState();
  const result = await runRollbackableWardrobeUpdate({
    getState: () => state,
    setState: (next) => { state = next; },
    itemId: item.item_id,
    updates: { image_url: 'file:///replacement.jpg' },
    updatedAt: '2026-08-31T01:00:00.000Z',
    persist: async () => { throw new Error('offline'); },
  });

  assert.equal(result.ok, false);
  assert.equal(state.items[0].image_url, item.image_url);
  assert.deepEqual(state.pendingEdits, {});
});

test('rollbackable persistence retains optimistic fields after success', async () => {
  const optimisticModule = await import('./wardrobeOptimisticUpdate.ts');
  const runRollbackableWardrobeUpdate = optimisticModule.runRollbackableWardrobeUpdate;
  assert.equal(typeof runRollbackableWardrobeUpdate, 'function');

  let state = initialState();
  const result = await runRollbackableWardrobeUpdate({
    getState: () => state,
    setState: (next) => { state = next; },
    itemId: item.item_id,
    updates: { image_url: 'file:///replacement.jpg' },
    updatedAt: '2026-08-31T01:00:00.000Z',
    persist: async (payload) => {
      assert.equal(payload.image_url, 'file:///replacement.jpg');
      assert.equal(payload.updated_at, '2026-08-31T01:00:00.000Z');
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.items[0].image_url, 'file:///replacement.jpg');
  assert.equal(state.pendingEdits[item.item_id]?.image_url, 'file:///replacement.jpg');
});
