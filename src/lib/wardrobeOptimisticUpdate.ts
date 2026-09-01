import type { WardrobeItem } from '@/types';

type WardrobeField = keyof WardrobeItem;
type FieldGenerations = Partial<Record<WardrobeField, number>>;

export type WardrobeMutationGenerations = Record<string, FieldGenerations>;

export interface WardrobeOptimisticState {
  items: WardrobeItem[];
  pendingEdits: Record<string, Partial<WardrobeItem>>;
  mutationGenerations: WardrobeMutationGenerations;
}

export interface WardrobeRollbackTransaction {
  itemId: string;
  touchedKeys: WardrobeField[];
  fieldGenerations: FieldGenerations;
  previousItemFields: Partial<WardrobeItem>;
  itemKeysPreviouslyPresent: WardrobeField[];
  previousPendingFields: Partial<WardrobeItem>;
  pendingKeysPreviouslyPresent: WardrobeField[];
}

export interface AppliedWardrobeOptimisticUpdate {
  state: WardrobeOptimisticState;
  transaction: WardrobeRollbackTransaction;
}

function hasOwnField(value: object, key: WardrobeField): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function snapshotFields(
  source: Partial<WardrobeItem> | undefined,
  keys: WardrobeField[],
): { fields: Partial<WardrobeItem>; presentKeys: WardrobeField[] } {
  const fields: Partial<WardrobeItem> = {};
  const presentKeys: WardrobeField[] = [];
  if (!source) return { fields, presentKeys };

  const sourceRecord = source as Record<string, unknown>;
  const fieldRecord = fields as Record<string, unknown>;
  keys.forEach((key) => {
    if (!hasOwnField(source, key)) return;
    presentKeys.push(key);
    fieldRecord[key] = sourceRecord[key];
  });
  return { fields, presentKeys };
}

function restoreFields(
  current: Partial<WardrobeItem>,
  keys: WardrobeField[],
  previous: Partial<WardrobeItem>,
  previouslyPresent: WardrobeField[],
): Partial<WardrobeItem> {
  const restored = { ...current } as Record<string, unknown>;
  const previousRecord = previous as Record<string, unknown>;
  const present = new Set<WardrobeField>(previouslyPresent);
  keys.forEach((key) => {
    if (present.has(key)) restored[key] = previousRecord[key];
    else delete restored[key];
  });
  return restored as Partial<WardrobeItem>;
}

export function applyWardrobeOptimisticUpdate(
  state: WardrobeOptimisticState,
  itemId: string,
  updates: Partial<WardrobeItem>,
  updatedAt: string,
): AppliedWardrobeOptimisticUpdate {
  const optimisticUpdates: Partial<WardrobeItem> = {
    ...updates,
    updated_at: updatedAt,
  };
  const touchedKeys = Object.keys(optimisticUpdates) as WardrobeField[];
  const previousItem = state.items.find((candidate) => candidate.item_id === itemId);
  const previousPending = state.pendingEdits[itemId];
  const itemSnapshot = snapshotFields(previousItem, touchedKeys);
  const pendingSnapshot = snapshotFields(previousPending, touchedKeys);

  const priorGenerations = state.mutationGenerations[itemId] ?? {};
  const nextItemGenerations: FieldGenerations = { ...priorGenerations };
  const fieldGenerations: FieldGenerations = {};
  touchedKeys.forEach((key) => {
    const generation = (priorGenerations[key] ?? 0) + 1;
    nextItemGenerations[key] = generation;
    fieldGenerations[key] = generation;
  });

  return {
    state: {
      items: state.items.map((candidate) => candidate.item_id === itemId
        ? { ...candidate, ...optimisticUpdates }
        : candidate),
      pendingEdits: {
        ...state.pendingEdits,
        [itemId]: { ...(previousPending ?? {}), ...optimisticUpdates },
      },
      mutationGenerations: {
        ...state.mutationGenerations,
        [itemId]: nextItemGenerations,
      },
    },
    transaction: {
      itemId,
      touchedKeys,
      fieldGenerations,
      previousItemFields: itemSnapshot.fields,
      itemKeysPreviouslyPresent: itemSnapshot.presentKeys,
      previousPendingFields: pendingSnapshot.fields,
      pendingKeysPreviouslyPresent: pendingSnapshot.presentKeys,
    },
  };
}

export function rollbackWardrobeOptimisticUpdate(
  state: WardrobeOptimisticState,
  transaction: WardrobeRollbackTransaction,
): WardrobeOptimisticState {
  const currentGenerations = state.mutationGenerations[transaction.itemId] ?? {};
  const rollbackKeys = transaction.touchedKeys.filter((key) => (
    currentGenerations[key] === transaction.fieldGenerations[key]
  ));
  if (rollbackKeys.length === 0) return state;

  const items = state.items.map((candidate) => {
    if (candidate.item_id !== transaction.itemId) return candidate;
    return restoreFields(
      candidate,
      rollbackKeys,
      transaction.previousItemFields,
      transaction.itemKeysPreviouslyPresent,
    ) as WardrobeItem;
  });

  const restoredPending = restoreFields(
    state.pendingEdits[transaction.itemId] ?? {},
    rollbackKeys,
    transaction.previousPendingFields,
    transaction.pendingKeysPreviouslyPresent,
  );
  const pendingEdits = { ...state.pendingEdits };
  if (Object.keys(restoredPending).length === 0) delete pendingEdits[transaction.itemId];
  else pendingEdits[transaction.itemId] = restoredPending;

  return {
    items,
    pendingEdits,
    mutationGenerations: state.mutationGenerations,
  };
}

export async function runRollbackableWardrobeUpdate({
  getState,
  setState,
  itemId,
  updates,
  updatedAt,
  persist,
}: {
  getState: () => WardrobeOptimisticState;
  setState: (state: WardrobeOptimisticState) => void;
  itemId: string;
  updates: Partial<WardrobeItem>;
  updatedAt: string;
  persist: (updates: Partial<WardrobeItem> & { updated_at: string }) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const applied = applyWardrobeOptimisticUpdate(
    getState(),
    itemId,
    updates,
    updatedAt,
  );
  setState(applied.state);
  try {
    await persist({ ...updates, updated_at: updatedAt });
    return { ok: true };
  } catch (error) {
    setState(rollbackWardrobeOptimisticUpdate(getState(), applied.transaction));
    return { ok: false, error };
  }
}
