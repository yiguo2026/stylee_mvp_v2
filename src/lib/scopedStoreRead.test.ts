import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope, type AccountScope, type AccountStamp } from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';

import { createLatestReadSlot, runScopedStoreRead } from './scopedStoreRead.ts';

const A = 'account-a' as AccountId;
const B = 'account-b' as AccountId;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function authenticate(scope: AccountScope, accountId: AccountId): AccountStamp {
  assert.equal(scope.replaceAccount(accountId).kind, 'ready');
  const stamp = scope.capture();
  if (stamp === null) throw new Error('expected_authenticated_scope');
  return stamp;
}

test('discards anonymous and mismatched expected-account reads before observable callbacks', async () => {
  const anonymousScope = createAccountScope();
  const mismatchScope = createAccountScope();
  const mismatchStamp = authenticate(mismatchScope, A);
  let loadingCalls = 0;
  let executeCalls = 0;
  let applyCalls = 0;
  let errorCalls = 0;
  const callbacks = {
    execute: async () => { executeCalls += 1; return 'value'; },
    apply: () => { applyCalls += 1; return undefined; },
    onError: () => { errorCalls += 1; return undefined; },
    onLoadingChange: () => { loadingCalls += 1; return undefined; },
  };

  assert.deepEqual(await runScopedStoreRead({
    scope: anonymousScope,
    slot: createLatestReadSlot(),
    ...callbacks,
  }), { kind: 'discarded' });
  assert.deepEqual(await runScopedStoreRead({
    scope: mismatchScope,
    stamp: mismatchStamp,
    expectedAccountId: B,
    slot: createLatestReadSlot(),
    ...callbacks,
  }), { kind: 'discarded' });
  assert.deepEqual({ loadingCalls, executeCalls, applyCalls, errorCalls }, {
    loadingCalls: 0, executeCalls: 0, applyCalls: 0, errorCalls: 0,
  });
});

test('does not let a stale A success apply or clear B loading', async () => {
  const scope = createAccountScope();
  const slot = createLatestReadSlot();
  const slowA = deferred<string>();
  const slowB = deferred<string>();
  let loading = false;
  let value: string | null = null;

  const a = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, A),
    slot,
    execute: async () => slowA.promise,
    apply: (next) => { value = `A:${next}`; return undefined; },
    onLoadingChange: (next) => { loading = next; return undefined; },
  });
  const b = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, B),
    slot,
    execute: async () => slowB.promise,
    apply: (next) => { value = `B:${next}`; return undefined; },
    onLoadingChange: (next) => { loading = next; return undefined; },
  });

  slowA.resolve('old');
  assert.deepEqual(await a, { kind: 'discarded' });
  assert.equal(loading, true);
  assert.equal(value, null);

  slowB.resolve('new');
  assert.deepEqual(await b, { kind: 'committed' });
  assert.equal(value, 'B:new');
  assert.equal(loading, false);
});

test('does not let a stale A error call an error handler or clear B loading', async () => {
  const scope = createAccountScope();
  const slot = createLatestReadSlot();
  const slowA = deferred<string>();
  const slowB = deferred<string>();
  let loading = false;
  let error: unknown = null;
  let value: string | null = null;

  const a = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, A),
    slot,
    execute: async () => slowA.promise,
    apply: () => undefined,
    onError: (next) => { error = next; return undefined; },
    onLoadingChange: (next) => { loading = next; return undefined; },
  });
  const b = runScopedStoreRead({
    scope,
    stamp: authenticate(scope, B),
    slot,
    execute: async () => slowB.promise,
    apply: (next) => { value = next; return undefined; },
    onError: (next) => { error = next; return undefined; },
    onLoadingChange: (next) => { loading = next; return undefined; },
  });

  const staleError = new Error('stale-A');
  slowA.reject(staleError);
  assert.deepEqual(await a, { kind: 'discarded' });
  assert.equal(error, null);
  assert.equal(loading, true);

  slowB.resolve('B:value');
  assert.deepEqual(await b, { kind: 'committed' });
  assert.equal(value, 'B:value');
  assert.equal(loading, false);
});

test('discards a read when sign-out is followed by replacement with the same account', async () => {
  const scope = createAccountScope();
  const slot = createLatestReadSlot();
  const slowRead = deferred<string>();
  let applied = false;
  const oldStamp = authenticate(scope, A);
  const read = runScopedStoreRead({
    scope,
    stamp: oldStamp,
    slot,
    execute: async () => slowRead.promise,
    apply: () => { applied = true; return undefined; },
  });

  assert.equal(scope.signOut().kind, 'ready');
  const replacementStamp = authenticate(scope, A);
  assert.notEqual(replacementStamp, oldStamp);
  slowRead.resolve('old-value');

  assert.deepEqual(await read, { kind: 'discarded' });
  assert.equal(applied, false);
});

test('keeps a pending read eligible when its stamp is refreshed', async () => {
  const scope = createAccountScope();
  const slot = createLatestReadSlot();
  const slowRead = deferred<string>();
  let value: string | null = null;
  const stamp = authenticate(scope, A);
  const read = runScopedStoreRead({
    scope,
    stamp,
    slot,
    execute: async () => slowRead.promise,
    apply: (next) => { value = next; return undefined; },
  });

  assert.equal(scope.refresh(stamp), true);
  slowRead.resolve('refreshed');

  assert.deepEqual(await read, { kind: 'committed' });
  assert.equal(value, 'refreshed');
});

test('keeps loading true until the newer same-account lease settles', async () => {
  const scope = createAccountScope();
  const slot = createLatestReadSlot();
  const first = deferred<string>();
  const second = deferred<string>();
  let loading = false;
  let value: string | null = null;
  const stamp = authenticate(scope, A);
  const earlier = runScopedStoreRead({
    scope,
    stamp,
    slot,
    execute: async () => first.promise,
    apply: (next) => { value = `first:${next}`; return undefined; },
    onLoadingChange: (next) => { loading = next; return undefined; },
  });
  const newer = runScopedStoreRead({
    scope,
    stamp,
    slot,
    execute: async () => second.promise,
    apply: (next) => { value = `second:${next}`; return undefined; },
    onLoadingChange: (next) => { loading = next; return undefined; },
  });

  first.resolve('old');
  assert.deepEqual(await earlier, { kind: 'discarded' });
  assert.equal(value, null);
  assert.equal(loading, true);

  second.resolve('new');
  assert.deepEqual(await newer, { kind: 'committed' });
  assert.equal(value, 'second:new');
  assert.equal(loading, false);
});

test('cancels the current lease and rejects an identical-sequence impersonator', () => {
  const slot = createLatestReadSlot();
  const lease = slot.begin();
  const impersonator = { sequence: lease.sequence };

  assert.equal(Object.isFrozen(lease), true);
  assert.equal(slot.isCurrent(impersonator), false);
  assert.equal(slot.finish(impersonator), false);
  slot.cancel();
  assert.equal(slot.isCurrent(lease), false);
  assert.equal(slot.finish(lease), false);
});
