import type {
  PendingPreferenceRecord,
  PendingPreferenceStore,
} from '@stymobile/api-client';

export const STYLE_PREFERENCE_PENDING_STORAGE_KEY = 'stylee.web.preference.pending.v1';
export const STYLE_PREFERENCE_PENDING_MAX_BYTES = 65_536;
export const STYLE_PREFERENCE_PENDING_STORAGE_ERROR = 'preference_pending_store_unavailable';

export interface WebPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type StorageQueueRegistry = WeakMap<object, Map<string, Promise<void>>>;

const QUEUE_REGISTRY = Symbol.for('stylee.web.preference.pending.queue.v1');

function queueRegistry(): StorageQueueRegistry {
  const host = globalThis as unknown as Record<PropertyKey, unknown>;
  const existing = host[QUEUE_REGISTRY];
  if (existing instanceof WeakMap) return existing as StorageQueueRegistry;
  const created: StorageQueueRegistry = new WeakMap();
  host[QUEUE_REGISTRY] = created;
  return created;
}

function fixedError(): Error {
  return new Error(STYLE_PREFERENCE_PENDING_STORAGE_ERROR);
}

function validAccountId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function exactStringKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === 'string' && expected.includes(key));
}

function descriptorOwner(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !exactStringKeys(value, ['accountId', 'operationId', 'expectedRevision', 'payload'])) return null;
  const source = value as Record<string, unknown>;
  if (!validAccountId(source.accountId)
    || typeof source.operationId !== 'string'
    || source.operationId.length === 0
    || source.operationId.trim() !== source.operationId
    || !(source.expectedRevision === null
      || (typeof source.expectedRevision === 'number'
        && Number.isSafeInteger(source.expectedRevision)
        && source.expectedRevision > 0))
    || typeof source.payload !== 'object'
    || source.payload === null
    || Array.isArray(source.payload)
    || !exactStringKeys(source.payload, ['catalogVersion', 'status', 'selectedTagIds'])) return null;
  const payload = source.payload as Record<string, unknown>;
  if (typeof payload.catalogVersion !== 'string'
    || typeof payload.status !== 'string'
    || !Array.isArray(payload.selectedTagIds)) return null;
  return source.accountId;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function exceedsStorageLimit(value: string): boolean {
  return value.length > STYLE_PREFERENCE_PENDING_MAX_BYTES
    || utf8Bytes(value) > STYLE_PREFERENCE_PENDING_MAX_BYTES;
}

function defaultStorage(): WebPreferenceStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function serialize<T>(storage: WebPreferenceStorage, work: () => T): Promise<T> {
  const registry = queueRegistry();
  let queues = registry.get(storage);
  if (queues === undefined) {
    queues = new Map();
    registry.set(storage, queues);
  }
  const previous = queues.get(STYLE_PREFERENCE_PENDING_STORAGE_KEY) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(work);
  const tail = operation.then(() => undefined, () => undefined);
  queues.set(STYLE_PREFERENCE_PENDING_STORAGE_KEY, tail);
  void tail.finally(() => {
    if (queues?.get(STYLE_PREFERENCE_PENDING_STORAGE_KEY) === tail) {
      queues.delete(STYLE_PREFERENCE_PENDING_STORAGE_KEY);
    }
  });
  return operation;
}

function guarded<T>(
  injected: WebPreferenceStorage | undefined,
  work: (storage: WebPreferenceStorage) => T,
): Promise<T> {
  let storage: WebPreferenceStorage | null;
  try {
    storage = injected ?? defaultStorage();
  } catch {
    return Promise.reject(fixedError());
  }
  if (storage === null) return Promise.reject(fixedError());
  return serialize(storage, () => {
    try {
      return work(storage);
    } catch {
      throw fixedError();
    }
  });
}

function rejectInvalidAccount(accountId: string): Promise<never> | null {
  return validAccountId(accountId) ? null : Promise.reject(fixedError());
}

function decodeBounded(raw: string): Readonly<{ owner: string; value: unknown }> | null {
  if (exceedsStorageLimit(raw)) return null;
  const value: unknown = JSON.parse(raw);
  const owner = descriptorOwner(value);
  return owner === null ? null : { owner, value };
}

export function createWebStylePreferencePendingStore(
  injectedStorage?: WebPreferenceStorage,
): PendingPreferenceStore {
  return Object.freeze({
    read(accountId: string): Promise<unknown> {
      const invalid = rejectInvalidAccount(accountId);
      if (invalid !== null) return invalid;
      return guarded(injectedStorage, (storage) => {
        const raw = storage.getItem(STYLE_PREFERENCE_PENDING_STORAGE_KEY);
        if (raw === null) return null;
        let decoded: ReturnType<typeof decodeBounded>;
        try {
          decoded = decodeBounded(raw);
        } catch {
          decoded = null;
        }
        if (decoded === null || decoded.owner !== accountId) {
          storage.removeItem(STYLE_PREFERENCE_PENDING_STORAGE_KEY);
          return null;
        }
        return decoded.value;
      });
    },
    write(record: PendingPreferenceRecord): Promise<void> {
      const invalid = rejectInvalidAccount(record.accountId);
      if (invalid !== null) return invalid;
      return guarded(injectedStorage, (storage) => {
        const encoded = JSON.stringify(record);
        if (exceedsStorageLimit(encoded)
          || descriptorOwner(JSON.parse(encoded)) !== record.accountId) throw fixedError();
        storage.setItem(STYLE_PREFERENCE_PENDING_STORAGE_KEY, encoded);
      });
    },
    remove(accountId: string): Promise<void> {
      const invalid = rejectInvalidAccount(accountId);
      if (invalid !== null) return invalid;
      return guarded(injectedStorage, (storage) => {
        const raw = storage.getItem(STYLE_PREFERENCE_PENDING_STORAGE_KEY);
        if (raw === null) return;
        let decoded: ReturnType<typeof decodeBounded>;
        try {
          decoded = decodeBounded(raw);
        } catch {
          decoded = null;
        }
        if (decoded === null || decoded.owner === accountId) {
          storage.removeItem(STYLE_PREFERENCE_PENDING_STORAGE_KEY);
        }
      });
    },
  });
}
