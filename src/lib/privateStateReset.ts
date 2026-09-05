import type { ScopeResetter } from '@stymobile/core';

export function importPrivateReset() {
  return {
    tasks: [],
    isProcessing: false,
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    pendingSelectionCount: 0,
    activeUserId: null,
  };
}

export function tryOnPrivateReset() {
  return {
    selfieUri: null,
    selectedOutfitId: null,
    selectedScene: 'cafe',
    tryOnResult: null,
    lastResult: null,
    records: [],
    loaded: false,
  };
}

export function wardrobePrivateReset() {
  return {
    items: [],
    isLoading: false,
    error: null,
    pendingEdits: {},
    deletedIds: [],
    mutationGenerations: {},
  };
}

export function wishlistPrivateReset() {
  return { items: [], isLoading: false, error: null };
}

export function outfitPrivateReset() {
  return { savedCount: 0, favoriteCount: 0 };
}

export function preferencePrivateReset() {
  return {
    records: [],
    consecutiveSwapsSinceFavorite: 0,
    swapHintShownAt: null,
  };
}

export function userPrivateReset() {
  return { profile: null, stylePreferences: [], isLoading: false };
}

export interface WebPrivateResetters {
  import: ScopeResetter;
  tryon: ScopeResetter;
  wardrobe: ScopeResetter;
  wishlist: ScopeResetter;
  outfit: ScopeResetter;
  preference: ScopeResetter;
  user: ScopeResetter;
  profileCache: ScopeResetter;
}

export function createOrderedWebPrivateResetters(
  resetters: WebPrivateResetters,
): readonly ScopeResetter[] {
  return Object.freeze([
    resetters.import,
    resetters.tryon,
    resetters.wardrobe,
    resetters.wishlist,
    resetters.outfit,
    resetters.preference,
    resetters.user,
    resetters.profileCache,
  ]);
}
