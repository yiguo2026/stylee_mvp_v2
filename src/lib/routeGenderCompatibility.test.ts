import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope, type AccountStamp } from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';

import { resolveRouteGenderCompat } from './routeGenderCompatibility.ts';
import { createLatestReadSlot, runScopedStoreRead } from './scopedStoreRead.ts';

const A = 'account-a' as AccountId;
const B = 'account-b' as AccountId;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function authenticate(accountId: AccountId) {
  const scope = createAccountScope();
  assert.equal(scope.replaceAccount(accountId).kind, 'ready');
  const stamp = scope.capture();
  if (stamp === null) throw new Error('expected_authenticated_scope');
  return { scope, stamp };
}

test('zero-argument compatibility captures the current stamp and stale settlement cannot apply', async () => {
  const { scope, stamp: stampA } = authenticate(A);
  const slot = createLatestReadSlot();
  const pendingA = deferred<string>();
  let delegatedStamp: AccountStamp | null = null;
  let appliedGender: string | null = null;

  const readA = resolveRouteGenderCompat({
    scope,
    resolve: async (stamp) => {
      delegatedStamp = stamp;
      await runScopedStoreRead({
        scope,
        stamp,
        slot,
        execute: async () => pendingA.promise,
        apply: (gender) => {
          appliedGender = gender;
          return undefined;
        },
      });
      return appliedGender;
    },
  });

  assert.equal(delegatedStamp, stampA);
  assert.equal(scope.replaceAccount(B).kind, 'ready');
  pendingA.resolve('female');

  assert.equal(await readA, null);
  assert.equal(appliedGender, null);
});

test('explicit compatibility calls delegate the supplied stamp unchanged', async () => {
  const { scope, stamp } = authenticate(A);
  let delegatedStamp: AccountStamp | null = null;

  const gender = await resolveRouteGenderCompat({
    scope,
    stamp,
    resolve: async (nextStamp) => {
      delegatedStamp = nextStamp;
      return 'other';
    },
  });

  assert.equal(delegatedStamp, stamp);
  assert.equal(gender, 'other');
});

test('anonymous compatibility calls return null without invoking the resolver', async () => {
  const scope = createAccountScope();
  let resolveCalls = 0;

  assert.equal(await resolveRouteGenderCompat({
    scope,
    resolve: async () => {
      resolveCalls += 1;
      return 'private';
    },
  }), null);
  assert.equal(resolveCalls, 0);
});
