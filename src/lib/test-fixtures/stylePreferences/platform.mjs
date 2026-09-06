import { createStylePreferenceController } from '@stymobile/api-client';
import { STYLE_PREFERENCE_V1_OPTIONS } from '@stymobile/contracts';
import { createAccountScope } from '@stymobile/core';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

export let webAccountScope;
export let webStylePreferenceController;
export const observations = {};
let responseMode = 'success';
let revision = 1;
let server;
let pendingRecord = null;
let nextUuid = UUID_A;
let deferredWrites = [];
let settleRead = null;

function snapshot(accountId, options = {}) {
  const status = options.status ?? 'unseen';
  const selectedTagIds = options.selectedTagIds ?? [];
  const legacy = options.legacy ?? [];
  return Object.freeze({
    accountId,
    status,
    catalogVersion: 'stylee-style-v1',
    revision: options.revision ?? (status === 'unseen' ? null : revision),
    selected: Object.freeze([
      ...selectedTagIds.map((tagId) => {
        const option = STYLE_PREFERENCE_V1_OPTIONS.find((candidate) => candidate.tagId === tagId);
        if (!option) throw new Error(`unknown fixture option ${tagId}`);
        return Object.freeze({ ...option, legacy: false });
      }),
      ...legacy.map((selection) => Object.freeze({ ...selection, legacy: true })),
    ]),
    options: STYLE_PREFERENCE_V1_OPTIONS,
  });
}

function succeeded(record) {
  revision += 1;
  server = snapshot(record.accountId, {
    status: record.payload.status,
    selectedTagIds: record.payload.selectedTagIds,
    revision,
  });
  return Object.freeze({
    schema_version: 1,
    operation_id: record.operationId,
    request_id: `request-${revision}`,
    server_time: '2026-09-06T00:00:00.000Z',
    entity_revision: revision,
    state: 'succeeded',
    result: server,
    error: null,
  });
}

function createController(accountId) {
  const port = {
    async read() {
      observations.reads += 1;
      if (responseMode === 'read-deferred') {
        return new Promise((resolve) => { settleRead = () => resolve(server); });
      }
      if (responseMode === 'read-error' || responseMode === 'conflict-reload-error') {
        throw new Error('raw-provider-private-read');
      }
      return server;
    },
    async replace(request) {
      observations.replaces += 1;
      observations.operationIds.push(request.operation_id);
      const ownerId = webAccountScope.capture()?.accountId ?? accountId;
      const record = {
        accountId: ownerId,
        operationId: request.operation_id,
        expectedRevision: request.expected_revision ?? null,
        payload: request.payload,
      };
      pendingRecord = record;
      if (responseMode === 'deferred') {
        return new Promise((resolve) => {
          deferredWrites.push({ accountId: record.accountId, settle: () => resolve(succeeded(record)) });
        });
      }
      if (responseMode === 'fixed-error') {
        return {
          schema_version: 1, operation_id: record.operationId,
          request_id: 'request-failed', server_time: '2026-09-06T00:00:00.000Z',
          state: 'failed', result: null,
          error: { code: 'invalid', stage: 'validate', retry_action: 'none' },
        };
      }
      if (responseMode === 'unknown') throw new Error('raw-provider-private-write');
      if (responseMode === 'conflict' || responseMode === 'conflict-read-error') {
        responseMode = responseMode === 'conflict-read-error' ? 'conflict-reload-error' : 'success';
        server = snapshot(accountId, { status: 'selected', selectedTagIds: ['street'], revision: revision + 1 });
        revision += 1;
        return {
          schema_version: 1, operation_id: record.operationId,
          request_id: 'request-conflict', server_time: '2026-09-06T00:00:00.000Z',
          entity_revision: revision, state: 'failed', result: null,
          error: { code: 'revision_conflict', stage: 'commit', retry_action: 'new_attempt_after_confirmation' },
        };
      }
      return succeeded(record);
    },
    async query(operationId) {
      observations.queries += 1;
      observations.queriedOperationIds.push(operationId);
      if (!pendingRecord || pendingRecord.operationId !== operationId) throw new Error('wrong operation');
      responseMode = 'success';
      return succeeded(pendingRecord);
    },
  };
  const pendingStore = {
    async read() { return null; },
    async write(record) {
      if (responseMode === 'store-write-error') throw new Error('raw-storage-private-write');
      pendingRecord = record;
    },
    async remove() { pendingRecord = null; },
  };
  return createStylePreferenceController({
    port,
    pendingStore,
    scope: webAccountScope,
    createOperationId: () => {
      const value = nextUuid;
      nextUuid = nextUuid === UUID_A ? UUID_B : UUID_A;
      return value;
    },
  });
}

export function resetHarness(options = {}) {
  responseMode = options.responseMode ?? 'success';
  revision = options.revision ?? 1;
  pendingRecord = null;
  deferredWrites = [];
  settleRead = null;
  nextUuid = UUID_A;
  Object.assign(observations, {
    routes: [], toasts: [], reads: 0, replaces: 0, queries: 0,
    operationIds: [], queriedOperationIds: [], backs: 0,
  });
  const accountId = options.accountId ?? 'account-a';
  webAccountScope = createAccountScope();
  webAccountScope.replaceAccount(accountId);
  server = snapshot(accountId, {
    status: options.status ?? 'unseen',
    selectedTagIds: options.selectedTagIds ?? [],
    legacy: options.legacy ?? [],
    revision: options.serverRevision,
  });
  webStylePreferenceController = createController(accountId);
}

export function setResponseMode(mode) { responseMode = mode; }
export function settleDeferredWrite(accountId) {
  const index = deferredWrites.findIndex((entry) => accountId === undefined || entry.accountId === accountId);
  if (index < 0) return;
  const [entry] = deferredWrites.splice(index, 1);
  entry.settle();
}
export function settleDeferredRead() { settleRead?.(); settleRead = null; }
export function switchAccount(accountId, options = {}) {
  webStylePreferenceController.reset();
  webAccountScope.replaceAccount(accountId);
  server = snapshot(accountId, {
    status: options.status ?? 'unseen',
    selectedTagIds: options.selectedTagIds ?? [],
    legacy: options.legacy ?? [],
    revision: options.serverRevision,
  });
}

export const router = {
  push(path) { observations.routes.push(path); },
  replace(path) { observations.routes.push(path); },
  back() { observations.backs += 1; },
  canGoBack() { return observations.canGoBack ?? true; },
};
export const useLocalSearchParams = () => ({});
export const supabase = {
  from() {
    const chain = {
      delete: () => chain,
      upsert: async () => ({ error: null }),
      eq: async () => ({ data: [], error: null }),
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  },
};
export function useUserStore() {
  return {
    user: { id: webAccountScope.capture()?.accountId ?? 'account-a' },
    stylePreferences: [],
    fetchProfile: async () => undefined,
  };
}

export function showToast(message, variant) {
  observations.toasts.push({ message, variant });
}
