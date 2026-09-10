import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PendingPreferenceRecord } from '@stymobile/api-client';

import {
  STYLE_PREFERENCE_PENDING_MAX_BYTES,
  STYLE_PREFERENCE_PENDING_STORAGE_ERROR,
  STYLE_PREFERENCE_PENDING_STORAGE_KEY,
  createWebStylePreferencePendingStore,
} from './stylePreferencePendingStore.ts';

class MemoryStorage {
  readonly values = new Map<string, string>();
  readonly calls: string[] = [];
  fail: 'get' | 'set' | 'remove' | null = null;
  failSetCount = 0;

  getItem(key: string): string | null {
    this.calls.push(`get:${key}`);
    if (this.fail === 'get') throw new Error('raw-get-secret');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.calls.push(`set:${key}:${JSON.parse(value).accountId}`);
    if (this.fail === 'set' || this.failSetCount-- > 0) throw new Error('raw-quota-secret');
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.calls.push(`remove:${key}`);
    if (this.fail === 'remove') throw new Error('raw-remove-secret');
    this.values.delete(key);
  }
}

const record = (accountId: string, operationId = '11111111-1111-4111-8111-111111111111') => ({
  accountId,
  operationId,
  expectedRevision: 3,
  payload: {
    catalogVersion: 'stylee-style-v1' as const,
    status: 'selected' as const,
    selectedTagIds: ['minimalist'],
  },
});

async function fixedFailure(work: () => Promise<unknown>, rawMarker: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => {
    assert.equal(error instanceof Error, true);
    assert.equal((error as Error).message, STYLE_PREFERENCE_PENDING_STORAGE_ERROR);
    assert.equal(String(error).includes(rawMarker), false);
    assert.equal(JSON.stringify(error).includes(rawMarker), false);
    return true;
  });
}

test('round-trips one defensive JSON copy under the exact versioned key', async () => {
  const storage = new MemoryStorage();
  const store = createWebStylePreferencePendingStore(storage);
  const mutable = record('account-a');

  await store.write(mutable);
  mutable.payload.selectedTagIds[0] = 'street';
  const first = await store.read('account-a') as PendingPreferenceRecord;
  assert.deepEqual(first, record('account-a'));
  (first.payload.selectedTagIds as string[])[0] = 'rock';
  assert.deepEqual(await store.read('account-a'), record('account-a'));
  assert.deepEqual([...storage.values.keys()], [STYLE_PREFERENCE_PENDING_STORAGE_KEY]);
  assert.equal(STYLE_PREFERENCE_PENDING_STORAGE_KEY, 'stylee.web.preference.pending.v1');
  assert.equal(STYLE_PREFERENCE_PENDING_MAX_BYTES, 65_536);
});

test('cleans malformed JSON, primitives, invalid owners and over-limit UTF-8 before returning', async () => {
  const storage = new MemoryStorage();
  const store = createWebStylePreferencePendingStore(storage);
  const invalid = [
    '{raw-json-secret',
    '42',
    JSON.stringify({ ...record(' account-secret '), raw: 'payload-secret' }),
    JSON.stringify({ accountId: 'account-secret' }),
    `"${'界'.repeat(Math.ceil(STYLE_PREFERENCE_PENDING_MAX_BYTES / 3) + 1)}"`,
  ];

  for (const raw of invalid) {
    storage.values.set(STYLE_PREFERENCE_PENDING_STORAGE_KEY, raw);
    assert.equal(await store.read('account-b'), null);
    assert.equal(storage.values.has(STYLE_PREFERENCE_PENDING_STORAGE_KEY), false);
  }
  assert.equal(JSON.stringify(storage.calls).includes('raw-json-secret'), false);
  assert.equal(JSON.stringify(storage.calls).includes('payload-secret'), false);
});

test('removes a very large ASCII raw value before constructing TextEncoder', async () => {
  const storage = new MemoryStorage();
  storage.values.set(
    STYLE_PREFERENCE_PENDING_STORAGE_KEY,
    'x'.repeat(STYLE_PREFERENCE_PENDING_MAX_BYTES + 1),
  );
  const original = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder');
  let encoderConstructions = 0;
  class ForbiddenTextEncoder {
    constructor() {
      encoderConstructions += 1;
      throw new Error('raw-text-encoder-secret');
    }
  }
  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: ForbiddenTextEncoder,
  });
  try {
    assert.equal(await createWebStylePreferencePendingStore(storage).read('account-a'), null);
    assert.equal(encoderConstructions, 0);
    assert.equal(storage.values.has(STYLE_PREFERENCE_PENDING_STORAGE_KEY), false);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'TextEncoder');
    else Object.defineProperty(globalThis, 'TextEncoder', original);
  }
});

test('maps account validation and every storage or JSON failure to one fixed adapter error', async () => {
  for (const accountId of ['', ' account-a', 'account-a ']) {
    await fixedFailure(
      () => createWebStylePreferencePendingStore(new MemoryStorage()).read(accountId),
      accountId === '' ? 'raw-empty-account-secret' : accountId,
    );
  }

  for (const method of ['get', 'set', 'remove'] as const) {
    const storage = new MemoryStorage();
    const store = createWebStylePreferencePendingStore(storage);
    if (method === 'remove') storage.values.set(STYLE_PREFERENCE_PENDING_STORAGE_KEY, JSON.stringify(record('account-a')));
    storage.fail = method;
    const action = method === 'set'
      ? () => store.write(record('account-a'))
      : method === 'remove' ? () => store.remove('account-a') : () => store.read('account-a');
    await fixedFailure(action, `raw-${method === 'set' ? 'quota' : method}-secret`);
  }

  const circular = record('account-a') as unknown as Record<string, unknown>;
  circular.circular = circular;
  await fixedFailure(
    () => createWebStylePreferencePendingStore(new MemoryStorage()).write(circular as unknown as PendingPreferenceRecord),
    'circular',
  );

  const oversized = record('account-a');
  oversized.payload.selectedTagIds[0] = '界'.repeat(STYLE_PREFERENCE_PENDING_MAX_BYTES);
  await fixedFailure(
    () => createWebStylePreferencePendingStore(new MemoryStorage()).write(oversized),
    oversized.payload.selectedTagIds[0].slice(0, 20),
  );
});

test('wrong-owner read deletes A and never returns it to B', async () => {
  const storage = new MemoryStorage();
  const store = createWebStylePreferencePendingStore(storage);
  await store.write(record('account-a'));
  storage.calls.length = 0;

  assert.equal(await store.read('account-b'), null);
  assert.deepEqual(storage.calls, [
    `get:${STYLE_PREFERENCE_PENDING_STORAGE_KEY}`,
    `remove:${STYLE_PREFERENCE_PENDING_STORAGE_KEY}`,
  ]);
  assert.equal(storage.values.size, 0);
});

test('stale remove(A) preserves a valid B descriptor written first', async () => {
  const storage = new MemoryStorage();
  const store = createWebStylePreferencePendingStore(storage);
  await store.write(record('account-b', '22222222-2222-4222-8222-222222222222'));
  storage.calls.length = 0;

  await store.remove('account-a');
  assert.deepEqual(await store.read('account-b'), record('account-b', '22222222-2222-4222-8222-222222222222'));
  assert.equal(storage.calls.includes(`remove:${STYLE_PREFERENCE_PENDING_STORAGE_KEY}`), false);
});

test('globally serializes delayed A write, B write and stale A cleanup in call order', async () => {
  const storage = new MemoryStorage();
  const first = createWebStylePreferencePendingStore(storage);
  const second = createWebStylePreferencePendingStore(storage);
  const a = record('account-a');
  const b = record('account-b', '22222222-2222-4222-8222-222222222222');

  const operations = [first.write(a), second.write(b), first.remove('account-a')];
  await Promise.all(operations);

  assert.deepEqual(storage.calls, [
    `set:${STYLE_PREFERENCE_PENDING_STORAGE_KEY}:account-a`,
    `set:${STYLE_PREFERENCE_PENDING_STORAGE_KEY}:account-b`,
    `get:${STYLE_PREFERENCE_PENDING_STORAGE_KEY}`,
  ]);
  assert.deepEqual(await second.read('account-b'), b);
});

test('multiple instances recover the shared queue after an earlier operation rejects', async () => {
  const storage = new MemoryStorage();
  const first = createWebStylePreferencePendingStore(storage);
  const second = createWebStylePreferencePendingStore(storage);
  storage.failSetCount = 1;
  const failed = first.write(record('account-a'));
  const succeeded = second.write(record('account-b'));
  const outcomes = await Promise.allSettled([failed, succeeded]);

  assert.equal(outcomes[0].status, 'rejected');
  assert.equal(outcomes[1].status, 'fulfilled');
  assert.deepEqual(await first.read('account-b'), record('account-b'));
});

test('default browser storage is resolved lazily and unavailable storage never falls back to memory', async () => {
  const originalWindow = globalThis.window;
  try {
    Reflect.deleteProperty(globalThis, 'window');
    const store = createWebStylePreferencePendingStore();
    await fixedFailure(() => store.read('account-a'), 'account-a');
    await fixedFailure(() => store.write(record('account-a')), 'account-a');
  } finally {
    if (originalWindow !== undefined) globalThis.window = originalWindow;
  }
});
