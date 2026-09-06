import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  StylePreferenceControllerSnapshot,
  StylePreferenceSnapshot,
} from '@stymobile/contracts';

import { stylePreferenceViewModel } from './stylePreferenceViewModel.ts';

const server: StylePreferenceSnapshot = Object.freeze({
  accountId: 'account-a',
  status: 'selected',
  catalogVersion: 'stylee-style-v1',
  revision: 4,
  selected: Object.freeze([
    Object.freeze({ tagId: 'active-b', displayName: '选项 B', modelValue: 'model-b', legacy: false }),
    Object.freeze({ tagId: 'legacy-a', displayName: '旧选项 A', modelValue: 'legacy-a', legacy: true }),
  ]),
  options: Object.freeze([
    Object.freeze({ tagId: 'active-a', displayName: '选项 A', modelValue: 'model-a', sortOrder: 1 }),
    Object.freeze({ tagId: 'active-b', displayName: '选项 B', modelValue: 'model-b', sortOrder: 2 }),
  ]),
});

function snapshot(
  patch: Partial<StylePreferenceControllerSnapshot> = {},
): StylePreferenceControllerSnapshot {
  return Object.freeze({
    phase: 'ready',
    server,
    draftTagIds: Object.freeze(['active-b', 'legacy-a']),
    message: null,
    busy: false,
    ...patch,
  });
}

test('view model preserves server option order and separates retained legacy selections', () => {
  const view = stylePreferenceViewModel(snapshot(), 'account-a');

  assert.deepEqual(view.options, [
    { tagId: 'active-a', label: '选项 A', selected: false },
    { tagId: 'active-b', label: '选项 B', selected: true },
  ]);
  assert.deepEqual(view.legacySelections, [
    { tagId: 'legacy-a', label: '旧选项 A', selected: true },
  ]);
  assert.deepEqual(view.confirmedDisplayNames, ['选项 B', '旧选项 A']);
  assert.equal(view.canToggle, true);
  assert.equal(view.canSave, true);
  assert.equal(view.canSkip, true);
});

test('normal save requires at least one active catalog choice', () => {
  const legacyOnly = stylePreferenceViewModel(snapshot({
    draftTagIds: Object.freeze(['legacy-a']),
  }), 'account-a');

  assert.equal(legacyOnly.canToggle, true);
  assert.equal(legacyOnly.canSave, false);
  assert.equal(legacyOnly.canSkip, true);
});

test('fixed save failure retains the draft and emits finite retry copy', () => {
  const view = stylePreferenceViewModel(snapshot({
    phase: 'error',
    message: 'preference_save_failed',
    draftTagIds: Object.freeze(['active-a']),
  }), 'account-a');

  assert.equal(view.options[0].selected, true);
  assert.equal(view.canSave, true);
  assert.deepEqual(view.status, { tone: 'attention', text: '保存失败，请稍后重试' });
});

test('unknown result is locked to same-operation confirmation', () => {
  const view = stylePreferenceViewModel(snapshot({
    phase: 'confirming',
    message: 'preference_save_unknown',
    busy: false,
  }), 'account-a');

  assert.equal(view.canToggle, false);
  assert.equal(view.canSave, false);
  assert.equal(view.canRetryConfirmation, true);
  assert.deepEqual(view.status, { tone: 'neutral', text: '保存结果待确认，请继续确认' });
});

test('pending-store write failure is a retryable fixed save failure, not an unavailable confirmation', () => {
  const view = stylePreferenceViewModel(snapshot({
    phase: 'error',
    message: 'preference_save_unknown',
    draftTagIds: Object.freeze(['active-a']),
  }), 'account-a');

  assert.equal(view.canSave, true);
  assert.equal(view.canRetryConfirmation, false);
  assert.deepEqual(view.status, { tone: 'attention', text: '保存失败，请稍后重试' });
});

test('conflict keeps the preserved draft, shows latest confirmed values and discloses removed legacy', () => {
  const latest: StylePreferenceSnapshot = {
    ...server,
    revision: 5,
    selected: Object.freeze([
      Object.freeze({ tagId: 'active-a', displayName: '选项 A', modelValue: 'model-a', legacy: false }),
    ]),
  };
  const view = stylePreferenceViewModel(snapshot({
    phase: 'conflict',
    server: latest,
    draftTagIds: Object.freeze(['active-b', 'removed-legacy']),
    message: 'preference_conflict',
  }), 'account-a');

  assert.equal(view.options[1].selected, true);
  assert.deepEqual(view.confirmedDisplayNames, ['选项 A']);
  assert.equal(view.removedLegacyCount, 1);
  assert.equal(view.canToggle, false);
  assert.equal(view.canSave, false);
  assert.equal(view.canConfirmConflictOverwrite, true);
  assert.deepEqual(view.status, {
    tone: 'attention',
    text: '偏好已在其他设备更新，请确认后覆盖',
  });
});

test('selected conflict cannot overwrite without an active v1 choice, while an empty pending skip can', () => {
  const removedLegacyOnly = stylePreferenceViewModel(snapshot({
    phase: 'conflict',
    message: 'preference_conflict',
    draftTagIds: Object.freeze(['removed-legacy']),
  }), 'account-a');
  assert.equal(removedLegacyOnly.canConfirmConflictOverwrite, false);
  assert.equal(removedLegacyOnly.canSkip, false);

  const pendingSkip = stylePreferenceViewModel(snapshot({
    phase: 'conflict',
    message: 'preference_conflict',
    draftTagIds: Object.freeze([]),
  }), 'account-a');
  assert.equal(pendingSkip.canConfirmConflictOverwrite, true);
  assert.equal(pendingSkip.canSkip, false);
});

test('account mismatch exposes no private options, labels, or action', () => {
  const view = stylePreferenceViewModel(snapshot(), 'account-b');

  assert.deepEqual(view.options, []);
  assert.deepEqual(view.legacySelections, []);
  assert.deepEqual(view.confirmedDisplayNames, []);
  assert.equal(view.canToggle, false);
  assert.equal(view.canSave, false);
  assert.deepEqual(view.status, { tone: 'neutral', text: '正在读取风格偏好' });
});

test('read failure and confirmed success messages are finite presentation states', () => {
  const readFailed = stylePreferenceViewModel(snapshot({
    phase: 'error', server: null, draftTagIds: Object.freeze([]), message: 'preference_read_failed',
  }), 'account-a');
  assert.equal(readFailed.canRetryRead, true);
  assert.equal(readFailed.canSkip, false);
  assert.deepEqual(readFailed.status, { tone: 'attention', text: '暂时无法读取风格偏好' });

  const saved = stylePreferenceViewModel(snapshot({ message: 'preference_saved' }), 'account-a');
  assert.equal(saved.decisionState, 'saved');
  assert.deepEqual(saved.status, { tone: 'positive', text: '风格偏好已保存' });
});
