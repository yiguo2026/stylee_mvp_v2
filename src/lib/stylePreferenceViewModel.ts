import type { StylePreferenceControllerSnapshot } from '@stymobile/contracts';
import type { StyleeStatusTone } from '@/design-system';

export interface StylePreferenceViewModel {
  options: readonly Readonly<{ tagId: string; label: string; selected: boolean }>[];
  legacySelections: readonly Readonly<{ tagId: string; label: string; selected: boolean }>[];
  confirmedDisplayNames: readonly string[];
  removedLegacyCount: number;
  canToggle: boolean;
  canSave: boolean;
  canSkip: boolean;
  canRetryRead: boolean;
  canRetryConfirmation: boolean;
  canConfirmConflictOverwrite: boolean;
  decisionState: 'default' | 'saving' | 'saved';
  status: Readonly<{ tone: StyleeStatusTone; text: string }> | null;
}

const EMPTY: StylePreferenceViewModel = Object.freeze({
  options: Object.freeze([]),
  legacySelections: Object.freeze([]),
  confirmedDisplayNames: Object.freeze([]),
  removedLegacyCount: 0,
  canToggle: false,
  canSave: false,
  canSkip: false,
  canRetryRead: false,
  canRetryConfirmation: false,
  canConfirmConflictOverwrite: false,
  decisionState: 'default',
  status: Object.freeze({ tone: 'neutral', text: '正在读取风格偏好' }),
});

function finiteStatus(
  snapshot: StylePreferenceControllerSnapshot,
): StylePreferenceViewModel['status'] {
  if (snapshot.phase === 'loading') return { tone: 'neutral', text: '正在读取风格偏好' };
  if (snapshot.message === 'preference_read_failed') {
    return { tone: 'attention', text: '暂时无法读取风格偏好' };
  }
  if (snapshot.message === 'preference_save_failed') {
    return { tone: 'attention', text: '保存失败，请稍后重试' };
  }
  if (snapshot.message === 'preference_save_unknown' && snapshot.phase === 'confirming') {
    return { tone: 'neutral', text: '保存结果待确认，请继续确认' };
  }
  if (snapshot.message === 'preference_save_unknown') {
    return { tone: 'attention', text: '保存失败，请稍后重试' };
  }
  if (snapshot.message === 'preference_conflict') {
    return { tone: 'attention', text: '偏好已在其他设备更新，请确认后覆盖' };
  }
  if (snapshot.message === 'preference_saved') {
    return { tone: 'positive', text: '风格偏好已保存' };
  }
  if (snapshot.message === 'preference_skipped') {
    return { tone: 'positive', text: '已暂不设置风格偏好' };
  }
  return null;
}

export function stylePreferenceViewModel(
  snapshot: StylePreferenceControllerSnapshot,
  expectedAccountId: string | null | undefined,
): StylePreferenceViewModel {
  const server = snapshot.server;
  if (typeof expectedAccountId !== 'string' || server?.accountId !== expectedAccountId) {
    return snapshot.message === 'preference_read_failed'
      ? { ...EMPTY, canRetryRead: true, status: finiteStatus(snapshot) }
      : EMPTY;
  }

  const selectedIds = new Set(snapshot.draftTagIds);
  const optionIds = new Set(server.options.map((option) => option.tagId));
  const currentLegacy = server.selected.filter((selection) => selection.legacy);
  const currentLegacyIds = new Set(currentLegacy.map((selection) => selection.tagId));
  const editable = !snapshot.busy && (snapshot.phase === 'ready'
    || (snapshot.phase === 'error'
      && (snapshot.message === 'preference_save_failed'
        || snapshot.message === 'preference_save_unknown')));
  const activeSelectionCount = server.options.reduce(
    (count, option) => count + (selectedIds.has(option.tagId) ? 1 : 0),
    0,
  );

  return Object.freeze({
    options: Object.freeze(server.options.map((option) => Object.freeze({
      tagId: option.tagId,
      label: option.displayName,
      selected: selectedIds.has(option.tagId),
    }))),
    legacySelections: Object.freeze(currentLegacy.map((selection) => Object.freeze({
      tagId: selection.tagId,
      label: selection.displayName,
      selected: selectedIds.has(selection.tagId),
    }))),
    confirmedDisplayNames: Object.freeze(server.selected.map((selection) => selection.displayName)),
    removedLegacyCount: snapshot.phase === 'conflict'
      ? snapshot.draftTagIds.filter((tagId) => !optionIds.has(tagId) && !currentLegacyIds.has(tagId)).length
      : 0,
    canToggle: editable,
    canSave: editable && activeSelectionCount > 0,
    canSkip: editable,
    canRetryRead: (snapshot.phase === 'error' || snapshot.phase === 'conflict')
      && snapshot.message === 'preference_read_failed',
    canRetryConfirmation: !snapshot.busy && snapshot.phase === 'confirming',
    canConfirmConflictOverwrite: !snapshot.busy
      && snapshot.phase === 'conflict'
      && snapshot.message === 'preference_conflict'
      && (snapshot.draftTagIds.length === 0 || activeSelectionCount > 0),
    decisionState: snapshot.busy && snapshot.phase === 'saving' ? 'saving'
      : snapshot.phase === 'ready'
        && (snapshot.message === 'preference_saved' || snapshot.message === 'preference_skipped')
        ? 'saved'
        : 'default',
    status: finiteStatus(snapshot),
  });
}
