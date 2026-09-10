import type {
  AccountScope,
  AccountStamp,
  ScopedReadOutcome,
} from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';

import {
  runScopedStoreRead,
  type LatestReadSlot,
} from './scopedStoreRead.ts';
import { mergeWardrobeRead } from './storeReadPolicy.ts';

type WardrobeReadItem = Readonly<{
  item_id: string;
  created_at?: string;
  updated_at?: string;
  wear_count?: number;
  favorite_count?: number;
}>;

type WardrobeStats = Readonly<
  Record<string, Readonly<{ wear: number; favorite: number }>>
>;

export interface ScopedWardrobeFetchOptions<T extends WardrobeReadItem> {
  readonly scope: AccountScope;
  readonly slot: LatestReadSlot;
  readonly stamp?: AccountStamp;
  readonly expectedAccountId: AccountId;
  readonly execute: (context: Readonly<{ accountId: AccountId }>) => Promise<Readonly<{
    rawItems: readonly T[];
    stats: WardrobeStats | null;
  }>>;
  readonly readCurrentOverlays: () => Readonly<{
    pendingEdits: Readonly<Record<string, Partial<T>>>;
    deletedIds: readonly string[];
  }>;
  readonly applyItems: (items: T[]) => undefined;
  readonly onStatsFailure?: () => undefined;
  readonly onError?: (error: unknown) => undefined;
  readonly onLoadingChange?: (loading: boolean) => undefined;
}

export function runScopedWardrobeFetch<T extends WardrobeReadItem>(
  options: ScopedWardrobeFetchOptions<T>,
): Promise<ScopedReadOutcome> {
  return runScopedStoreRead({
    scope: options.scope,
    slot: options.slot,
    ...(options.stamp === undefined ? {} : { stamp: options.stamp }),
    expectedAccountId: options.expectedAccountId,
    execute: options.execute,
    apply: ({ rawItems, stats }) => {
      const { pendingEdits, deletedIds } = options.readCurrentOverlays();
      if (stats === null) options.onStatsFailure?.();
      return options.applyItems(mergeWardrobeRead({
        rawItems,
        stats,
        pendingEdits,
        deletedIds,
      }));
    },
    ...(options.onError === undefined ? {} : { onError: options.onError }),
    ...(options.onLoadingChange === undefined
      ? {}
      : { onLoadingChange: options.onLoadingChange }),
  });
}
