import assert from 'node:assert';
import { test } from 'node:test';

import type { AccountId } from '@stymobile/contracts';
import type { WishlistItem } from '../types/index.ts';

import {
  installWebPrivateResetters,
  webAccountScope,
} from './accountScopeRuntime.ts';
import {
  setSyntheticSelfieHandler,
} from './test-fixtures/wardrobeStore/bodyModelFixture.ts';
import {
  setSyntheticQueryHandler,
  type SyntheticQueryCall,
  type SyntheticQueryResult,
} from './test-fixtures/wardrobeStore/supabaseFixture.ts';
import { useOutfitStore } from '../stores/outfitStore.ts';
import { useTryOnStore, type TryOnRecord } from '../stores/tryonStore.ts';
import { useWishlistStore } from '../stores/wishlistStore.ts';

const A = 'account-a' as AccountId;
const B = 'account-b' as AccountId;

installWebPrivateResetters([() => undefined]);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
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

function wish(wishId: string, userId: string, name: string): WishlistItem {
  return {
    wish_id: wishId,
    user_id: userId,
    name,
    category: '上装',
    color: 'black',
    source: 'user_added',
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function record(recordId: string, userId: string, outfitName: string): TryOnRecord {
  return {
    record_id: recordId,
    user_id: userId,
    scene: 'cafe',
    sceneLabel: '咖啡馆',
    outfitName,
    items: [],
    selfieUri: null,
    resultImageUrl: null,
    suggestion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function recordRow(recordId: string, userId: string, outfitName: string) {
  return {
    record_id: recordId,
    user_id: userId,
    scene: 'cafe',
    scene_label: '咖啡馆',
    outfit_name: outfitName,
    items: [],
    selfie_url: null,
    result_image_url: null,
    suggestion: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

test('actual wishlist fetch rejects mismatch without loading or a query', async () => {
  useAccount(B);
  const calls: SyntheticQueryCall[] = [];
  setSyntheticQueryHandler(async (call) => {
    calls.push(call);
    return { data: [], error: null };
  });
  const bItem = wish('wish-b', B, 'B current');
  useWishlistStore.setState({ items: [bItem], isLoading: false, error: 'B error' });

  await useWishlistStore.getState().fetchItems(A);

  assert.deepEqual(calls, []);
  assert.deepEqual(useWishlistStore.getState().items, [bItem]);
  assert.equal(useWishlistStore.getState().isLoading, false);
  assert.equal(useWishlistStore.getState().error, 'B error');
});

test('actual wishlist fetch keeps B success through stale A success', async () => {
  useAccount(A);
  const pendingA = deferred<SyntheticQueryResult>();
  const pendingB = deferred<SyntheticQueryResult>();
  const calls: SyntheticQueryCall[] = [];
  setSyntheticQueryHandler(async (call) => {
    calls.push(call);
    const accountId = eqAccountIds(call)[0];
    if (accountId === A) return pendingA.promise;
    if (accountId === B) return pendingB.promise;
    throw new Error(`unexpected account: ${String(accountId)}`);
  });

  const readA = useWishlistStore.getState().fetchItems(A);
  useAccount(B);
  const readB = useWishlistStore.getState().fetchItems(B);
  const bItem = wish('wish-b', B, 'B server');
  pendingB.resolve({ data: [bItem], error: null });
  await readB;
  pendingA.resolve({ data: [wish('wish-a', A, 'A stale')], error: null });
  await readA;

  assert.deepEqual(useWishlistStore.getState().items, [bItem]);
  assert.equal(useWishlistStore.getState().isLoading, false);
  assert.equal(useWishlistStore.getState().error, null);
  assert.deepEqual(calls.map((call) => eqAccountIds(call)), [[A], [B]]);
});

test('actual wishlist fetch does not let stale A error or finally alter pending B', async () => {
  useAccount(A);
  const pendingA = deferred<SyntheticQueryResult>();
  const pendingB = deferred<SyntheticQueryResult>();
  setSyntheticQueryHandler(async (call) => {
    const accountId = eqAccountIds(call)[0];
    if (accountId === A) return pendingA.promise;
    if (accountId === B) return pendingB.promise;
    throw new Error(`unexpected account: ${String(accountId)}`);
  });

  const readA = useWishlistStore.getState().fetchItems(A);
  useAccount(B);
  const readB = useWishlistStore.getState().fetchItems(B);
  pendingA.resolve({ data: null, error: new Error('raw private A error') });
  await readA;
  assert.equal(useWishlistStore.getState().isLoading, true);
  assert.equal(useWishlistStore.getState().error, null);
  pendingB.resolve({ data: [], error: null });
  await readB;
  assert.equal(useWishlistStore.getState().isLoading, false);
  assert.equal(useWishlistStore.getState().error, null);
});

test('actual wishlist current error is fixed and does not expose provider text', async () => {
  useAccount(A);
  setSyntheticQueryHandler(async () => ({
    data: null,
    error: new Error('sensitive provider detail'),
  }));
  useWishlistStore.setState({ items: [wish('wish-a', A, 'A existing')], isLoading: false, error: null });

  await useWishlistStore.getState().fetchItems(A);

  assert.deepEqual(useWishlistStore.getState().items, [wish('wish-a', A, 'A existing')]);
  assert.equal(useWishlistStore.getState().isLoading, false);
  assert.equal(useWishlistStore.getState().error, '心愿单加载失败，请重试');
});

test('actual wishlist reset cancels a pending settlement and its loading finally', async () => {
  useAccount(A);
  const pendingA = deferred<SyntheticQueryResult>();
  setSyntheticQueryHandler(async () => pendingA.promise);
  const readA = useWishlistStore.getState().fetchItems(A);
  useWishlistStore.getState().resetPrivateState();
  const bItem = wish('wish-b', B, 'B replacement');
  useWishlistStore.setState({ items: [bItem], isLoading: true, error: 'B error' });
  pendingA.resolve({ data: [wish('wish-a', A, 'A stale')], error: null });
  await readA;

  assert.deepEqual(useWishlistStore.getState().items, [bItem]);
  assert.equal(useWishlistStore.getState().isLoading, true);
  assert.equal(useWishlistStore.getState().error, 'B error');
});

test('actual outfit count fetch filters both queries by one account and rejects stale A counts', async () => {
  useAccount(A);
  const pending = new Map<string, ReturnType<typeof deferred<SyntheticQueryResult>>>();
  const calls: SyntheticQueryCall[] = [];
  for (const accountId of [A, B]) {
    for (const table of ['outfits', 'outfit_favorites']) {
      pending.set(`${accountId}:${table}`, deferred<SyntheticQueryResult>());
    }
  }
  setSyntheticQueryHandler(async (call) => {
    calls.push(call);
    const key = `${String(eqAccountIds(call)[0])}:${call.table}`;
    const request = pending.get(key);
    if (!request) throw new Error(`unexpected query: ${key}`);
    return request.promise;
  });

  const readA = useOutfitStore.getState().refreshCounts(A);
  useAccount(B);
  const readB = useOutfitStore.getState().refreshCounts(B);
  pending.get(`${B}:outfits`)?.resolve({ data: null, error: null, count: 4 });
  pending.get(`${B}:outfit_favorites`)?.resolve({ data: null, error: null, count: 7 });
  await readB;
  pending.get(`${A}:outfits`)?.resolve({ data: null, error: null, count: 40 });
  pending.get(`${A}:outfit_favorites`)?.resolve({ data: null, error: null, count: 70 });
  await readA;

  assert.deepEqual({
    savedCount: useOutfitStore.getState().savedCount,
    favoriteCount: useOutfitStore.getState().favoriteCount,
  }, { savedCount: 4, favoriteCount: 7 });
  assert.deepEqual(calls.map((call) => [call.table, eqAccountIds(call)]), [
    ['outfits', [A]],
    ['outfit_favorites', [A]],
    ['outfits', [B]],
    ['outfit_favorites', [B]],
  ]);
});

test('actual outfit count fetch rejects either query error without replacing the count pair', async () => {
  for (const failingTable of ['outfits', 'outfit_favorites']) {
    useAccount(A);
    useOutfitStore.setState({ savedCount: 5, favoriteCount: 6 });
    setSyntheticQueryHandler(async (call) => ({
      data: null,
      error: call.table === failingTable ? new Error(`${failingTable} private error`) : null,
      count: call.table === 'outfits' ? 50 : 60,
    }));

    await useOutfitStore.getState().refreshCounts(A);

    assert.deepEqual({
      savedCount: useOutfitStore.getState().savedCount,
      favoriteCount: useOutfitStore.getState().favoriteCount,
    }, { savedCount: 5, favoriteCount: 6 });
  }
});

test('actual outfit reset cancels a pending count pair', async () => {
  useAccount(A);
  const pendingOutfits = deferred<SyntheticQueryResult>();
  const pendingFavorites = deferred<SyntheticQueryResult>();
  setSyntheticQueryHandler(async (call) => (
    call.table === 'outfits' ? pendingOutfits.promise : pendingFavorites.promise
  ));
  const readA = useOutfitStore.getState().refreshCounts(A);
  useOutfitStore.getState().resetPrivateState();
  useOutfitStore.setState({ savedCount: 4, favoriteCount: 7 });
  pendingOutfits.resolve({ data: null, error: null, count: 40 });
  pendingFavorites.resolve({ data: null, error: null, count: 70 });
  await readA;

  assert.deepEqual({
    savedCount: useOutfitStore.getState().savedCount,
    favoriteCount: useOutfitStore.getState().favoriteCount,
  }, { savedCount: 4, favoriteCount: 7 });
});

test('actual try-on records and no-selfie reads complete independently', async () => {
  useAccount(A);
  const pendingRecords = deferred<SyntheticQueryResult>();
  const pendingSelfie = deferred<string | null>();
  const selfieAccounts: string[] = [];
  setSyntheticQueryHandler(async (call) => {
    assert.equal(call.table, 'tryon_records');
    assert.deepEqual(eqAccountIds(call), [A]);
    return pendingRecords.promise;
  });
  setSyntheticSelfieHandler(async (accountId) => {
    selfieAccounts.push(accountId);
    return pendingSelfie.promise;
  });
  useTryOnStore.setState({ records: [], selfieUri: 'old-selfie', loaded: false });

  const recordsRead = useTryOnStore.getState().fetchRecords(A);
  const selfieRead = useTryOnStore.getState().loadSelfieFromServer(A);
  pendingRecords.resolve({ data: [recordRow('record-a', A, 'A outfit')], error: null });
  pendingSelfie.resolve(null);
  await Promise.all([recordsRead, selfieRead]);

  assert.deepEqual(useTryOnStore.getState().records, [record('record-a', A, 'A outfit')]);
  assert.equal(useTryOnStore.getState().selfieUri, null);
  assert.equal(useTryOnStore.getState().loaded, true);
  assert.deepEqual(selfieAccounts, [A]);
});

test('actual try-on reset cancels pending records and selfie settlements', async () => {
  useAccount(A);
  const pendingRecords = deferred<SyntheticQueryResult>();
  const pendingSelfie = deferred<string | null>();
  setSyntheticQueryHandler(async () => pendingRecords.promise);
  setSyntheticSelfieHandler(async () => pendingSelfie.promise);

  const recordsRead = useTryOnStore.getState().fetchRecords(A);
  const selfieRead = useTryOnStore.getState().loadSelfieFromServer(A);
  useTryOnStore.getState().resetPrivateState();
  const bRecord = record('record-b', B, 'B current');
  useTryOnStore.setState({ records: [bRecord], selfieUri: 'B selfie', loaded: true });
  pendingRecords.resolve({ data: [recordRow('record-a', A, 'A stale')], error: null });
  pendingSelfie.resolve(null);
  await Promise.all([recordsRead, selfieRead]);

  assert.deepEqual(useTryOnStore.getState().records, [bRecord]);
  assert.equal(useTryOnStore.getState().selfieUri, 'B selfie');
  assert.equal(useTryOnStore.getState().loaded, true);
});

test('actual try-on current record error logs only the fixed message', async () => {
  useAccount(A);
  setSyntheticQueryHandler(async () => ({
    data: null,
    error: new Error('sensitive provider detail'),
  }));
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await useTryOnStore.getState().fetchRecords(A);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [['[tryonStore] fetchRecords failed']]);
});
