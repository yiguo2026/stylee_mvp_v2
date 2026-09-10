import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope, type AccountScope, type AccountStamp } from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';

import { runScopedStoreRead } from './scopedStoreRead.ts';
import { createSecondaryStoreReadSlots } from './secondaryStoreReads.ts';

const A = 'account-a' as AccountId;
const B = 'account-b' as AccountId;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function authenticate(scope: AccountScope, accountId: AccountId): AccountStamp {
  assert.equal(scope.replaceAccount(accountId).kind, 'ready');
  const stamp = scope.capture();
  if (stamp === null) throw new Error('expected_authenticated_scope');
  return stamp;
}

test('wishlist mismatch starts no execution and makes no loading change', async () => {
  const scope = createAccountScope();
  authenticate(scope, B);
  const slots = createSecondaryStoreReadSlots();
  let executeCalls = 0;
  const loadingCalls: boolean[] = [];

  const outcome = await runScopedStoreRead({
    scope,
    expectedAccountId: A,
    slot: slots.wishlist,
    execute: async () => {
      executeCalls += 1;
      return [];
    },
    apply: () => undefined,
    onLoadingChange: (loading) => {
      loadingCalls.push(loading);
      return undefined;
    },
  });

  assert.deepEqual(outcome, { kind: 'discarded' });
  assert.equal(executeCalls, 0);
  assert.deepEqual(loadingCalls, []);
});

test('wishlist stale A success cannot replace B items or clear B loading', async () => {
  const scope = createAccountScope();
  const slots = createSecondaryStoreReadSlots();
  const pendingA = deferred<readonly string[]>();
  const pendingB = deferred<readonly string[]>();
  let state = { items: [] as readonly string[], error: null as string | null, loading: false };
  const stampA = authenticate(scope, A);
  const readA = runScopedStoreRead({
    scope,
    stamp: stampA,
    expectedAccountId: A,
    slot: slots.wishlist,
    execute: async () => pendingA.promise,
    apply: (items) => { state = { ...state, items }; return undefined; },
    onError: () => { state = { ...state, error: 'A error' }; return undefined; },
    onLoadingChange: (loading) => { state = { ...state, loading }; return undefined; },
  });

  const stampB = authenticate(scope, B);
  const readB = runScopedStoreRead({
    scope,
    stamp: stampB,
    expectedAccountId: B,
    slot: slots.wishlist,
    execute: async () => pendingB.promise,
    apply: (items) => { state = { ...state, items }; return undefined; },
    onError: () => { state = { ...state, error: 'B error' }; return undefined; },
    onLoadingChange: (loading) => { state = { ...state, loading }; return undefined; },
  });

  pendingB.resolve(['B item']);
  assert.deepEqual(await readB, { kind: 'committed' });
  assert.deepEqual(state, { items: ['B item'], error: null, loading: false });
  pendingA.resolve(['A stale item']);
  assert.deepEqual(await readA, { kind: 'discarded' });
  assert.deepEqual(state, { items: ['B item'], error: null, loading: false });
});

test('wishlist stale A error cannot replace B error or clear B loading', async () => {
  const scope = createAccountScope();
  const slots = createSecondaryStoreReadSlots();
  const pendingA = deferred<readonly string[]>();
  const pendingB = deferred<readonly string[]>();
  let state = { items: [] as readonly string[], error: null as string | null, loading: false };
  const readA = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, A),
    expectedAccountId: A,
    slot: slots.wishlist,
    execute: async () => pendingA.promise,
    apply: () => undefined,
    onError: () => { state = { ...state, error: 'A error' }; return undefined; },
    onLoadingChange: (loading) => { state = { ...state, loading }; return undefined; },
  });
  const readB = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, B),
    expectedAccountId: B,
    slot: slots.wishlist,
    execute: async () => pendingB.promise,
    apply: (items) => { state = { ...state, items }; return undefined; },
    onError: () => { state = { ...state, error: 'B error' }; return undefined; },
    onLoadingChange: (loading) => { state = { ...state, loading }; return undefined; },
  });

  pendingA.reject(new Error('raw private A failure'));
  assert.deepEqual(await readA, { kind: 'discarded' });
  assert.deepEqual(state, { items: [], error: null, loading: true });
  pendingB.resolve(['B item']);
  assert.deepEqual(await readB, { kind: 'committed' });
  assert.deepEqual(state, { items: ['B item'], error: null, loading: false });
});

test('outfit counts commit as one result from one stamped account and stale A cannot replace B', async () => {
  const scope = createAccountScope();
  const slots = createSecondaryStoreReadSlots();
  const pendingA = deferred<Readonly<{ savedCount: number; favoriteCount: number }>>();
  const pendingB = deferred<Readonly<{ savedCount: number; favoriteCount: number }>>();
  const executeAccounts: AccountId[] = [];
  let counts = { savedCount: 0, favoriteCount: 0 };
  const readA = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, A),
    expectedAccountId: A,
    slot: slots.outfitCounts,
    execute: async ({ accountId }) => { executeAccounts.push(accountId); return pendingA.promise; },
    apply: (next) => { counts = next; return undefined; },
  });
  const readB = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, B),
    expectedAccountId: B,
    slot: slots.outfitCounts,
    execute: async ({ accountId }) => { executeAccounts.push(accountId); return pendingB.promise; },
    apply: (next) => { counts = next; return undefined; },
  });

  pendingB.resolve({ savedCount: 4, favoriteCount: 7 });
  assert.deepEqual(await readB, { kind: 'committed' });
  pendingA.resolve({ savedCount: 40, favoriteCount: 70 });
  assert.deepEqual(await readA, { kind: 'discarded' });
  assert.deepEqual(executeAccounts, [A, B]);
  assert.deepEqual(counts, { savedCount: 4, favoriteCount: 7 });
});

test('try-on records and selfie reads remain independently current', async () => {
  const scope = createAccountScope();
  const stamp = authenticate(scope, A);
  const slots = createSecondaryStoreReadSlots();
  const pendingRecords = deferred<readonly string[]>();
  const pendingSelfie = deferred<string | null>();
  let records: readonly string[] = [];
  let selfieUri: string | null = null;
  let loaded = false;
  const recordsRead = runScopedStoreRead({
    scope,
    stamp,
    slot: slots.tryOnRecords,
    execute: async () => pendingRecords.promise,
    apply: (next) => { records = next; return undefined; },
  });
  const selfieRead = runScopedStoreRead({
    scope,
    stamp,
    slot: slots.tryOnSelfie,
    execute: async () => pendingSelfie.promise,
    apply: (next) => { selfieUri = next; loaded = true; return undefined; },
  });

  pendingRecords.resolve(['record-a']);
  pendingSelfie.resolve('selfie-a');
  assert.deepEqual(await recordsRead, { kind: 'committed' });
  assert.deepEqual(await selfieRead, { kind: 'committed' });
  assert.deepEqual({ records, selfieUri, loaded }, {
    records: ['record-a'], selfieUri: 'selfie-a', loaded: true,
  });
});

test('reset cancellation discards both pending try-on results and preserves replacement state', async () => {
  const scope = createAccountScope();
  const stamp = authenticate(scope, A);
  const slots = createSecondaryStoreReadSlots();
  const pendingRecords = deferred<readonly string[]>();
  const pendingSelfie = deferred<string | null>();
  let state = { records: [] as readonly string[], selfieUri: null as string | null, loaded: false };
  const recordsRead = runScopedStoreRead({
    scope,
    stamp,
    slot: slots.tryOnRecords,
    execute: async () => pendingRecords.promise,
    apply: (records) => { state = { ...state, records }; return undefined; },
  });
  const selfieRead = runScopedStoreRead({
    scope,
    stamp,
    slot: slots.tryOnSelfie,
    execute: async () => pendingSelfie.promise,
    apply: (selfieUri) => { state = { ...state, selfieUri, loaded: true }; return undefined; },
  });

  slots.tryOnRecords.cancel();
  slots.tryOnSelfie.cancel();
  state = { records: ['B record'], selfieUri: 'B selfie', loaded: true };
  pendingRecords.resolve(['A stale record']);
  pendingSelfie.resolve(null);

  assert.deepEqual(await recordsRead, { kind: 'discarded' });
  assert.deepEqual(await selfieRead, { kind: 'discarded' });
  assert.deepEqual(state, { records: ['B record'], selfieUri: 'B selfie', loaded: true });
});

test('scope refresh keeps all four read types eligible', async () => {
  const scope = createAccountScope();
  const stamp = authenticate(scope, A);
  const slots = createSecondaryStoreReadSlots();
  const applied: string[] = [];
  const reads = Object.entries(slots).map(([name, slot]) => runScopedStoreRead({
    scope,
    stamp,
    slot,
    execute: async ({ accountId }) => `${name}:${accountId}`,
    apply: (value) => { applied.push(value); return undefined; },
  }));

  assert.equal(scope.refresh(stamp), true);
  assert.deepEqual(await Promise.all(reads), [
    { kind: 'committed' },
    { kind: 'committed' },
    { kind: 'committed' },
    { kind: 'committed' },
  ]);
  assert.deepEqual(applied.sort(), [
    `outfitCounts:${A}`,
    `tryOnRecords:${A}`,
    `tryOnSelfie:${A}`,
    `wishlist:${A}`,
  ]);
});
