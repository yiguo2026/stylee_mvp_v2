import './webPrivateResetters.ts';
import type { Session } from '@supabase/supabase-js';
import { createAuthSessionCoordinator } from './authSessionCoordinator.ts';
import { webAccountScope } from './accountScopeRuntime.ts';
import { useUserStore } from '@/stores/userStore';

export const webAuthCoordinator = createAuthSessionCoordinator<Session>({
  scope: webAccountScope,
  publishSession: (session) => {
    useUserStore.getState().publishSession(session);
    return undefined;
  },
});

export { webAccountScope };
