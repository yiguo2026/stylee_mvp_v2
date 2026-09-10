import type { AccountId } from '@stymobile/contracts';
import { createAccountScope, type AccountStamp } from '@stymobile/core';

import type { ScopedStoreReadOptions } from './scopedStoreRead.ts';

const accountId = 'account-a' as AccountId;
const scope = createAccountScope();
scope.replaceAccount(accountId);
const captured = scope.capture();
if (captured === null) throw new Error('expected_authenticated_scope');
const stamp: AccountStamp = captured;

const options: ScopedStoreReadOptions<string> = {
  scope,
  slot: {
    begin: () => ({ sequence: 1 }),
    isCurrent: () => true,
    finish: () => true,
    cancel: () => undefined,
  },
  stamp,
  expectedAccountId: accountId,
  execute: async ({ accountId: executingAccountId }) => executingAccountId,
  apply: () => undefined,
};

void options;

const rejectsAsyncCallbacks: ScopedStoreReadOptions<string> = {
  ...options,
  // @ts-expect-error Store application must be synchronous.
  apply: async () => undefined,
  // @ts-expect-error Store error handling must be synchronous.
  onError: async () => undefined,
  // @ts-expect-error Loading updates must be synchronous.
  onLoadingChange: async () => undefined,
};

void rejectsAsyncCallbacks;
