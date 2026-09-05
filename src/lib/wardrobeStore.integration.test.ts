import assert from 'node:assert';
import { test } from 'node:test';

import type { AccountId } from '@stymobile/contracts';
import type { WardrobeItem } from '../types/index.ts';

import {
  installWebPrivateResetters,
  webAccountScope,
} from './accountScopeRuntime.ts';
import {
  setSyntheticQueryHandler,
  type SyntheticQueryCall,
  type SyntheticQueryResult,
} from './test-fixtures/wardrobeStore/supabaseFixture.ts';
import { useWardrobeStore } from '../stores/wardrobeStore.ts';

const A = 'account-a' as AccountId;
const B = 'account-b' as AccountId;

installWebPrivateResetters([() => undefined]);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function item(itemId: string, userId: string, name: string): WardrobeItem {
  return {
    item_id: itemId,
    user_id: userId,
    name,
    category: '上装',
    color: 'black',
    source_type: 'manual',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function useAccount(accountId: AccountId): undefined {
  assert.equal(webAccountScope.replaceAccount(accountId).kind, 'ready');
  return undefined;
}

function eqAccountIds(call: SyntheticQueryCall): unknown[] {
  return call.operations
    .filter((operation) => operation.name === 'eq' && operation.args[0] === 'user_id')
    .map((operation) => operation.args[1]);
}

test('actual Store fetch keeps B state untouched when deferred A settles stale', async () => {
  useAccount(A);
  const pendingBase = deferred<SyntheticQueryResult>();
  const calls: SyntheticQueryCall[] = [];
  setSyntheticQueryHandler(async (call) => {
    calls.push(call);
    if (call.table === 'wardrobe_items') return pendingBase.promise;
    if (call.table === 'outfits') return { data: [], error: null };
    throw new Error(`unexpected table: ${call.table}`);
  });
  useWardrobeStore.setState({
    items: [item('item-a', A, 'A initial')],
    isLoading: false,
    error: 'A previous error',
    pendingEdits: { 'item-a': { name: 'A old overlay' } },
    deletedIds: [],
    mutationGenerations: {},
  });

  const readA = useWardrobeStore.getState().fetchItems(A);
  assert.equal(useWardrobeStore.getState().isLoading, true);
  assert.equal(useWardrobeStore.getState().error, null);

  useAccount(B);
  const bItem = item('item-b', B, 'B current item');
  const bPendingEdits = { 'item-b': { name: 'B private overlay' } };
  useWardrobeStore.setState({
    items: [bItem],
    isLoading: true,
    error: 'B current error',
    pendingEdits: bPendingEdits,
    deletedIds: ['item-b-deleted'],
    mutationGenerations: { 'item-b': { name: 3 } },
  });
  pendingBase.resolve({
    data: [item('item-a-server', A, 'A stale server row')],
    error: null,
  });
  await readA;

  const state = useWardrobeStore.getState();
  assert.deepEqual(state.items, [bItem]);
  assert.equal(state.isLoading, true);
  assert.equal(state.error, 'B current error');
  assert.deepEqual(state.pendingEdits, bPendingEdits);
  assert.deepEqual(state.deletedIds, ['item-b-deleted']);
  assert.deepEqual(state.mutationGenerations, { 'item-b': { name: 3 } });
  assert.deepEqual(calls.map((call) => [call.table, eqAccountIds(call)]), [
    ['wardrobe_items', [A]],
    ['outfits', [A]],
  ]);
});

test('actual Store fetch applies edits made while its server read is awaiting', async () => {
  useAccount(A);
  const pendingBase = deferred<SyntheticQueryResult>();
  setSyntheticQueryHandler(async (call) => {
    if (call.table === 'wardrobe_items') return pendingBase.promise;
    if (call.table === 'outfits') return { data: [], error: null };
    throw new Error(`unexpected table: ${call.table}`);
  });
  useWardrobeStore.setState({
    items: [item('item-shared', A, 'A initial')],
    isLoading: false,
    error: 'old error',
    pendingEdits: { 'item-shared': { name: 'A old overlay' } },
    deletedIds: [],
    mutationGenerations: {},
  });

  const read = useWardrobeStore.getState().fetchItems(A);
  assert.equal(useWardrobeStore.getState().isLoading, true);
  assert.equal(useWardrobeStore.getState().error, null);
  useWardrobeStore.setState({
    pendingEdits: { 'item-shared': { name: 'B edit made while awaiting' } },
  });
  pendingBase.resolve({
    data: [item('item-shared', A, 'A server row')],
    error: null,
  });
  await read;

  const state = useWardrobeStore.getState();
  assert.equal(state.isLoading, false);
  assert.equal(state.error, null);
  assert.deepEqual(state.items, [{
    ...item('item-shared', A, 'B edit made while awaiting'),
    wear_count: 0,
    favorite_count: 0,
  }]);
});
