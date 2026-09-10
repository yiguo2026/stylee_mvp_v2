import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope, type AccountScope, type AccountStamp } from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';

import { createLatestReadSlot } from './scopedStoreRead.ts';
import { runScopedWardrobeFetch } from './wardrobeScopedRead.ts';

const A = 'account-a' as AccountId;
const B = 'account-b' as AccountId;

type Item = Readonly<{
  item_id: string;
  name: string;
  created_at: string;
  wear_count?: number;
  favorite_count?: number;
}>;

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

test('stale A success never reads B overlays or changes B items, loading, error, or diagnostics', async () => {
  const scope = createAccountScope();
  const stampA = authenticate(scope, A);
  const pendingA = deferred<Readonly<{
    rawItems: readonly Item[];
    stats: Readonly<Record<string, Readonly<{ wear: number; favorite: number }>>> | null;
  }>>();
  let overlayReads = 0;
  let applyCalls = 0;
  let errorCalls = 0;
  let statsFailureCalls = 0;
  const loadingCalls: boolean[] = [];
  let state = {
    items: [{ item_id: 'item-a', name: 'A initial', created_at: '2026-01-01' }] as Item[],
    loading: false,
    error: null as string | null,
  };

  const readA = runScopedWardrobeFetch<Item>({
    scope,
    stamp: stampA,
    expectedAccountId: A,
    slot: createLatestReadSlot(),
    execute: async ({ accountId }) => {
      assert.equal(accountId, A);
      return pendingA.promise;
    },
    readCurrentOverlays: () => {
      overlayReads += 1;
      return {
        pendingEdits: { 'item-a': { name: 'B private overlay' } },
        deletedIds: [],
      };
    },
    applyItems: (items) => {
      applyCalls += 1;
      state.items = items;
      return undefined;
    },
    onStatsFailure: () => {
      statsFailureCalls += 1;
      return undefined;
    },
    onError: () => {
      errorCalls += 1;
      state.error = 'A error';
      return undefined;
    },
    onLoadingChange: (loading) => {
      loadingCalls.push(loading);
      state.loading = loading;
      return undefined;
    },
  });

  assert.deepEqual(loadingCalls, [true]);
  authenticate(scope, B);
  const bItems = [{ item_id: 'item-b', name: 'B current', created_at: '2026-02-01' }] as Item[];
  state = { items: bItems, loading: true, error: 'B current error' };
  pendingA.resolve({
    rawItems: [{ item_id: 'item-a', name: 'A server', created_at: '2026-03-01' }],
    stats: null,
  });

  assert.deepEqual(await readA, { kind: 'discarded' });
  assert.equal(overlayReads, 0);
  assert.equal(applyCalls, 0);
  assert.equal(errorCalls, 0);
  assert.equal(statsFailureCalls, 0);
  assert.deepEqual(loadingCalls, [true]);
  assert.deepEqual(state, { items: bItems, loading: true, error: 'B current error' });
});

test('stale A failure never invokes the error handler or loading finally over B', async () => {
  const scope = createAccountScope();
  const stampA = authenticate(scope, A);
  const pendingA = deferred<never>();
  let overlayReads = 0;
  let errorCalls = 0;
  const loadingCalls: boolean[] = [];
  let state = { loading: false, error: null as string | null };

  const readA = runScopedWardrobeFetch<Item>({
    scope,
    stamp: stampA,
    expectedAccountId: A,
    slot: createLatestReadSlot(),
    execute: async () => pendingA.promise,
    readCurrentOverlays: () => {
      overlayReads += 1;
      return { pendingEdits: {}, deletedIds: [] };
    },
    applyItems: () => undefined,
    onError: () => {
      errorCalls += 1;
      state.error = 'A error';
      return undefined;
    },
    onLoadingChange: (loading) => {
      loadingCalls.push(loading);
      state.loading = loading;
      return undefined;
    },
  });

  authenticate(scope, B);
  state = { loading: true, error: 'B current error' };
  pendingA.reject(new Error('raw A private failure'));

  assert.deepEqual(await readA, { kind: 'discarded' });
  assert.equal(overlayReads, 0);
  assert.equal(errorCalls, 0);
  assert.deepEqual(loadingCalls, [true]);
  assert.deepEqual(state, { loading: true, error: 'B current error' });
});

test('eligible read consumes edits made while execute is awaiting', async () => {
  const scope = createAccountScope();
  const stamp = authenticate(scope, A);
  const pending = deferred<Readonly<{
    rawItems: readonly Item[];
    stats: Readonly<Record<string, Readonly<{ wear: number; favorite: number }>>> | null;
  }>>();
  let currentEdits: Readonly<Record<string, Partial<Item>>> = {
    'item-shared': { name: 'A old overlay' },
  };
  let overlayReads = 0;
  let items: Item[] = [];
  const loadingCalls: boolean[] = [];

  const read = runScopedWardrobeFetch({
    scope,
    stamp,
    expectedAccountId: A,
    slot: createLatestReadSlot(),
    execute: async () => pending.promise,
    readCurrentOverlays: () => {
      overlayReads += 1;
      return { pendingEdits: currentEdits, deletedIds: [] };
    },
    applyItems: (next) => {
      items = next;
      return undefined;
    },
    onLoadingChange: (loading) => {
      loadingCalls.push(loading);
      return undefined;
    },
  });

  assert.equal(overlayReads, 0);
  currentEdits = { 'item-shared': { name: 'B edit made while awaiting' } };
  pending.resolve({
    rawItems: [{ item_id: 'item-shared', name: 'A server', created_at: '2026-01-01' }],
    stats: { 'item-shared': { wear: 4, favorite: 2 } },
  });

  assert.deepEqual(await read, { kind: 'committed' });
  assert.equal(overlayReads, 1);
  assert.deepEqual(items, [{
    item_id: 'item-shared',
    name: 'B edit made while awaiting',
    created_at: '2026-01-01',
    wear_count: 4,
    favorite_count: 2,
  }]);
  assert.deepEqual(loadingCalls, [true, false]);
});
