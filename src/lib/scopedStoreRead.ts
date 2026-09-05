import {
  runScopedRead,
  type AccountScope,
  type AccountStamp,
  type ScopedReadOutcome,
} from '@stymobile/core';
import type { AccountId } from '@stymobile/contracts';

export type LatestReadLease = Readonly<{ sequence: number }>;

export interface LatestReadSlot {
  begin(): LatestReadLease;
  isCurrent(lease: LatestReadLease): boolean;
  finish(lease: LatestReadLease): boolean;
  cancel(): undefined;
}

export interface ScopedStoreReadOptions<T> {
  readonly scope: AccountScope;
  readonly slot: LatestReadSlot;
  readonly stamp?: AccountStamp;
  readonly expectedAccountId?: AccountId;
  readonly execute: (context: Readonly<{ accountId: AccountId }>) => Promise<T>;
  readonly apply: (value: T) => undefined;
  readonly onError?: (error: unknown) => undefined;
  readonly onLoadingChange?: (loading: boolean) => undefined;
}

export function createLatestReadSlot(): LatestReadSlot {
  let sequence = 0;
  let current: LatestReadLease | null = null;

  return Object.freeze({
    begin: () => {
      const lease = Object.freeze({ sequence: ++sequence });
      current = lease;
      return lease;
    },
    isCurrent: (lease: LatestReadLease) => lease === current,
    finish: (lease: LatestReadLease) => {
      if (lease !== current) return false;
      current = null;
      return true;
    },
    cancel: () => {
      current = null;
      return undefined;
    },
  });
}

export async function runScopedStoreRead<T>(options: ScopedStoreReadOptions<T>): Promise<ScopedReadOutcome> {
  const stamp = options.stamp ?? options.scope.capture();
  if (stamp === null) return { kind: 'discarded' };
  if (options.expectedAccountId !== undefined && options.expectedAccountId !== stamp.accountId) {
    return { kind: 'discarded' };
  }
  const lease = options.slot.begin();
  options.onLoadingChange?.(true);
  try {
    return await runScopedRead({
      scope: options.scope,
      stamp,
      execute: options.execute,
      apply: options.apply,
      ...(options.onError === undefined ? {} : { onError: options.onError }),
      stillCurrent: () => options.slot.isCurrent(lease),
    });
  } finally {
    if (options.scope.isCurrent(stamp) && options.slot.finish(lease)) {
      options.onLoadingChange?.(false);
    }
  }
}
