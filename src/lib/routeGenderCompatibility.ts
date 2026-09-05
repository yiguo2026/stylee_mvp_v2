import type { AccountScope, AccountStamp } from '@stymobile/core';

export async function resolveRouteGenderCompat(
  options: Readonly<{
    scope: AccountScope;
    stamp?: AccountStamp;
    resolve: (stamp: AccountStamp) => Promise<string | null>;
  }>,
): Promise<string | null> {
  const stamp = options.stamp ?? options.scope.capture();
  if (stamp === null) return null;
  return options.resolve(stamp);
}
