import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope, type ScopeResetter } from '@stymobile/core';

import { createPrivateResetRegistry } from './accountScopeRuntime.ts';

const A = 'account-a' as const;

test('blocks a transition until resetters are installed', () => {
  const registry = createPrivateResetRegistry();
  const scope = createAccountScope([registry.dispatch]);

  assert.equal(scope.replaceAccount(A).kind, 'blocked');
  assert.equal(scope.capture(), null);
});

test('runs all resetters in fixed order and strips thrown details', () => {
  const calls: string[] = [];
  const registry = createPrivateResetRegistry();
  registry.install([
    () => { calls.push('one'); throw new Error('private-A-detail'); },
    () => { calls.push('two'); return undefined; },
  ]);

  assert.throws(registry.dispatch, /private_reset_failed/);
  assert.deepEqual(calls, ['one', 'two']);
  try {
    registry.dispatch();
  } catch (error) {
    assert.equal(String(error).includes('private-A-detail'), false);
  }
});

test('rejects duplicate install and asynchronous resetters', async () => {
  const registry = createPrivateResetRegistry();
  registry.install([() => undefined]);
  assert.throws(() => registry.install([() => undefined]), /private_resetters_already_installed/);

  const asyncRegistry = createPrivateResetRegistry();
  asyncRegistry.install([(() => Promise.resolve()) as unknown as ScopeResetter]);
  assert.throws(asyncRegistry.dispatch, /private_reset_failed/);
  await Promise.resolve();
});
