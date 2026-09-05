import assert from 'node:assert';
import { test } from 'node:test';

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
