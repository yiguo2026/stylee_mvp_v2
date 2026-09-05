import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import RootLayout from '../app/_layout.tsx';
import { completeBootstrap, deferGender, emitAuth, observations, resetHarness, setPath,
  syntheticSession, webAuthCoordinator } from './test-fixtures/rootRoute/platform.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const event of ['PASSWORD_RECOVERY', 'TOKEN_REFRESHED']) {
  test(`RootLayout preserves current route intent through ${event}`, async () => {
    resetHarness('/wardrobe/private-item');
    const finish = deferGender();
    let root;
    await act(async () => { root = create(React.createElement(RootLayout)); completeBootstrap(syntheticSession()); });
    try {
      await act(async () => { emitAuth(event, event === 'PASSWORD_RECOVERY'
        ? syntheticSession() : { ...syntheticSession(), refresh_token: 'synthetic-refresh' }); });
      await act(async () => { finish('female'); });
      assert.deepEqual(observations.routes, [event === 'PASSWORD_RECOVERY' ? '/profile/change-password' : '/(tabs)']);
      assert.equal(observations.navigationWithoutRoute, 0);
    } finally { await act(async () => root.unmount()); }
  });
}

test('RootLayout never mounts private deep-link content during delayed bootstrap', async () => {
  resetHarness('/wardrobe/private-item');
  let root;
  await act(async () => { root = create(React.createElement(RootLayout)); });
  try {
    assert.equal(observations.privateMounts, 0);
    assert.equal(observations.authCallbacks, 1);
    assert.match(JSON.stringify(root.toJSON()), /正在恢复账号/);
    await act(async () => { completeBootstrap(syntheticSession()); });
    assert.equal(observations.privateMounts, 1);
  } finally { await act(async () => root.unmount()); }
});

test('RootLayout persistently excludes private routes after reset failure with a real reload action', async () => {
  resetHarness('/wardrobe/private-item', 2);
  let root;
  await act(async () => { root = create(React.createElement(RootLayout)); completeBootstrap(syntheticSession()); });
  try {
    assert.equal(observations.privateMounts, 1);
    await act(async () => { assert.equal(emitAuth('SIGNED_IN', syntheticSession('B')), undefined); });
    assert.equal(webAuthCoordinator.current().phase, 'blocked');
    assert.equal(root.root.findAllByType('private-sentinel').length, 0);
    assert.equal(observations.privateUnmounts, 1);
    const blockedMountCount = observations.privateMounts;
    await act(async () => { emitAuth('SIGNED_IN', syntheticSession('B')); });
    assert.equal(observations.privateMounts, blockedMountCount);
    assert.equal(observations.resets, 2);
    assert.equal(observations.navigationWithoutRoute, 0);
    assert.match(JSON.stringify(root.toJSON()), /重新加载|重新打开/);
    const originalWindow = globalThis.window;
    globalThis.window = { location: { reload() { observations.reloads += 1; } } };
    try { root.root.findByType('Pressable').props.onPress(); }
    finally { globalThis.window = originalWindow; }
    assert.equal(observations.reloads, 1);
  } finally { await act(async () => root.unmount()); }
});

test('anonymous bootstrap waits for the root route to mount before navigation', async () => {
  resetHarness('/login');
  let root;
  await act(async () => { root = create(React.createElement(RootLayout)); });
  try {
    await act(async () => { completeBootstrap(null); });
    assert.equal(webAuthCoordinator.current().phase, 'anonymous');
    assert.equal(observations.privateMounts, 1);
    assert.ok(observations.privateEffects > 0);
    assert.equal(observations.navigationWithoutRoute, 0);
  } finally { await act(async () => root.unmount()); }
});

for (const path of ['/outfit-layout-demo', '/wardrobe-preview']) {
  test(`public preview ${path} mounts while booting and blocked without private Auth effects`, async () => {
    process.env.EXPO_PUBLIC_DESIGN_SYSTEM_PREVIEW = '1';
    resetHarness(path, 1);
    let root;
    await act(async () => { root = create(React.createElement(RootLayout)); });
    try {
      assert.equal(observations.previewMounts, 1);
      await act(async () => { completeBootstrap(syntheticSession()); });
      assert.equal(webAuthCoordinator.current().phase, 'blocked');
      assert.equal(root.root.findAllByType('preview-sentinel').length, 1);
      assert.equal(observations.privateEffects, 0);
      setPath('/wardrobe/private-item');
      await act(async () => root.update(React.createElement(RootLayout)));
      assert.equal(observations.privateMounts, 0);
    } finally {
      delete process.env.EXPO_PUBLIC_DESIGN_SYSTEM_PREVIEW;
      await act(async () => root.unmount());
    }
  });
}
