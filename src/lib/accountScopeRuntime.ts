import {
  createAccountScope,
  type AccountScope,
  type ScopeResetter,
} from '@stymobile/core';

export interface PrivateResetRegistry {
  install(resetters: readonly ScopeResetter[]): undefined;
  dispatch(): undefined;
}

export function createPrivateResetRegistry(): PrivateResetRegistry {
  let installed: readonly ScopeResetter[] | null = null;

  return Object.freeze({
    install(resetters: readonly ScopeResetter[]): undefined {
      if (installed !== null) throw new Error('private_resetters_already_installed');
      installed = Object.freeze([...resetters]);
      return undefined;
    },
    dispatch(): undefined {
      if (installed === null) throw new Error('private_resetters_not_installed');

      let failures = 0;
      for (const reset of installed) {
        try {
          const returned: unknown = reset();
          if (returned !== undefined) {
            failures += 1;
            void Promise.resolve(returned).catch(() => undefined);
          }
        } catch {
          failures += 1;
        }
      }
      if (failures > 0) throw new Error('private_reset_failed');
      return undefined;
    },
  });
}

const webPrivateResetRegistry = createPrivateResetRegistry();

export const webAccountScope: AccountScope = createAccountScope([webPrivateResetRegistry.dispatch]);
export const installWebPrivateResetters: PrivateResetRegistry['install'] = webPrivateResetRegistry.install;
