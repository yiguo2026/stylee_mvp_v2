import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { StyleeStickyDecisionBar } from '@/design-system';

import OnboardingStyleRoute from '../app/onboarding/step2-style.tsx';
import ProfileStyleRoute from '../app/profile/style.tsx';
import {
  observations,
  resetHarness,
  setResponseMode,
  settleDeferredRead,
  settleDeferredWrite,
  switchAccount,
  webStylePreferenceController,
} from './test-fixtures/stylePreferences/platform.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function buttons(root, label) {
  return root.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label);
}

function choiceLabels(root) {
  return root.root.findAll((node) => node.type === 'Pressable'
    && node.props.accessibilityRole === 'checkbox').map((node) => node.props.accessibilityLabel);
}

async function mount(Component) {
  let root;
  await act(async () => { root = create(React.createElement(Component)); });
  return root;
}

test('StickyDecisionBar primary disabled, saving, and saved precedence is explicit', async () => {
  for (const expected of [
    { state: 'default', primaryDisabled: false, disabled: false, busy: false },
    { state: 'default', primaryDisabled: true, disabled: true, busy: false },
    { state: 'saving', primaryDisabled: false, disabled: true, busy: true },
    { state: 'saved', primaryDisabled: false, disabled: true, busy: false },
    { state: 'saving', primaryDisabled: true, disabled: true, busy: true },
    { state: 'saved', primaryDisabled: true, disabled: true, busy: false },
  ]) {
    let root;
    await act(async () => {
      root = create(React.createElement(StyleeStickyDecisionBar, {
        primaryLabel: '矩阵主操作',
        onPrimaryPress: () => undefined,
        state: expected.state,
        primaryDisabled: expected.primaryDisabled,
      }));
    });
    try {
      const primary = buttons(root, '矩阵主操作')[0];
      assert.equal(primary.props.disabled, expected.disabled);
      assert.deepEqual(primary.props.accessibilityState, {
        disabled: expected.disabled,
        busy: expected.busy,
      });
    } finally { await act(async () => root.unmount()); }
  }
});

test('both route shells render the same exact ordered server catalog through the shared screen', async () => {
  const rendered = [];
  for (const Route of [OnboardingStyleRoute, ProfileStyleRoute]) {
    resetHarness({ status: 'selected', selectedTagIds: ['minimalist'] });
    const root = await mount(Route);
    try {
      rendered.push(choiceLabels(root).slice(0, 19));
      assert.equal(observations.reads, 1);
      const selected = root.root.find((node) => node.type === 'Pressable'
        && node.props.accessibilityLabel === '极简');
      assert.deepEqual(selected.props.accessibilityState, { checked: true, disabled: false });
      assert.equal(root.root.findAll((node) => node.type === 'Feather' && node.props.name === 'check').length, 1);
      assert.equal(root.root.findAll((node) => node.type === 'ScrollView').length, 1);
    } finally { await act(async () => root.unmount()); }
  }
  assert.deepEqual(rendered[0], rendered[1]);
  assert.deepEqual(rendered[0], [
    '静奢/老钱', '极简', '通勤职场', '法式慵懒', '学院风', '猎装风', '复古年代',
    '街头潮流', '运动机能', '摇滚机车', '哥特暗黑', '甜美少女', '浪漫田园',
    '波西米亚/度假', '西部牛仔', '工装实用', '日系侘寂', '先锋设计师', '都市酷感',
  ]);
});

test('idle mounts load once while ready and read-error renders do not loop', async () => {
  resetHarness();
  const root = await mount(OnboardingStyleRoute);
  try {
    assert.equal(observations.reads, 1);
    assert.equal(buttons(root, '保存并继续')[0].props.disabled, true);
    await act(async () => root.update(React.createElement(OnboardingStyleRoute)));
    assert.equal(observations.reads, 1);
  } finally { await act(async () => root.unmount()); }

  resetHarness({ responseMode: 'read-error' });
  const failed = await mount(OnboardingStyleRoute);
  try {
    assert.equal(observations.reads, 1);
    await act(async () => failed.update(React.createElement(OnboardingStyleRoute)));
    assert.equal(observations.reads, 1);
  } finally { await act(async () => failed.unmount()); }
});

test('idle or loading state without a server never offers the no-op skip action', async () => {
  resetHarness({ responseMode: 'read-deferred' });
  const root = await mount(OnboardingStyleRoute);
  try {
    assert.equal(webStylePreferenceController.getSnapshot().phase, 'loading');
    assert.equal(buttons(root, '暂不设置').length, 0);
    await act(async () => { settleDeferredRead(); await webStylePreferenceController.whenIdle(); });
  } finally { await act(async () => root.unmount()); }
});

test('onboarding save and skip navigate only after their exact confirmed result', async () => {
  resetHarness({ responseMode: 'deferred' });
  let root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    let saving;
    await act(async () => { saving = buttons(root, '保存并继续')[0].props.onPress(); });
    assert.deepEqual(observations.routes, []);
    await act(async () => { settleDeferredWrite(); await saving; });
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);
  } finally { await act(async () => root.unmount()); }

  resetHarness({ responseMode: 'deferred' });
  root = await mount(OnboardingStyleRoute);
  try {
    let skipping;
    await act(async () => { skipping = buttons(root, '暂不设置')[0].props.onPress(); });
    assert.deepEqual(observations.routes, []);
    await act(async () => { settleDeferredWrite(); await skipping; });
    assert.deepEqual(observations.routes, ['/(tabs)']);
  } finally { await act(async () => root.unmount()); }
});

test('onboarding read failure bypass enters home without a server write or query', async () => {
  resetHarness({ responseMode: 'read-error' });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '先进入首页')[0].props.onPress());
    assert.deepEqual(observations.routes, ['/(tabs)']);
    assert.equal(observations.replaces, 0);
    assert.equal(observations.queries, 0);
  } finally { await act(async () => root.unmount()); }
});

test('stale onboarding read-failure bypass is fenced by the initiating account stamp', async () => {
  resetHarness({ responseMode: 'read-error' });
  const root = await mount(OnboardingStyleRoute);
  try {
    const staleBypass = buttons(root, '先进入首页')[0].props.onPress;
    await act(async () => switchAccount('account-b'));
    await act(async () => staleBypass());
    assert.deepEqual(observations.routes, []);
  } finally { await act(async () => root.unmount()); }
});

test('profile save uses back or fallback only after confirmed save', async () => {
  resetHarness({ responseMode: 'deferred' });
  observations.canGoBack = true;
  let root = await mount(ProfileStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    let saving;
    await act(async () => { saving = buttons(root, '保存风格偏好')[0].props.onPress(); });
    assert.equal(observations.backs, 0);
    await act(async () => { settleDeferredWrite(); await saving; });
    assert.equal(observations.backs, 1);
  } finally { await act(async () => root.unmount()); }

  resetHarness();
  observations.canGoBack = false;
  root = await mount(ProfileStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    await act(async () => buttons(root, '保存风格偏好')[0].props.onPress());
    assert.deepEqual(observations.routes, ['/(tabs)/profile']);
  } finally { await act(async () => root.unmount()); }
});

test('double action dispatches once and fixed failure retains the selected draft', async () => {
  resetHarness({ responseMode: 'deferred' });
  let root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    let first;
    await act(async () => {
      const press = buttons(root, '保存并继续')[0].props.onPress;
      first = press();
      press();
    });
    assert.equal(observations.replaces, 1);
    await act(async () => { settleDeferredWrite(); await first; });
  } finally { await act(async () => root.unmount()); }

  resetHarness({ responseMode: 'fixed-error' });
  root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.equal(buttons(root, '极简')[0].props.accessibilityState.checked, true);
    assert.match(JSON.stringify(root.toJSON()), /保存失败，请稍后重试/);
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /raw-provider-private/);
    assert.deepEqual(observations.routes, []);
  } finally { await act(async () => root.unmount()); }
});

test('pending-store write failure renders a finite retryable save error without confirmation action', async () => {
  resetHarness({ responseMode: 'store-write-error' });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.match(JSON.stringify(root.toJSON()), /保存失败，请稍后重试/);
    assert.equal(buttons(root, '保存并继续')[0].props.disabled, false);
    assert.equal(buttons(root, '继续确认').length, 0);
    assert.equal(observations.replaces, 0);
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /raw-storage-private-write/);
  } finally { await act(async () => root.unmount()); }
});

test('unknown result confirms the same operation id before navigation', async () => {
  resetHarness({ responseMode: 'unknown' });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '极简')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.deepEqual(observations.routes, []);
    assert.match(JSON.stringify(root.toJSON()), /保存结果待确认/);
    await act(async () => buttons(root, '继续确认')[0].props.onPress());
    assert.deepEqual(observations.queriedOperationIds, observations.operationIds);
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);
  } finally { await act(async () => root.unmount()); }
});

test('conflict is read-only until explicit overwrite and discloses the latest selection', async () => {
  resetHarness({ responseMode: 'conflict', status: 'selected', selectedTagIds: ['minimalist'] });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '静奢/老钱')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.equal(observations.replaces, 1);
    assert.equal(buttons(root, '静奢/老钱')[0].props.disabled, true);
    assert.match(JSON.stringify(root.toJSON()), /最新已保存：街头潮流/);
    await act(async () => buttons(root, '确认覆盖')[0].props.onPress());
    assert.equal(observations.replaces, 2);
    assert.notEqual(observations.operationIds[0], observations.operationIds[1]);
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);
  } finally { await act(async () => root.unmount()); }
});

test('conflict reload failure offers only read retry and recovers through controller.load', async () => {
  resetHarness({
    responseMode: 'conflict-read-error',
    status: 'selected',
    selectedTagIds: ['minimalist'],
  });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '静奢/老钱')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());

    assert.equal(webStylePreferenceController.getSnapshot().phase, 'conflict');
    assert.equal(webStylePreferenceController.getSnapshot().message, 'preference_read_failed');
    assert.equal(buttons(root, '重新读取').length, 1);
    assert.equal(buttons(root, '先进入首页').length, 0);
    assert.equal(buttons(root, '暂不设置').length, 0);
    assert.equal(buttons(root, '确认覆盖').length, 0);
    assert.match(JSON.stringify(root.toJSON()), /暂时无法读取风格偏好/);

    setResponseMode('success');
    await act(async () => buttons(root, '重新读取')[0].props.onPress());
    await act(async () => webStylePreferenceController.whenIdle());
    assert.equal(webStylePreferenceController.getSnapshot().phase, 'conflict');
    assert.equal(webStylePreferenceController.getSnapshot().message, 'preference_conflict');
    assert.match(JSON.stringify(root.toJSON()), /最新已保存：街头潮流/);
    assert.equal(buttons(root, '确认覆盖').length, 1);

    await act(async () => buttons(root, '确认覆盖')[0].props.onPress());
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);
  } finally { await act(async () => root.unmount()); }
});

test('account switch while mounted lets B save and keeps late A settlement inert', async () => {
  resetHarness({ responseMode: 'deferred', status: 'selected', selectedTagIds: ['minimalist'] });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '静奢/老钱')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.equal(observations.replaces, 1);

    await act(async () => {
      switchAccount('account-b', { status: 'unseen' });
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    });
    assert.equal(webStylePreferenceController.getSnapshot().server?.accountId, 'account-b');
    assert.equal(buttons(root, '极简')[0].props.accessibilityState.checked, false);
    assert.equal(buttons(root, '静奢/老钱')[0].props.accessibilityState.checked, false);

    setResponseMode('success');
    await act(async () => buttons(root, '街头潮流')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.equal(observations.replaces, 2);
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);

    await act(async () => settleDeferredWrite('account-a'));
    assert.equal(webStylePreferenceController.getSnapshot().server?.accountId, 'account-b');
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);
    assert.deepEqual(observations.toasts, []);
  } finally { await act(async () => root.unmount()); }
});

test('late A finally cannot clear the still-active B action token', async () => {
  resetHarness({ responseMode: 'deferred', status: 'selected', selectedTagIds: ['minimalist'] });
  const root = await mount(OnboardingStyleRoute);
  try {
    await act(async () => buttons(root, '静奢/老钱')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    await act(async () => {
      switchAccount('account-b', { status: 'unseen' });
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    });
    await act(async () => buttons(root, '街头潮流')[0].props.onPress());
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.equal(observations.replaces, 2);

    await act(async () => settleDeferredWrite('account-a'));
    await act(async () => buttons(root, '保存并继续')[0].props.onPress());
    assert.equal(observations.replaces, 2);

    await act(async () => settleDeferredWrite('account-b'));
    assert.deepEqual(observations.routes, ['/onboarding/step3-wardrobe']);
  } finally { await act(async () => root.unmount()); }
});
