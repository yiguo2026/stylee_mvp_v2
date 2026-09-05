import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountScope } from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';
import { createAuthSessionCoordinator, type AuthEffect } from './authSessionCoordinator.ts';
import { runAuthEffect, type AuthEffectPorts } from './authEffectRunner.ts';

function harness() {
  const scope = createAccountScope([]);
  const calls: string[] = [];
  const ports: AuthEffectPorts = {
    activateImportOwner: (id) => { calls.push(`owner:${id}`); },
    hydrate: (id) => { calls.push(`hydrate:${id}`); },
    resolveGender: async (stamp) => { calls.push(`gender:${stamp.accountId}`); return null; },
    startProfileRead: () => { calls.push('profile'); },
    navigate: (path) => { calls.push(`route:${path}`); },
    notifyBlocked: (message) => { calls.push(`toast:${message}`); },
  };
  const account = (id: string) => {
    assert.equal(scope.replaceAccount(id as AccountId).kind, 'ready');
    const stamp = scope.capture();
    assert.ok(stamp);
    return stamp;
  };
  return { scope, calls, ports, account, publicPreview: false, isEffectCurrent: (_effect: AuthEffect) => true };
}

test('replacement discards paused A before profile or navigation while B hydrates and routes', async () => {
  const h = harness();
  const a = h.account('A');
  let finishA!: (gender: string | null) => void;
  h.ports.resolveGender = (stamp) => {
    h.calls.push(`gender:${stamp.accountId}`);
    return stamp.accountId === 'A'
      ? new Promise((resolve) => { finishA = resolve; })
      : Promise.resolve('female');
  };
  const pendingA = runAuthEffect({ kind: 'load_account', stamp: a }, h);
  assert.deepEqual(h.calls, ['owner:A', 'hydrate:A', 'gender:A']);
  const b = h.account('B');
  h.calls.length = 0;
  assert.equal(await runAuthEffect({ kind: 'load_account', stamp: b }, h), 'applied');
  assert.deepEqual(h.calls, ['owner:B', 'hydrate:B', 'gender:B', 'profile', 'route:/(tabs)']);
  h.calls.length = 0;
  finishA('private');
  assert.equal(await pendingA, 'discarded');
  assert.deepEqual(h.calls, []);
});

for (const gender of ['private', 'female', 'male', 'other', '', 'PRIVATE', null]) {
  test(`only exact private routes to onboarding: ${String(gender)}`, async () => {
    const h = harness();
    const stamp = h.account('B');
    h.ports.resolveGender = async () => gender;
    await runAuthEffect({ kind: 'load_account', stamp }, h);
    assert.equal(h.calls.at(-1), gender === 'private'
      ? 'route:/onboarding/step1-info' : 'route:/(tabs)');
  });
}

for (const kind of ['load_account', 'password_recovery'] as const) {
  test(`${kind} stale on entry invokes no port`, async () => {
    const h = harness();
    const stamp = h.account('A');
    h.account('B');
    assert.equal(await runAuthEffect({ kind, stamp }, h), 'discarded');
    assert.deepEqual(h.calls, []);
  });

  test(`${kind} checks again before route if profile start replaces the account`, async () => {
    const h = harness();
    const stamp = h.account('A');
    h.ports.startProfileRead = () => { h.calls.push('profile'); h.account('B'); };
    assert.equal(await runAuthEffect({ kind, stamp }, h), 'discarded');
    assert.ok(h.calls.includes('profile'));
    assert.equal(h.calls.some((call) => call.startsWith('route:')), false);
  });
}

test('replacement during owner activation prevents stale hydration', async () => {
  const h = harness();
  const stamp = h.account('A');
  h.ports.activateImportOwner = () => { h.calls.push('owner:A'); h.account('B'); };
  assert.equal(await runAuthEffect({ kind: 'load_account', stamp }, h), 'discarded');
  assert.deepEqual(h.calls, ['owner:A']);
});

test('password recovery activates owner and starts profile without waiting for gender', async () => {
  const h = harness();
  const stamp = h.account('A');
  h.ports.resolveGender = () => new Promise(() => {});
  assert.equal(await runAuthEffect({ kind: 'password_recovery', stamp }, h), 'applied');
  assert.deepEqual(h.calls, ['owner:A', 'profile', 'route:/profile/change-password']);
});

test('anonymous routes to login; blocked notifies before routing; none has no effects', async () => {
  const h = harness();
  assert.equal(await runAuthEffect({ kind: 'none' }, h), 'discarded');
  assert.deepEqual(h.calls, []);
  assert.equal(await runAuthEffect({ kind: 'anonymous' }, h), 'applied');
  assert.deepEqual(h.calls, ['route:/(auth)/login']);
  h.calls.length = 0;
  assert.equal(await runAuthEffect({ kind: 'blocked', reason: 'bootstrap_failed' }, h), 'applied');
  assert.deepEqual(h.calls, [
    'toast:账号状态异常，请刷新应用后重新登录', 'route:/(auth)/login',
  ]);
});

test('public preview suppresses every effect including blocked toast and private reads', async () => {
  const h = harness();
  const stamp = h.account('A');
  h.publicPreview = true;
  const effects: AuthEffect[] = [
    { kind: 'none' }, { kind: 'anonymous' },
    { kind: 'blocked', reason: 'bootstrap_failed' },
    { kind: 'load_account', stamp }, { kind: 'password_recovery', stamp },
  ];
  for (const effect of effects) assert.equal(await runAuthEffect(effect, h), 'discarded');
  assert.deepEqual(h.calls, []);
});

test('entering preview while gender is pending suppresses subsequent private effects', async () => {
  const h = harness();
  const stamp = h.account('A');
  let finish!: (gender: string) => void;
  h.ports.resolveGender = () => new Promise((resolve) => { finish = resolve; });
  const pending = runAuthEffect({ kind: 'load_account', stamp }, h);
  h.calls.length = 0;
  h.publicPreview = true;
  finish('private');
  assert.equal(await pending, 'discarded');
  assert.deepEqual(h.calls, []);
});

test('pending load cannot override same-marker recovery, while token refresh preserves pending load', async () => {
  for (const event of ['PASSWORD_RECOVERY', 'TOKEN_REFRESHED'] as const) {
    const h = harness();
    const coordinator = createAuthSessionCoordinator({ scope: h.scope, publishSession: () => undefined });
    h.isEffectCurrent = coordinator.isEffectCurrent;
    const session = { user: { id: 'A' }, refresh_token: 'a-1' };
    const load = coordinator.accept('INITIAL_SESSION', session);
    let finish!: (gender: string) => void;
    h.ports.resolveGender = () => new Promise((resolve) => { finish = resolve; });
    const pending = runAuthEffect(load, h);
    const next = coordinator.accept(event, { ...session, refresh_token: event === 'PASSWORD_RECOVERY' ? 'a-1' : 'a-2' });
    h.calls.length = 0;
    assert.equal(await runAuthEffect(next, h), event === 'PASSWORD_RECOVERY' ? 'applied' : 'discarded');
    assert.deepEqual(h.calls, event === 'PASSWORD_RECOVERY'
      ? ['owner:A', 'profile', 'route:/profile/change-password'] : []);
    h.calls.length = 0;
    finish('private');
    assert.equal(await pending, event === 'PASSWORD_RECOVERY' ? 'discarded' : 'applied');
    assert.deepEqual(h.calls, event === 'PASSWORD_RECOVERY'
      ? [] : ['profile', 'route:/onboarding/step1-info']);
  }
});

test('replaced anonymous, blocked, and copied current effects produce no side effects', async () => {
  const h = harness();
  const coordinator = createAuthSessionCoordinator({ scope: h.scope, publishSession: () => undefined });
  h.isEffectCurrent = coordinator.isEffectCurrent;
  const anonymous = coordinator.accept('INITIAL_SESSION', null);
  const blocked = coordinator.accept('TOKEN_REFRESHED', null);
  const current = coordinator.resume();
  for (const effect of [anonymous, blocked, { ...current }]) {
    assert.equal(await runAuthEffect(effect, h), 'discarded');
  }
  assert.deepEqual(h.calls, []);
});

test('same-stamp effect replacement during profile start prevents old navigation', async () => {
  const h = harness();
  const coordinator = createAuthSessionCoordinator({ scope: h.scope, publishSession: () => undefined });
  h.isEffectCurrent = coordinator.isEffectCurrent;
  const session = { user: { id: 'A' }, refresh_token: 'a-1' };
  const effect = coordinator.accept('INITIAL_SESSION', session);
  h.ports.startProfileRead = () => { coordinator.accept('PASSWORD_RECOVERY', session); };
  assert.equal(await runAuthEffect(effect, h), 'discarded');
  assert.equal(h.calls.some((call) => call.startsWith('route:')), false);
});
