import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope } from '@stymobile/core';

import { createPrivateResetRegistry } from './accountScopeRuntime.ts';
import {
  createOrderedWebPrivateResetters,
  importPrivateReset,
  outfitPrivateReset,
  preferencePrivateReset,
  tryOnPrivateReset,
  userPrivateReset,
  wardrobePrivateReset,
  wishlistPrivateReset,
} from './privateStateReset.ts';
import {
  clearProfileCache,
  readProfileCache,
  writeProfileCache,
  type ProfileStorage,
} from './profileCache.ts';

class MemoryProfileStorage implements ProfileStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('private reset patches overwrite every seeded private value', () => {
  assert.deepEqual({ ...{ tasks: ['task'], isProcessing: true, totalCount: 1, completedCount: 1, failedCount: 1, pendingSelectionCount: 1, activeUserId: 'account-a' }, ...importPrivateReset() }, {
    tasks: [], isProcessing: false, totalCount: 0, completedCount: 0,
    failedCount: 0, pendingSelectionCount: 0, activeUserId: null,
  });
  assert.deepEqual({ ...{ selfieUri: 'file:///selfie.jpg', selectedOutfitId: 'outfit-a', selectedScene: 'studio', tryOnResult: 'file:///result.jpg', lastResult: 'result', records: ['record'], loaded: true }, ...tryOnPrivateReset() }, {
    selfieUri: null, selectedOutfitId: null, selectedScene: 'cafe',
    tryOnResult: null, lastResult: null, records: [], loaded: false,
  });
  assert.deepEqual({ ...{ items: ['item'], isLoading: true, error: 'private-detail', pendingEdits: { item: { name: 'edited' } }, deletedIds: ['item'], mutationGenerations: { item: { name: 1 } } }, ...wardrobePrivateReset() }, {
    items: [], isLoading: false, error: null, pendingEdits: {},
    deletedIds: [], mutationGenerations: {},
  });
  assert.deepEqual({ ...{ items: ['item'], isLoading: true, error: 'private-detail' }, ...wishlistPrivateReset() }, { items: [], isLoading: false, error: null });
  assert.deepEqual({ ...{ savedCount: 1, favoriteCount: 1 }, ...outfitPrivateReset() }, { savedCount: 0, favoriteCount: 0 });
  assert.deepEqual({ ...{ records: ['record'], consecutiveSwapsSinceFavorite: 1, swapHintShownAt: 123 }, ...preferencePrivateReset() }, {
    records: [], consecutiveSwapsSinceFavorite: 0, swapHintShownAt: null,
  });
  assert.deepEqual({ ...{ profile: { id: 'profile-a' }, stylePreferences: ['minimal'], isLoading: true }, ...userPrivateReset() }, {
    profile: null, stylePreferences: [], isLoading: false,
  });
});

test('private reset patches allocate fresh mutable values', () => {
  assert.notEqual(importPrivateReset().tasks, importPrivateReset().tasks);
  assert.notEqual(tryOnPrivateReset().records, tryOnPrivateReset().records);
  assert.notEqual(wardrobePrivateReset().pendingEdits, wardrobePrivateReset().pendingEdits);
  assert.notEqual(wishlistPrivateReset().items, wishlistPrivateReset().items);
  assert.notEqual(userPrivateReset().stylePreferences, userPrivateReset().stylePreferences);
});

test('orders private resetters before the profile cache resetter', () => {
  const calls: string[] = [];
  const resetters = createOrderedWebPrivateResetters({
    import: () => { calls.push('import'); return undefined; },
    tryon: () => { calls.push('tryon'); return undefined; },
    wardrobe: () => { calls.push('wardrobe'); return undefined; },
    wishlist: () => { calls.push('wishlist'); return undefined; },
    outfit: () => { calls.push('outfit'); return undefined; },
    preference: () => { calls.push('preference'); return undefined; },
    user: () => { calls.push('user'); return undefined; },
    profileCache: () => { calls.push('profile-cache'); return undefined; },
  });

  assert.equal(Object.isFrozen(resetters), true);
  resetters.forEach((reset) => reset());
  assert.deepEqual(calls, ['import', 'tryon', 'wardrobe', 'wishlist', 'outfit', 'preference', 'user', 'profile-cache']);
});

test('resets all private state and only the departing profile cache before account publish', () => {
  const storage = new MemoryProfileStorage();
  const registry = createPrivateResetRegistry();
  const scope = createAccountScope([registry.dispatch]);
  const calls: string[] = [];
  let publishedAccountId: string | null = null;
  let departingAccountId: string | null = null;
  let importState: Record<string, unknown> = {};
  let tryOnState: Record<string, unknown> = {};
  let wardrobeState: Record<string, unknown> = {};
  let wishlistState: Record<string, unknown> = {};
  let outfitState: Record<string, unknown> = {};
  let preferenceState: Record<string, unknown> = {};
  let userState: Record<string, unknown> = {};

  function reset(
    name: string,
    patch: () => Record<string, unknown>,
    apply: (next: Record<string, unknown>) => void,
  ) {
    return () => {
      assert.equal(scope.capture(), null);
      calls.push(name);
      apply(patch());
      return undefined;
    };
  }

  registry.install(createOrderedWebPrivateResetters({
    import: reset('import', importPrivateReset, (next) => { importState = next; }),
    tryon: reset('tryon', tryOnPrivateReset, (next) => { tryOnState = next; }),
    wardrobe: reset('wardrobe', wardrobePrivateReset, (next) => { wardrobeState = next; }),
    wishlist: reset('wishlist', wishlistPrivateReset, (next) => { wishlistState = next; }),
    outfit: reset('outfit', outfitPrivateReset, (next) => { outfitState = next; }),
    preference: reset('preference', preferencePrivateReset, (next) => { preferenceState = next; }),
    user: reset('user', userPrivateReset, (next) => { userState = next; }),
    profileCache: () => {
      assert.equal(scope.capture(), null);
      calls.push('profile-cache');
      if (departingAccountId !== null) clearProfileCache(departingAccountId, storage);
      return undefined;
    },
  }));

  assert.equal(scope.replaceAccount('account-a').kind, 'ready');
  publishedAccountId = 'account-a';
  departingAccountId = publishedAccountId;
  calls.length = 0;

  importState = { tasks: ['private'], isProcessing: true };
  tryOnState = { selfieUri: 'file:///private.jpg', loaded: true };
  wardrobeState = { items: ['private'], pendingEdits: { private: true } };
  wishlistState = { items: ['private'], error: 'private' };
  outfitState = { savedCount: 3, favoriteCount: 2 };
  preferenceState = { records: ['private'], consecutiveSwapsSinceFavorite: 4 };
  userState = { profile: { name: 'private' }, stylePreferences: ['private'], isLoading: true };
  writeProfileCache('account-a', { displayName: 'A' }, storage);
  writeProfileCache('account-b', { displayName: 'B' }, storage);

  const transition = scope.replaceAccount('account-b');

  assert.equal(transition.kind, 'ready');
  assert.equal(publishedAccountId, 'account-a');
  assert.deepEqual(calls, ['import', 'tryon', 'wardrobe', 'wishlist', 'outfit', 'preference', 'user', 'profile-cache']);
  assert.deepEqual(importState, importPrivateReset());
  assert.deepEqual(tryOnState, tryOnPrivateReset());
  assert.deepEqual(wardrobeState, wardrobePrivateReset());
  assert.deepEqual(wishlistState, wishlistPrivateReset());
  assert.deepEqual(outfitState, outfitPrivateReset());
  assert.deepEqual(preferenceState, preferencePrivateReset());
  assert.deepEqual(userState, userPrivateReset());
  assert.equal(readProfileCache('account-a', storage), null);
  assert.deepEqual(readProfileCache('account-b', storage), { displayName: 'B' });
});

test('continues through all eight resetters and blocks account publish after one throws', () => {
  const registry = createPrivateResetRegistry();
  const scope = createAccountScope([registry.dispatch]);
  const calls: string[] = [];
  const action = (name: string, shouldThrow = false) => () => {
    assert.equal(scope.capture(), null);
    calls.push(name);
    if (shouldThrow) throw new Error('private-detail');
    return undefined;
  };

  registry.install(createOrderedWebPrivateResetters({
    import: action('import'),
    tryon: action('tryon'),
    wardrobe: action('wardrobe'),
    wishlist: action('wishlist', true),
    outfit: action('outfit'),
    preference: action('preference'),
    user: action('user'),
    profileCache: action('profile-cache'),
  }));

  const transition = scope.replaceAccount('account-b');

  assert.equal(transition.kind, 'blocked');
  assert.deepEqual(calls, ['import', 'tryon', 'wardrobe', 'wishlist', 'outfit', 'preference', 'user', 'profile-cache']);
  assert.equal(scope.capture(), null);
  assert.equal(scope.current().status, 'blocked');
});
