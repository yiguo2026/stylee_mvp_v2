import assert from 'node:assert';
import { test } from 'node:test';

import { createAccountScope, type AccountScope, type AccountStamp } from '@stymobile/core';

import {
  createAuthSessionCoordinator,
  type AuthEffect,
} from './authSessionCoordinator.ts';

type SyntheticSession = Readonly<{
  user: Readonly<{ id: string }>;
  refresh_token: string;
  visibleRevision: string;
}>;

const session = (accountId: string, marker: string): SyntheticSession => ({
  user: { id: accountId },
  refresh_token: marker,
  visibleRevision: marker,
});

function createHarness(options: Readonly<{ failResetAt?: number }> = {}) {
  const order: string[] = [];
  const published: Array<SyntheticSession | null> = [];
  let resetCount = 0;
  const scope = createAccountScope([() => {
    resetCount += 1;
    order.push('reset');
    if (resetCount === options.failResetAt) throw new Error('private-reset-detail');
    return undefined;
  }]);
  const coordinator = createAuthSessionCoordinator<SyntheticSession>({
    scope,
    publishSession(next) {
      published.push(next);
      order.push(`publish:${next?.visibleRevision ?? 'null'}`);
      return undefined;
    },
  });

  return {
    coordinator,
    order,
    published,
    scope,
    resetCount: () => resetCount,
  };
}

function expectEffectKind<T extends AuthEffect['kind']>(effect: AuthEffect, kind: T): undefined {
  assert.equal(effect.kind, kind);
  return undefined;
}

function expectStampEffectKind(
  effect: AuthEffect,
  kind: 'load_account' | 'password_recovery',
): asserts effect is Readonly<{
  kind: 'load_account' | 'password_recovery';
  stamp: AccountStamp;
}> {
  assert.equal(effect.kind, kind);
}

test('INITIAL_SESSION resets an anonymous Core scope before publishing and loading A', () => {
  const order: string[] = [];
  const published: SyntheticSession[] = [];
  let scope!: AccountScope;
  scope = createAccountScope([() => {
    assert.equal(scope.capture(), null);
    order.push('reset');
    return undefined;
  }]);
  const coordinator = createAuthSessionCoordinator<SyntheticSession>({
    scope,
    publishSession(next) {
      if (next === null) throw new Error('unexpected_anonymous_publish');
      published.push(next);
      order.push(`publish:${next.visibleRevision}`);
      return undefined;
    },
  });
  const a = session('account-a', 'A-initial-marker');

  const effect = coordinator.accept('INITIAL_SESSION', a);
  order.push(`effect:${effect.kind}`);

  expectStampEffectKind(effect, 'load_account');
  assert.equal(effect.stamp, scope.capture());
  assert.equal(effect.stamp.accountId, 'account-a');
  assert.equal(published[0], a);
  assert.deepEqual(order, ['reset', 'publish:A-initial-marker', 'effect:load_account']);
  assert.deepEqual(coordinator.current(), {
    phase: 'authenticated', accountId: 'account-a', stamp: effect.stamp, signalSerial: 1,
  });
});

test('listener INITIAL_SESSION wins over a fallback started at the old serial', () => {
  const { coordinator, published, resetCount } = createHarness();
  const a = session('account-a', 'A-listener-marker');
  const startedAtSerial = coordinator.signalSerial();

  const listenerEffect = coordinator.accept('INITIAL_SESSION', a);
  const fallbackEffect = coordinator.acceptFallback(startedAtSerial, { session: a, error: null });

  expectEffectKind(listenerEffect, 'load_account');
  expectEffectKind(fallbackEffect, 'none');
  assert.equal(resetCount(), 1);
  assert.deepEqual(published, [a]);
});

test('fallback loads once and an identical later INITIAL_SESSION republishes only the latest object', () => {
  const { coordinator, published, resetCount, scope } = createHarness();
  const fallbackA = session('account-a', 'A-shared-marker');
  const listenerA = session('account-a', 'A-shared-marker');
  const startedAtSerial = coordinator.signalSerial();

  const fallbackEffect = coordinator.acceptFallback(startedAtSerial, { session: fallbackA, error: null });
  const originalStamp = scope.capture();
  const listenerEffect = coordinator.accept('INITIAL_SESSION', listenerA);

  expectEffectKind(fallbackEffect, 'load_account');
  expectEffectKind(listenerEffect, 'none');
  assert.equal(resetCount(), 1);
  assert.equal(scope.capture(), originalStamp);
  assert.deepEqual(published, [fallbackA, listenerA]);
});

test('two null bootstrap signals reset and publish anonymous only once', () => {
  const { coordinator, order, published, resetCount } = createHarness();

  const first = coordinator.accept('INITIAL_SESSION', null);
  const second = coordinator.accept('INITIAL_SESSION', null);

  expectEffectKind(first, 'anonymous');
  expectEffectKind(second, 'none');
  assert.equal(resetCount(), 1);
  assert.deepEqual(published, [null]);
  assert.deepEqual(order, ['reset', 'publish:null']);
  assert.deepEqual(coordinator.current(), {
    phase: 'anonymous', accountId: null, stamp: null, signalSerial: 2,
  });
});

test('A to B and A to SIGNED_OUT to A invalidate the old account stamp before publishing', () => {
  const direct = createHarness();
  direct.coordinator.accept('INITIAL_SESSION', session('account-a', 'A-direct-marker'));
  const directOldStamp = direct.scope.capture();
  const directEffect = direct.coordinator.accept('SIGNED_IN', session('account-b', 'B-direct-marker'));
  const directNewStamp = direct.scope.capture();

  expectEffectKind(directEffect, 'load_account');
  assert.notEqual(directOldStamp, null);
  assert.notEqual(directNewStamp, null);
  assert.notEqual(directNewStamp, directOldStamp);
  assert.equal(direct.scope.isCurrent(directOldStamp!), false);
  assert.deepEqual(direct.order, [
    'reset', 'publish:A-direct-marker', 'reset', 'publish:B-direct-marker',
  ]);

  const signedOut = createHarness();
  signedOut.coordinator.accept('INITIAL_SESSION', session('account-a', 'A-first-marker'));
  const signedOutOldStamp = signedOut.scope.capture();
  expectEffectKind(signedOut.coordinator.accept('SIGNED_OUT', null), 'anonymous');
  const signedOutEffect = signedOut.coordinator.accept('SIGNED_IN', session('account-a', 'A-second-marker'));
  const signedOutNewStamp = signedOut.scope.capture();

  expectEffectKind(signedOutEffect, 'load_account');
  assert.notEqual(signedOutOldStamp, null);
  assert.notEqual(signedOutNewStamp, null);
  assert.notEqual(signedOutNewStamp, signedOutOldStamp);
  assert.equal(signedOut.scope.isCurrent(signedOutOldStamp!), false);
  assert.deepEqual(signedOut.order, [
    'reset', 'publish:A-first-marker',
    'reset', 'publish:null',
    'reset', 'publish:A-second-marker',
  ]);
});

test('same-epoch SIGNED_IN, TOKEN_REFRESHED, and USER_UPDATED republish without reset or reload', () => {
  const { coordinator, published, resetCount, scope } = createHarness();
  const initial = session('account-a', 'A-old-marker');
  const repeatedSignIn = session('account-a', 'A-old-marker');
  const refreshed = session('account-a', 'A-new-marker');
  const updated = session('account-a', 'A-new-marker');

  expectEffectKind(coordinator.accept('INITIAL_SESSION', initial), 'load_account');
  const stamp = scope.capture();
  expectEffectKind(coordinator.accept('SIGNED_IN', repeatedSignIn), 'none');
  expectEffectKind(coordinator.accept('TOKEN_REFRESHED', refreshed), 'none');
  expectEffectKind(coordinator.accept('USER_UPDATED', updated), 'none');

  assert.equal(resetCount(), 1);
  assert.equal(scope.capture(), stamp);
  assert.deepEqual(published, [initial, repeatedSignIn, refreshed, updated]);
});

test('SIGNED_IN with a marker different from the latest refresh creates a new epoch and load effect', () => {
  const { coordinator, resetCount, scope } = createHarness();
  expectEffectKind(coordinator.accept('INITIAL_SESSION', session('account-a', 'A-old-marker')), 'load_account');
  const oldStamp = scope.capture();
  expectEffectKind(coordinator.accept('TOKEN_REFRESHED', session('account-a', 'A-refreshed-marker')), 'none');

  const signedIn = coordinator.accept('SIGNED_IN', session('account-a', 'A-new-signin-marker'));
  const newStamp = scope.capture();

  expectStampEffectKind(signedIn, 'load_account');
  assert.equal(signedIn.stamp, newStamp);
  assert.notEqual(newStamp, oldStamp);
  assert.equal(scope.isCurrent(oldStamp!), false);
  assert.equal(resetCount(), 2);
});

test('booting TOKEN_REFRESHED establishes one scope before an identical INITIAL_SESSION', () => {
  const { coordinator, published, resetCount, scope } = createHarness();
  const refreshed = session('account-a', 'A-recovery-marker');
  const initial = session('account-a', 'A-recovery-marker');

  const refreshEffect = coordinator.accept('TOKEN_REFRESHED', refreshed);
  const refreshStamp = scope.capture();
  const initialEffect = coordinator.accept('INITIAL_SESSION', initial);

  expectStampEffectKind(refreshEffect, 'load_account');
  expectEffectKind(initialEffect, 'none');
  assert.equal(refreshEffect.stamp, refreshStamp);
  assert.equal(scope.capture(), refreshStamp);
  assert.equal(resetCount(), 1);
  assert.deepEqual(published, [refreshed, initial]);
});

test('post-bootstrap refresh, update, and MFA signals block null and cross-account sessions', () => {
  const events = ['TOKEN_REFRESHED', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED'] as const;
  const candidates = [
    { name: 'null', value: null },
    { name: 'another account', value: session('account-b', 'B-mismatch-marker') },
  ] as const;

  for (const event of events) {
    for (const candidate of candidates) {
      const harness = createHarness();
      const a = session('account-a', `A-${event}-${candidate.name}`);
      harness.coordinator.accept('INITIAL_SESSION', a);

      const effect = harness.coordinator.accept(event, candidate.value);

      assert.deepEqual(effect, { kind: 'blocked', reason: 'scope_mismatch' });
      assert.equal(harness.resetCount(), 2);
      assert.deepEqual(harness.published, [a, null]);
      assert.deepEqual(harness.coordinator.current(), {
        phase: 'blocked', accountId: null, stamp: null, signalSerial: 2,
      });
    }
  }
});

test('PASSWORD_RECOVERY creates or refreshes the valid current scope with a dedicated effect', () => {
  const { coordinator, published, resetCount, scope } = createHarness();
  const first = session('account-a', 'A-password-first');
  const second = session('account-a', 'A-password-second');

  const created = coordinator.accept('PASSWORD_RECOVERY', first);
  const stamp = scope.capture();
  const refreshed = coordinator.accept('PASSWORD_RECOVERY', second);

  assert.deepEqual(created, { kind: 'password_recovery', stamp });
  assert.deepEqual(refreshed, { kind: 'password_recovery', stamp });
  assert.equal(scope.capture(), stamp);
  assert.equal(resetCount(), 1);
  assert.deepEqual(published, [first, second]);
});

test('a failed A to B reset never publishes B and permanently blocks automatic retry and resume', () => {
  const { coordinator, order, published, resetCount } = createHarness({ failResetAt: 2 });
  const a = session('account-a', 'A-before-failure');
  const b = session('account-b', 'B-private-marker');
  coordinator.accept('INITIAL_SESSION', a);

  const failed = coordinator.accept('SIGNED_IN', b);
  const orderAfterFailure = [...order];
  const later = coordinator.accept('SIGNED_IN', b);
  const resumed = coordinator.resume();

  assert.deepEqual(failed, { kind: 'blocked', reason: 'scope_transition_failed' });
  assert.deepEqual(later, failed);
  assert.deepEqual(resumed, failed);
  assert.equal(resetCount(), 2);
  assert.deepEqual(published, [a, null]);
  assert.deepEqual(order, orderAfterFailure);
  assert.equal(published.includes(b), false);
  assert.deepEqual(coordinator.current(), {
    phase: 'blocked', accountId: null, stamp: null, signalSerial: 3,
  });
});

test('fallback errors block only a current boot and fallback completion after an auth signal is ignored', () => {
  const failed = createHarness();
  const failedSerial = failed.coordinator.signalSerial();
  const failure = failed.coordinator.acceptFallback(failedSerial, {
    session: null,
    error: new Error('A-fallback-secret-marker'),
  });

  assert.deepEqual(failure, { kind: 'blocked', reason: 'bootstrap_failed' });
  assert.equal(failed.resetCount(), 1);
  assert.deepEqual(failed.published, [null]);
  assert.deepEqual(failed.coordinator.current(), {
    phase: 'blocked', accountId: null, stamp: null, signalSerial: 0,
  });

  const stale = createHarness();
  const staleSerial = stale.coordinator.signalSerial();
  const listener = session('account-a', 'A-listener-before-fallback');
  stale.coordinator.accept('INITIAL_SESSION', listener);
  const orderBeforeFallback = [...stale.order];

  const ignored = stale.coordinator.acceptFallback(staleSerial, {
    session: session('account-b', 'B-stale-fallback-marker'), error: null,
  });

  assert.deepEqual(ignored, { kind: 'none' });
  assert.deepEqual(stale.order, orderBeforeFallback);
  assert.deepEqual(stale.published, [listener]);
});

test('empty or untrimmed account IDs and refresh markers block without exposing invalid values', () => {
  const invalid = [
    session('', 'empty-account-marker'),
    session(' account-secret ', 'valid-marker'),
    session('account-secret', ''),
    session('account-secret', ' marker-secret '),
  ];

  for (const candidate of invalid) {
    const harness = createHarness();
    const effect = harness.coordinator.accept('INITIAL_SESSION', candidate);
    const serialized = JSON.stringify({ effect, state: harness.coordinator.current() });

    assert.deepEqual(effect, { kind: 'blocked', reason: 'invalid_session' });
    assert.equal(harness.resetCount(), 1);
    assert.deepEqual(harness.published, [null]);
    assert.equal(serialized.includes(candidate.user.id), candidate.user.id === '');
    assert.equal(serialized.includes(candidate.refresh_token), candidate.refresh_token === '');
  }
});

test('public states, effects, and fallback error serialization never expose refresh markers', () => {
  const firstMarker = 'A-super-secret-refresh-marker';
  const secondMarker = 'A-new-super-secret-refresh-marker';
  const authenticated = createHarness();
  const effects: AuthEffect[] = [];
  effects.push(authenticated.coordinator.accept('INITIAL_SESSION', session('account-a', firstMarker)));
  effects.push(authenticated.coordinator.accept('TOKEN_REFRESHED', session('account-a', secondMarker)));
  effects.push(authenticated.coordinator.resume());

  const blocked = createHarness();
  effects.push(blocked.coordinator.acceptFallback(blocked.coordinator.signalSerial(), {
    session: null,
    error: new Error(`${firstMarker}:${secondMarker}`),
  }));
  effects.push(blocked.coordinator.resume());

  const serialized = JSON.stringify({
    states: [authenticated.coordinator.current(), blocked.coordinator.current()],
    effects,
  });
  assert.equal(serialized.includes(firstMarker), false);
  assert.equal(serialized.includes(secondMarker), false);
  assert.equal(serialized.includes('refresh_token'), false);
});
