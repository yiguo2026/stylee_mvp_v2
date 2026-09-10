import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signInUsername, type LoginAttempt } from './loginAuthFlow.ts';

const session = { user: { id: 'account-a' } };
function harness(attempts: LoginAttempt<typeof session>[], username = ' Alice_1 ') {
  const calls: Array<[string, string]> = [];
  const result = signInUsername({ username, password: 'secret', signIn: async (email, password) => {
    calls.push([email, password]);
    const attempt = attempts.shift();
    assert.ok(attempt, 'unexpected additional Auth request');
    return attempt;
  } });
  return { calls, result };
}

test('encoded email success makes one Auth request and preserves returned session', async () => {
  const h = harness([{ session, errorMessage: null }]);
  assert.deepEqual(await h.result, { session, errorMessage: null, rateLimited: false });
  assert.deepEqual(h.calls, [['~alice_1@users.stylee.app', 'secret']]);
});

test('credential failure permits one legacy Auth attempt when email differs', async () => {
  const h = harness([
    { session: null, errorMessage: 'Invalid login credentials' },
    { session, errorMessage: null },
  ]);
  assert.deepEqual(await h.result, { session, errorMessage: null, rateLimited: false });
  assert.deepEqual(h.calls, [
    ['~alice_1@users.stylee.app', 'secret'], ['alice_1@users.stylee.app', 'secret'],
  ]);
});

test('equal addresses do not retry credential failure', async () => {
  const h = harness([{ session: null, errorMessage: 'Invalid login credentials' }], ' alice ');
  assert.deepEqual(await h.result, { session: null, errorMessage: '账号或密码错误', rateLimited: false });
  assert.deepEqual(h.calls, [['alice@users.stylee.app', 'secret']]);
});

test('two credential failures return generic credential error with only an Auth port', async () => {
  const h = harness([
    { session: null, errorMessage: 'Invalid login credentials' },
    { session: null, errorMessage: 'Invalid password' },
  ]);
  assert.deepEqual(await h.result, { session: null, errorMessage: '账号或密码错误', rateLimited: false });
  assert.equal(h.calls.length, 2);
});

for (const [message, expected, rateLimited] of [
  ['Too many requests', '尝试次数过多，请稍后再试', true],
  ['Rate limit exceeded', '尝试次数过多，请稍后再试', true],
  ['Network request failed', '网络连接失败，请检查网络', false],
  ['fetch failed', '网络连接失败，请检查网络', false],
  ['login timeout', '网络连接失败，请检查网络', false],
  ['Invalid API key', '登录服务暂不可用，请稍后再试', false],
  ['Email not confirmed', '账号未验证', false],
  ['Unexpected failure', '登录失败，请稍后再试', false],
] as const) {
  test(`${message} returns classified error without retry`, async () => {
    const h = harness([{ session: null, errorMessage: message }]);
    assert.deepEqual(await h.result, { session: null, errorMessage: expected, rateLimited });
    assert.equal(h.calls.length, 1);
  });
}

test('legacy rate limit is surfaced and starts cooldown instead of hiding behind first credential error', async () => {
  const h = harness([
    { session: null, errorMessage: 'Invalid login credentials' },
    { session: null, errorMessage: 'Too many requests' },
  ]);
  assert.deepEqual(await h.result, {
    session: null, errorMessage: '尝试次数过多，请稍后再试', rateLimited: true,
  });
  assert.equal(h.calls.length, 2);
});

test('a rejected network attempt is classified and never retried', async () => {
  let calls = 0;
  const result = await signInUsername({ username: 'Alice', password: 'secret', signIn: async () => {
    calls += 1;
    throw new Error('Network request failed');
  } });
  assert.deepEqual(result, { session: null, errorMessage: '网络连接失败，请检查网络', rateLimited: false });
  assert.equal(calls, 1);
});

test('a successful response without session retains the existing retry copy', async () => {
  const h = harness([{ session: null, errorMessage: null }]);
  assert.deepEqual(await h.result, { session: null, errorMessage: '登录失败，请重试', rateLimited: false });
  assert.equal(h.calls.length, 1);
});
