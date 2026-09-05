export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROFILE_CACHE_PREFIX = 'stylee.profile.';

function browserStorage(): ProfileStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function profileCacheKey(accountId: string): string {
  if (accountId.length === 0 || accountId.trim() !== accountId) {
    throw new Error('invalid_profile_cache_account');
  }
  return `${PROFILE_CACHE_PREFIX}${accountId}`;
}

export function readProfileCache<T>(
  accountId: string,
  storage: ProfileStorage | null = browserStorage(),
): T | null {
  const key = profileCacheKey(accountId);
  if (storage === null) return null;

  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeProfileCache<T>(
  accountId: string,
  value: T,
  storage: ProfileStorage | null = browserStorage(),
): undefined {
  const key = profileCacheKey(accountId);
  if (storage === null) return undefined;

  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) storage.setItem(key, serialized);
  } catch {
    // Browser storage and JSON serialization can fail without blocking auth.
  }
  return undefined;
}

export function clearProfileCache(
  accountId: string,
  storage: ProfileStorage | null = browserStorage(),
): undefined {
  const key = profileCacheKey(accountId);
  if (storage === null) return undefined;

  try {
    storage.removeItem(key);
  } catch {
    // Browser storage can be unavailable even when localStorage is defined.
  }
  return undefined;
}
