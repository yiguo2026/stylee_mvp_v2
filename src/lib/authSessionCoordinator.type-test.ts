import { createAccountScope } from '@stymobile/core';
import { runAuthEffect, type AuthEffectPorts } from './authEffectRunner.ts';

import {
  createAuthSessionCoordinator,
  type AuthSessionLike,
} from './authSessionCoordinator.ts';

interface SupabaseLikeSession extends AuthSessionLike {
  readonly access_token: string;
  readonly user: Readonly<{
    id: string;
    email: string;
  }>;
}

const scope = createAccountScope();
const published: Array<SupabaseLikeSession | null> = [];
const publishSession = (next: SupabaseLikeSession | null): undefined => {
  if (next !== null) void next.access_token;
  published.push(next);
  return undefined;
};
const coordinator = createAuthSessionCoordinator({ scope, publishSession });
const supabaseSession: SupabaseLikeSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  user: { id: 'account-a', email: 'user@example.com' },
};

const effect = coordinator.accept('SIGNED_IN', supabaseSession);
const effectCurrent: boolean = coordinator.isEffectCurrent(effect);
void effectCurrent;
const preserved: SupabaseLikeSession | null = published[0] ?? null;
void preserved;

// @ts-expect-error session publisher must be synchronous
createAuthSessionCoordinator({ scope, publishSession: async () => undefined });

function checkEffectRunnerContract(ports: AuthEffectPorts) {
  void runAuthEffect(effect, {
    scope, ports, publicPreview: false, isEffectCurrent: coordinator.isEffectCurrent,
  });
  // @ts-expect-error current effect validation is mandatory even with an AccountScope
  void runAuthEffect(effect, { scope, ports, publicPreview: false });
  void runAuthEffect(effect, {
    scope, ports, publicPreview: false,
    // @ts-expect-error effect identity validation must be synchronous
    isEffectCurrent: async () => true,
  });
}
void checkEffectRunnerContract;
