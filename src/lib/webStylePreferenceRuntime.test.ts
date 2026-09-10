import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STYLE_PREFERENCE_V1_OPTIONS, type AccountId } from '@stymobile/contracts';
import { createAccountScope } from '@stymobile/core';
import type {
  StylePreferenceController,
  SupabaseStylePreferenceClient,
} from '@stymobile/api-client';

import {
  STYLE_PREFERENCE_PENDING_STORAGE_KEY,
  type WebPreferenceStorage,
} from './stylePreferencePendingStore.ts';
import {
  createWebStylePreferenceRuntime,
  webStylePreferenceController,
} from './webStylePreferenceRuntime.ts';
import {
  replaceSupabaseForRuntimeTest,
  supabase as fixtureSupabase,
} from './test-fixtures/rootRoute/platform.mjs';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

type RpcName = Parameters<SupabaseStylePreferenceClient['rpc']>[0];

class MemoryStorage implements WebPreferenceStorage {
  value: string | null = null;
  readonly events: string[];
  failGet = false;
  onSet: (() => void) | null = null;

  constructor(events: string[] = []) { this.events = events; }
  getItem(key: string): string | null {
    assert.equal(key, STYLE_PREFERENCE_PENDING_STORAGE_KEY);
    this.events.push('store:get');
    if (this.failGet) throw new Error('raw-storage-account-secret');
    return this.value;
  }
  setItem(key: string, value: string): void {
    assert.equal(key, STYLE_PREFERENCE_PENDING_STORAGE_KEY);
    this.events.push(`store:set:${JSON.parse(value).operationId}`);
    this.value = value;
    this.onSet?.();
  }
  removeItem(key: string): void {
    assert.equal(key, STYLE_PREFERENCE_PENDING_STORAGE_KEY);
    this.events.push('store:remove');
    this.value = null;
  }
}

function serverSnapshot(accountId: string, options: Readonly<{
  status?: 'unseen' | 'selected' | 'skipped';
  revision?: number | null;
  selectedTagIds?: readonly string[];
}> = {}) {
  const status = options.status ?? 'unseen';
  const selectedTagIds = options.selectedTagIds ?? [];
  return {
    account_id: accountId,
    status,
    catalog_version: 'stylee-style-v1',
    revision: options.revision ?? (status === 'unseen' ? null : 1),
    selected: selectedTagIds.map((tagId) => {
      const option = STYLE_PREFERENCE_V1_OPTIONS.find((candidate) => candidate.tagId === tagId);
      assert.ok(option);
      return { tag_id: tagId, display_name: option.displayName, model_value: option.modelValue, legacy: false };
    }),
    options: STYLE_PREFERENCE_V1_OPTIONS.map((option) => ({
      tag_id: option.tagId,
      display_name: option.displayName,
      model_value: option.modelValue,
      sort_order: option.sortOrder,
    })),
  };
}

function succeeded(operationId: string, accountId: string, selectedTagIds: readonly string[], revision = 1) {
  return {
    schema_version: 1,
    operation_id: operationId,
    request_id: `request-${revision}`,
    server_time: '2026-09-06T12:00:00.000Z',
    entity_revision: revision,
    state: 'succeeded',
    result: serverSnapshot(accountId, { status: selectedTagIds.length ? 'selected' : 'skipped', revision, selectedTagIds }),
    error: null,
  };
}

function rpcClient(
  responder: (name: RpcName, args: Record<string, unknown> | undefined) => unknown | Promise<unknown>,
  events: string[] = [],
) {
  const calls: Array<Readonly<{ name: RpcName; args: Record<string, unknown> | undefined }>> = [];
  const client: SupabaseStylePreferenceClient = {
    rpc(name, args) {
      calls.push({ name, args });
      events.push(`rpc:${name}`);
      return Promise.resolve().then(() => responder(name, args));
    },
  };
  return { client, calls };
}

function activeScope(accountId = 'account-a') {
  const scope = createAccountScope();
  assert.equal(scope.replaceAccount(accountId as AccountId).kind, 'ready');
  return scope;
}

async function waitForRpcCallCount(
  calls: readonly unknown[],
  count: number,
): Promise<void> {
  for (let turn = 0; turn < 20 && calls.length < count; turn += 1) await Promise.resolve();
  assert.equal(calls.length >= count, true, `expected at least ${count} RPC calls`);
}

test('loads an account-matched snapshot through the exact read RPC', async () => {
  const scope = activeScope();
  const storage = new MemoryStorage();
  const rpc = rpcClient((name, args) => {
    assert.equal(name, 'get_style_preferences_v1');
    assert.equal(args, undefined);
    return { data: serverSnapshot('account-a'), error: null };
  });
  const controller = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage, crypto: { randomUUID: () => UUID_A },
  });

  await controller.load();

  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().server?.accountId, 'account-a');
  assert.deepEqual(rpc.calls, [{ name: 'get_style_preferences_v1', args: undefined }]);
});

test('loads exactly once within an epoch and loads again after a reset epoch', async () => {
  let controller: StylePreferenceController | undefined;
  const scope = createAccountScope([() => controller?.reset()]);
  assert.equal(scope.replaceAccount('account-a' as AccountId).kind, 'ready');
  const rpc = rpcClient(() => ({ data: serverSnapshot('account-a'), error: null }));
  controller = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage: new MemoryStorage(), crypto: { randomUUID: () => UUID_A },
  });

  await Promise.all([controller.load(), controller.load()]);
  await controller.load();
  assert.equal(rpc.calls.length, 1);

  assert.equal(scope.replaceAccount('account-a' as AccountId).kind, 'ready');
  await controller.load();
  assert.equal(rpc.calls.length, 2);
});

test('retains the actual production controller across cache-busted module evaluation', async () => {
  const modulePath = './webStylePreferenceRuntime.ts';
  const first = await import(`${modulePath}?retained-production=1`) as typeof import('./webStylePreferenceRuntime.ts');
  const second = await import(`${modulePath}?retained-production=2`) as typeof import('./webStylePreferenceRuntime.ts');

  assert.equal(first.webStylePreferenceController, webStylePreferenceController);
  assert.equal(second.webStylePreferenceController, webStylePreferenceController);
});

test('production retention rejects a changed client for the same scope with one finite restart identifier', async () => {
  const rawMarker = 'raw-replaced-client-secret';
  const replacement: SupabaseStylePreferenceClient = {
    rpc() { throw new Error(rawMarker); },
  };
  assert.notEqual(replacement, fixtureSupabase);
  const restore = replaceSupabaseForRuntimeTest(replacement);
  try {
    const modulePath = './webStylePreferenceRuntime.ts';
    await assert.rejects(() => import(`${modulePath}?retained-client-mismatch=1`), (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).message, 'preference_runtime_restart_required');
      assert.equal(String(error).includes(rawMarker), false);
      return true;
    });
  } finally {
    restore();
  }
});

test('injectable factory instances remain independent for the same scope and client', () => {
  const scope = activeScope();
  const rpc = rpcClient(() => ({ data: serverSnapshot('account-a'), error: null }));
  const first = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage: new MemoryStorage(), crypto: { randomUUID: () => UUID_A },
  });
  const second = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage: new MemoryStorage(), crypto: { randomUUID: () => UUID_A },
  });

  assert.notEqual(first, second);
});

test('writes pending before replace and removes it only after one confirmed success', async () => {
  const events: string[] = [];
  const scope = activeScope();
  const storage = new MemoryStorage(events);
  const rpc = rpcClient((name, args) => name === 'get_style_preferences_v1'
    ? { data: serverSnapshot('account-a'), error: null }
    : { data: succeeded(UUID_A, 'account-a', ['minimalist']), error: null }, events);
  const controller = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage, crypto: { randomUUID: () => UUID_A },
  });
  await controller.load();
  events.length = 0;
  rpc.calls.length = 0;

  controller.toggle('minimalist');
  await controller.save();

  assert.deepEqual(rpc.calls, [{
    name: 'replace_style_preferences_v1',
    args: {
      p_operation_id: UUID_A,
      p_expected_revision: null,
      p_catalog_version: 'stylee-style-v1',
      p_status: 'selected',
      p_selected_tag_ids: ['minimalist'],
    },
  }]);
  assert.deepEqual(events, [
    `store:set:${UUID_A}`,
    'rpc:replace_style_preferences_v1',
    'store:get',
    'store:remove',
  ]);
  assert.equal(storage.value, null);
  assert.equal(controller.getSnapshot().message, 'preference_saved');
});

for (const [name, crypto] of [
  ['missing', null],
  ['throwing', { randomUUID: () => { throw new Error('raw-crypto-secret'); } }],
  ['noncanonical', { randomUUID: () => 'not-a-canonical-uuid' }],
] as const) {
  test(`${name} crypto fails before pending write, replace or query with fixed state`, async () => {
    const scope = activeScope();
    const storage = new MemoryStorage();
    const rpc = rpcClient((rpcName) => {
      assert.equal(rpcName, 'get_style_preferences_v1');
      return { data: serverSnapshot('account-a'), error: null };
    });
    const controller = createWebStylePreferenceRuntime({ client: rpc.client, scope, storage, crypto });
    await controller.load();
    storage.events.length = 0;
    rpc.calls.length = 0;
    controller.toggle('minimalist');

    await controller.save();

    assert.deepEqual(rpc.calls, []);
    assert.equal(storage.events.some((event) => event.startsWith('store:set')), false);
    assert.deepEqual(controller.getSnapshot(), {
      phase: 'error', server: controller.getSnapshot().server,
      draftTagIds: ['minimalist'], message: 'preference_save_failed', busy: false,
    });
    assert.equal(JSON.stringify(controller.getSnapshot()).includes('raw-crypto-secret'), false);
  });
}

test('transport failure retains one operation and retryConfirmation queries the same UUID', async () => {
  const scope = activeScope();
  const storage = new MemoryStorage();
  const rpc = rpcClient((name) => {
    if (name === 'get_style_preferences_v1') return { data: serverSnapshot('account-a'), error: null };
    if (name === 'replace_style_preferences_v1') throw new Error('raw-supabase-account-secret');
    return { data: succeeded(UUID_A, 'account-a', ['minimalist']), error: null };
  });
  const controller = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage, crypto: { randomUUID: () => UUID_A },
  });
  await controller.load();
  controller.toggle('minimalist');
  await controller.save();

  assert.equal(controller.getSnapshot().phase, 'confirming');
  assert.equal(controller.getSnapshot().message, 'preference_save_unknown');
  assert.equal(JSON.parse(storage.value!).operationId, UUID_A);
  await controller.retryConfirmation();

  assert.deepEqual(rpc.calls.map((call) => call.name), [
    'get_style_preferences_v1',
    'replace_style_preferences_v1',
    'get_style_preference_operation_v1',
  ]);
  assert.deepEqual(rpc.calls.at(-1), {
    name: 'get_style_preference_operation_v1', args: { p_operation_id: UUID_A },
  });
  assert.equal(storage.events.filter((event) => event.startsWith('store:set')).length, 1);
  assert.equal(JSON.stringify(controller.getSnapshot()).includes('raw-supabase-account-secret'), false);
});

test('a persisted operation survives a fresh controller and is queried without a new read or UUID', async () => {
  const scope = activeScope();
  const storage = new MemoryStorage();
  const firstRpc = rpcClient((name) => {
    if (name === 'get_style_preferences_v1') return { data: serverSnapshot('account-a'), error: null };
    throw new Error('transport-secret');
  });
  const first = createWebStylePreferenceRuntime({
    client: firstRpc.client, scope, storage, crypto: { randomUUID: () => UUID_A },
  });
  await first.load();
  first.toggle('minimalist');
  await first.save();

  let generated = 0;
  const secondRpc = rpcClient((name) => {
    assert.equal(name, 'get_style_preference_operation_v1');
    return { data: succeeded(UUID_A, 'account-a', ['minimalist']), error: null };
  });
  const second = createWebStylePreferenceRuntime({
    client: secondRpc.client, scope, storage,
    crypto: { randomUUID: () => { generated += 1; return UUID_B; } },
  });
  await second.load();

  assert.equal(generated, 0);
  assert.deepEqual(secondRpc.calls, [{
    name: 'get_style_preference_operation_v1', args: { p_operation_id: UUID_A },
  }]);
  assert.equal(second.getSnapshot().message, 'preference_saved');
});

for (const lateOutcome of ['success', 'error'] as const) {
  test(`A to B reset makes a late A read ${lateOutcome} inert`, async () => {
    let controller: StylePreferenceController | undefined;
    const scope = createAccountScope([() => controller?.reset()]);
    assert.equal(scope.replaceAccount('account-a' as AccountId).kind, 'ready');
    let settleA!: (value: unknown) => void;
    const rpc = rpcClient((name) => {
      assert.equal(name, 'get_style_preferences_v1');
      if (rpc.calls.length === 1) return new Promise((resolve) => { settleA = resolve; });
      return { data: serverSnapshot('account-b'), error: null };
    });
    controller = createWebStylePreferenceRuntime({
      client: rpc.client, scope, storage: new MemoryStorage(), crypto: { randomUUID: () => UUID_A },
    });
    const old = controller.load();
    await waitForRpcCallCount(rpc.calls, 1);
    assert.equal(scope.replaceAccount('account-b' as AccountId).kind, 'ready');
    await controller.load();

    settleA(lateOutcome === 'success'
      ? { data: serverSnapshot('account-a'), error: null }
      : { data: null, error: { message: 'raw-late-A-secret' } });
    await old;

    assert.equal(controller.getSnapshot().server?.accountId, 'account-b');
    assert.equal(controller.getSnapshot().phase, 'ready');
    assert.equal(controller.getSnapshot().busy, false);
    assert.equal(JSON.stringify(controller.getSnapshot()).includes('raw-late-A-secret'), false);
  });
}

test('same-account signout and relogin invalidates the old epoch and late work', async () => {
  let controller: StylePreferenceController | undefined;
  const scope = createAccountScope([() => controller?.reset()]);
  assert.equal(scope.replaceAccount('account-a' as AccountId).kind, 'ready');
  let settleOld!: (value: unknown) => void;
  const rpc = rpcClient(() => rpc.calls.length === 1
    ? new Promise((resolve) => { settleOld = resolve; })
    : { data: serverSnapshot('account-a'), error: null });
  controller = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage: new MemoryStorage(), crypto: { randomUUID: () => UUID_A },
  });
  const old = controller.load();
  await waitForRpcCallCount(rpc.calls, 1);
  assert.equal(scope.signOut().kind, 'ready');
  assert.equal(scope.replaceAccount('account-a' as AccountId).kind, 'ready');
  await controller.load();
  settleOld({ data: serverSnapshot('account-a', { status: 'selected', revision: 7, selectedTagIds: ['street'] }), error: null });
  await old;

  assert.equal(controller.getSnapshot().server?.revision, null);
  assert.deepEqual(controller.getSnapshot().server?.selected, []);
});

test('account transition during A pending write cleans A and leaves B private', async () => {
  let controller: StylePreferenceController | undefined;
  const scope = createAccountScope([() => controller?.reset()]);
  assert.equal(scope.replaceAccount('account-a' as AccountId).kind, 'ready');
  const storage = new MemoryStorage();
  const rpc = rpcClient((name) => ({
    data: serverSnapshot(name === 'get_style_preferences_v1' && rpc.calls.length > 1 ? 'account-b' : 'account-a'),
    error: null,
  }));
  controller = createWebStylePreferenceRuntime({
    client: rpc.client, scope, storage, crypto: { randomUUID: () => UUID_A },
  });
  await controller.load();
  controller.toggle('minimalist');
  storage.onSet = () => {
    storage.onSet = null;
    assert.equal(scope.replaceAccount('account-b' as AccountId).kind, 'ready');
  };
  await controller.save();
  assert.equal(storage.value, null);
  await controller.load();
  assert.equal(controller.getSnapshot().server?.accountId, 'account-b');
  assert.equal(rpc.calls.some((call) => call.name === 'replace_style_preferences_v1'), false);
});

test('raw RPC and storage failures collapse to fixed controller snapshots', async () => {
  for (const source of ['rpc', 'storage'] as const) {
    const scope = activeScope('account-secret');
    const storage = new MemoryStorage();
    storage.failGet = source === 'storage';
    const rpc = rpcClient(() => source === 'rpc'
      ? { data: null, error: { message: 'raw-provider-account-secret' } }
      : { data: serverSnapshot('account-secret'), error: null });
    const controller = createWebStylePreferenceRuntime({
      client: rpc.client, scope, storage, crypto: { randomUUID: () => UUID_A },
    });
    await controller.load();
    const serialized = JSON.stringify(controller.getSnapshot());
    assert.deepEqual(controller.getSnapshot(), {
      phase: 'error', server: null, draftTagIds: [], message: 'preference_read_failed', busy: false,
    });
    assert.equal(serialized.includes('raw-provider-account-secret'), false);
    assert.equal(serialized.includes('raw-storage-account-secret'), false);
  }
});
