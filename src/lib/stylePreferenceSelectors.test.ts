import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  StylePreferenceControllerSnapshot,
  StylePreferenceSnapshot,
} from '@stymobile/contracts';

import {
  confirmedStylePreferenceDisplayNames,
  confirmedStylePreferenceModelValues,
  stylePreferenceSummary,
  withConfirmedStylePreferenceContext,
} from './stylePreferenceSelectors.ts';

const selectedServer: StylePreferenceSnapshot = Object.freeze({
  accountId: 'account-a',
  status: 'selected',
  catalogVersion: 'stylee-style-v1',
  revision: 7,
  selected: Object.freeze([
    Object.freeze({
      tagId: 'minimalist',
      displayName: '极简',
      modelValue: 'minimal model value',
      legacy: false,
    }),
    Object.freeze({
      tagId: 'legacy-personal',
      displayName: '我的旧风格',
      modelValue: 'legacy exact model value',
      legacy: true,
    }),
    Object.freeze({
      tagId: 'street',
      displayName: '街头潮流',
      modelValue: 'street model value',
      legacy: false,
    }),
  ]),
  options: Object.freeze([]),
});

function snapshot(
  patch: Partial<StylePreferenceControllerSnapshot> = {},
): StylePreferenceControllerSnapshot {
  return Object.freeze({
    phase: 'ready',
    server: selectedServer,
    draftTagIds: Object.freeze(['unconfirmed-draft']),
    message: null,
    busy: false,
    ...patch,
  });
}

test('confirmed selectors preserve server selection order and exact legacy values', () => {
  const current = snapshot();

  assert.deepEqual(confirmedStylePreferenceDisplayNames(current, 'account-a'), [
    '极简', '我的旧风格', '街头潮流',
  ]);
  assert.deepEqual(confirmedStylePreferenceModelValues(current, 'account-a'), [
    'minimal model value', 'legacy exact model value', 'street model value',
  ]);
  assert.deepEqual(stylePreferenceSummary(current, 'account-a'), {
    kind: 'selected',
    selections: [
      { tagId: 'minimalist', displayName: '极简', legacy: false },
      { tagId: 'legacy-personal', displayName: '我的旧风格', legacy: true },
      { tagId: 'street', displayName: '街头潮流', legacy: false },
    ],
  });
});

for (const phase of ['saving', 'confirming', 'conflict', 'error'] as const) {
  test(`${phase} draft cannot replace the confirmed server selection`, () => {
    const current = snapshot({
      phase,
      draftTagIds: Object.freeze(['unconfirmed-draft', 'another-draft']),
      message: phase === 'conflict' ? 'preference_conflict'
        : phase === 'confirming' ? 'preference_save_unknown'
        : phase === 'error' ? 'preference_save_failed'
        : null,
    });

    assert.deepEqual(confirmedStylePreferenceDisplayNames(current, 'account-a'), [
      '极简', '我的旧风格', '街头潮流',
    ]);
    assert.deepEqual(confirmedStylePreferenceModelValues(current, 'account-a'), [
      'minimal model value', 'legacy exact model value', 'street model value',
    ]);
    assert.equal(stylePreferenceSummary(current, 'account-a').kind, 'selected');
  });
}

test('account mismatch hides the departing account snapshot', () => {
  const current = snapshot();

  assert.deepEqual(confirmedStylePreferenceDisplayNames(current, 'account-b'), []);
  assert.deepEqual(confirmedStylePreferenceModelValues(current, 'account-b'), []);
  assert.deepEqual(stylePreferenceSummary(current, 'account-b'), { kind: 'loading' });
});

test('summary distinguishes loading, read failure, unseen, and skipped', () => {
  const noServer = snapshot({ server: null, draftTagIds: Object.freeze([]) });
  assert.deepEqual(stylePreferenceSummary(
    { ...noServer, phase: 'idle' }, 'account-a',
  ), { kind: 'loading' });
  assert.deepEqual(stylePreferenceSummary(
    { ...noServer, phase: 'loading', busy: true }, 'account-a',
  ), { kind: 'loading' });
  assert.deepEqual(stylePreferenceSummary({
    ...noServer,
    phase: 'error',
    message: 'preference_read_failed',
  }, 'account-a'), { kind: 'read_failed' });

  for (const status of ['unseen', 'skipped'] as const) {
    const server: StylePreferenceSnapshot = {
      ...selectedServer,
      status,
      revision: status === 'unseen' ? null : 8,
      selected: Object.freeze([]),
    };
    assert.deepEqual(stylePreferenceSummary(snapshot({ server }), 'account-a'), { kind: status });
    assert.deepEqual(confirmedStylePreferenceModelValues(snapshot({ server }), 'account-a'), []);
  }
});

test('confirmed model values supplement without replacing Query, tags, or weather inputs', () => {
  const context = withConfirmedStylePreferenceContext({
    weather: '晴',
    temp: '27',
    city: '上海',
    query: '今天想穿得轻松一点',
    tags: '通勤,室内',
  }, snapshot(), 'account-a');

  assert.deepEqual(context, {
    weather: '晴',
    temp: '27',
    city: '上海',
    query: '今天想穿得轻松一点',
    tags: '通勤,室内',
    stylePreferences: 'minimal model value、legacy exact model value、street model value',
  });
});

test('unconfirmed draft and account mismatch produce empty recommendation preference context', () => {
  const unconfirmed = snapshot({
    phase: 'conflict',
    server: { ...selectedServer, status: 'unseen', revision: null, selected: Object.freeze([]) },
    draftTagIds: Object.freeze(['unconfirmed-draft']),
    message: 'preference_conflict',
  });
  const base = { query: '保留这句 Query', tags: '保留显式标签', weather: '多云' };

  assert.deepEqual(withConfirmedStylePreferenceContext(base, unconfirmed, 'account-a'), {
    ...base,
    stylePreferences: '',
  });
  assert.deepEqual(withConfirmedStylePreferenceContext(base, snapshot(), 'account-b'), {
    ...base,
    stylePreferences: '',
  });
});
