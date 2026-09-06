import type {
  StylePreferenceControllerSnapshot,
  StylePreferenceSelection,
} from '@stymobile/contracts';

export type ConfirmedStylePreferenceSummary =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'read_failed' }>
  | Readonly<{ kind: 'unseen' }>
  | Readonly<{ kind: 'skipped' }>
  | Readonly<{
      kind: 'selected';
      selections: readonly Readonly<{
        tagId: string;
        displayName: string;
        legacy: boolean;
      }>[];
    }>;

function confirmedSelections(
  snapshot: StylePreferenceControllerSnapshot,
  expectedAccountId: string | null | undefined,
): readonly StylePreferenceSelection[] {
  if (
    typeof expectedAccountId !== 'string'
    || snapshot.server?.accountId !== expectedAccountId
    || snapshot.server.status !== 'selected'
  ) {
    return [];
  }
  return snapshot.server.selected;
}

export function confirmedStylePreferenceDisplayNames(
  snapshot: StylePreferenceControllerSnapshot,
  expectedAccountId: string | null | undefined,
): string[] {
  return confirmedSelections(snapshot, expectedAccountId).map((selection) => selection.displayName);
}

export function confirmedStylePreferenceModelValues(
  snapshot: StylePreferenceControllerSnapshot,
  expectedAccountId: string | null | undefined,
): string[] {
  return confirmedSelections(snapshot, expectedAccountId).map((selection) => selection.modelValue);
}

export function withConfirmedStylePreferenceContext<T extends Readonly<Record<string, unknown>>>(
  context: T,
  snapshot: StylePreferenceControllerSnapshot,
  expectedAccountId: string | null | undefined,
): T & Readonly<{ stylePreferences: string }> {
  return {
    ...context,
    stylePreferences: confirmedStylePreferenceModelValues(snapshot, expectedAccountId).join('、'),
  };
}

export function stylePreferenceSummary(
  snapshot: StylePreferenceControllerSnapshot,
  expectedAccountId: string | null | undefined,
): ConfirmedStylePreferenceSummary {
  const server = snapshot.server;
  if (typeof expectedAccountId !== 'string' || server?.accountId !== expectedAccountId) {
    return snapshot.phase === 'error' && snapshot.message === 'preference_read_failed'
      ? { kind: 'read_failed' }
      : { kind: 'loading' };
  }
  if (server.status === 'selected') {
    return {
      kind: 'selected',
      selections: server.selected.map(({ tagId, displayName, legacy }) => ({
        tagId,
        displayName,
        legacy,
      })),
    };
  }
  return { kind: server.status };
}
