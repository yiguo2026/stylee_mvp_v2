import assert from 'node:assert';
import { test } from 'node:test';

import {
  PROFILE_CACHE_PREFIX,
  clearProfileCache,
  readProfileCache,
  writeProfileCache,
  type ProfileStorage,
} from './profileCache.ts';

class MemoryStorage implements ProfileStorage {
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

test('isolates cached profiles by account ID', () => {
  const storage = new MemoryStorage();
  writeProfileCache('account-a', { displayName: 'A' }, storage);
  writeProfileCache('account-b', { displayName: 'B' }, storage);

  assert.equal(storage.values.get(`${PROFILE_CACHE_PREFIX}account-a`), '{"displayName":"A"}');
  assert.equal(storage.values.get(`${PROFILE_CACHE_PREFIX}account-b`), '{"displayName":"B"}');
  assert.deepEqual(readProfileCache('account-a', storage), { displayName: 'A' });
  assert.deepEqual(readProfileCache('account-b', storage), { displayName: 'B' });
});

test('returns null for malformed JSON without deleting another account', () => {
  const storage = new MemoryStorage();
  storage.values.set(`${PROFILE_CACHE_PREFIX}account-a`, '{malformed');
  storage.values.set(`${PROFILE_CACHE_PREFIX}account-b`, '{"displayName":"B"}');

  assert.equal(readProfileCache('account-a', storage), null);
  assert.equal(storage.values.get(`${PROFILE_CACHE_PREFIX}account-b`), '{"displayName":"B"}');
});

test('round trips a profile object', () => {
  const storage = new MemoryStorage();
  const profile = { id: 'profile-a', nested: { colors: ['black', 'white'] } };

  assert.equal(writeProfileCache('account-a', profile, storage), undefined);
  assert.deepEqual(readProfileCache<typeof profile>('account-a', storage), profile);
});

test('clears only the requested account profile', () => {
  const storage = new MemoryStorage();
  writeProfileCache('account-a', { displayName: 'A' }, storage);
  writeProfileCache('account-b', { displayName: 'B' }, storage);

  assert.equal(clearProfileCache('account-a', storage), undefined);
  assert.equal(readProfileCache('account-a', storage), null);
  assert.deepEqual(readProfileCache('account-b', storage), { displayName: 'B' });
});

test('missing storage returns null or undefined without side effects', () => {
  assert.equal(readProfileCache('account-a', null), null);
  assert.equal(writeProfileCache('account-a', { displayName: 'A' }, null), undefined);
  assert.equal(clearProfileCache('account-a', null), undefined);
});

test('rejects empty and whitespace account IDs without creating a key', () => {
  const storage = new MemoryStorage();

  for (const accountId of ['', ' ', ' account-a', 'account-a ']) {
    assert.throws(
      () => writeProfileCache(accountId, { displayName: 'private' }, storage),
      /invalid_profile_cache_account/,
    );
    assert.throws(() => readProfileCache(accountId, storage), /invalid_profile_cache_account/);
    assert.throws(() => clearProfileCache(accountId, storage), /invalid_profile_cache_account/);
  }

  assert.equal(storage.values.size, 0);
});

test('contains storage and serialization failures', () => {
  const unavailable: ProfileStorage = {
    getItem() { throw new Error('security'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('security'); },
  };

  assert.equal(readProfileCache('account-a', unavailable), null);
  assert.equal(writeProfileCache('account-a', 1n, unavailable), undefined);
  assert.equal(clearProfileCache('account-a', unavailable), undefined);
});
