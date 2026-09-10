import type { AccountId } from '@stymobile/contracts';
import type { AccountScope, AccountStamp } from '@stymobile/core';

export type AccountAuthEvent =
  | 'INITIAL_SESSION'
  | 'PASSWORD_RECOVERY'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'MFA_CHALLENGE_VERIFIED';

export interface AuthSessionLike {
  readonly user: Readonly<{ id: string }>;
  readonly refresh_token: string;
}

export type AuthCoordinatorState =
  | Readonly<{
    phase: 'booting' | 'anonymous' | 'blocked';
    accountId: null;
    stamp: null;
    signalSerial: number;
  }>
  | Readonly<{
    phase: 'authenticated';
    accountId: AccountId;
    stamp: AccountStamp;
    signalSerial: number;
  }>;

type BlockedReason =
  | 'bootstrap_failed'
  | 'invalid_session'
  | 'scope_mismatch'
  | 'scope_transition_failed';

export type AuthEffect =
  | Readonly<{ kind: 'none' | 'anonymous' }>
  | Readonly<{ kind: 'load_account' | 'password_recovery'; stamp: AccountStamp }>
  | Readonly<{ kind: 'blocked'; reason: BlockedReason }>;

const NONE_EFFECT: AuthEffect = Object.freeze({ kind: 'none' });

function blockedEffect(reason: BlockedReason): AuthEffect {
  return Object.freeze({ kind: 'blocked', reason });
}

function stampEffect(
  kind: 'load_account' | 'password_recovery',
  stamp: AccountStamp,
): AuthEffect {
  return Object.freeze({ kind, stamp });
}

export function createAuthSessionCoordinator<S extends AuthSessionLike>(options: Readonly<{
  scope: AccountScope;
  publishSession: (session: S | null) => undefined;
}>): Readonly<{
  current(): AuthCoordinatorState;
  getSnapshot(): AuthCoordinatorState['phase'];
  subscribe(listener: () => void): () => void;
  signalSerial(): number;
  isEffectCurrent(effect: AuthEffect): boolean;
  accept(event: AccountAuthEvent, session: S | null): AuthEffect;
  acceptFallback(
    startedAtSerial: number,
    result: Readonly<{ session: S | null; error: unknown | null }>,
  ): AuthEffect;
  resume(): AuthEffect;
}> {
  const { scope, publishSession } = options;
  let serial = 0;
  const listeners = new Set<() => void>();
  let activeEffect: AuthEffect | null = null;
  let refreshMarker: string | null = null;
  let lastBlockedReason: BlockedReason | null = null;
  let state: AuthCoordinatorState = Object.freeze({
    phase: 'booting',
    accountId: null,
    stamp: null,
    signalSerial: serial,
  });

  function activateEffect(effect: AuthEffect): AuthEffect {
    // Refresh-only and ignored fallback signals preserve a pending route intent.
    if (effect.kind !== 'none') activeEffect = effect;
    for (const listener of listeners) listener();
    return effect;
  }

  function validSession(session: unknown): session is S {
    if (typeof session !== 'object' || session === null || !('user' in session)
      || typeof session.user !== 'object' || session.user === null
      || !('id' in session.user) || !('refresh_token' in session)) return false;
    const accountId = session.user.id;
    const marker = session.refresh_token;
    return typeof accountId === 'string'
      && typeof marker === 'string'
      && accountId.length > 0
      && accountId.trim() === accountId
      && marker.length > 0
      && marker.trim() === marker;
  }

  function replaceSerial(nextSerial: number): undefined {
    serial = nextSerial;
    state = state.phase === 'authenticated'
      ? Object.freeze({ ...state, signalSerial: serial })
      : Object.freeze({
        phase: state.phase,
        accountId: null,
        stamp: null,
        signalSerial: serial,
      });
    return undefined;
  }

  function enterBlocked(reason: BlockedReason, resetFirst: boolean): AuthEffect {
    if (state.phase === 'blocked' && lastBlockedReason !== null) {
      return blockedEffect(lastBlockedReason);
    }

    let finalReason = reason;
    if (resetFirst) {
      const transition = scope.signOut();
      if (transition.kind === 'blocked') finalReason = 'scope_transition_failed';
    }

    refreshMarker = null;
    lastBlockedReason = finalReason;
    state = Object.freeze({
      phase: 'blocked',
      accountId: null,
      stamp: null,
      signalSerial: serial,
    });
    publishSession(null);
    return blockedEffect(finalReason);
  }

  function publishAuthenticated(
    session: S,
    effectKind: 'load_account' | 'password_recovery',
  ): AuthEffect {
    const accountId = session.user.id as AccountId;
    const transition = scope.replaceAccount(accountId);
    if (transition.kind !== 'ready') {
      return enterBlocked('scope_transition_failed', false);
    }

    const stamp = scope.capture();
    if (stamp === null) {
      return enterBlocked('scope_transition_failed', true);
    }

    refreshMarker = session.refresh_token;
    lastBlockedReason = null;
    state = Object.freeze({
      phase: 'authenticated',
      accountId,
      stamp,
      signalSerial: serial,
    });
    publishSession(session);
    return stampEffect(effectKind, stamp);
  }

  function refreshAuthenticated(
    session: S,
    effectKind: 'none' | 'password_recovery',
  ): AuthEffect {
    if (
      state.phase !== 'authenticated'
      || state.accountId !== session.user.id
      || !scope.refresh(state.stamp)
    ) {
      return enterBlocked('scope_transition_failed', true);
    }

    refreshMarker = session.refresh_token;
    publishSession(session);
    return effectKind === 'password_recovery'
      ? stampEffect('password_recovery', state.stamp)
      : NONE_EFFECT;
  }

  function publishAnonymous(): AuthEffect {
    if (state.phase === 'anonymous') return NONE_EFFECT;

    const transition = scope.signOut();
    if (transition.kind !== 'ready') {
      return enterBlocked('scope_transition_failed', false);
    }

    refreshMarker = null;
    lastBlockedReason = null;
    state = Object.freeze({
      phase: 'anonymous',
      accountId: null,
      stamp: null,
      signalSerial: serial,
    });
    publishSession(null);
    return Object.freeze({ kind: 'anonymous' });
  }

  function reduceAuthSignal(event: AccountAuthEvent, session: S | null): AuthEffect {
    if (state.phase === 'blocked') {
      return blockedEffect(lastBlockedReason ?? 'scope_transition_failed');
    }

    if (event === 'SIGNED_OUT') return publishAnonymous();

    if (event === 'PASSWORD_RECOVERY') {
      if (!validSession(session)) return enterBlocked('invalid_session', true);
      if (state.phase === 'authenticated' && state.accountId === session.user.id
        && refreshMarker === session.refresh_token) {
        return refreshAuthenticated(session, 'password_recovery');
      }
      return publishAuthenticated(session, 'password_recovery');
    }

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      if (session === null) return publishAnonymous();
      if (!validSession(session)) return enterBlocked('invalid_session', true);
      if (
        state.phase === 'authenticated'
        && state.accountId === session.user.id
        && refreshMarker === session.refresh_token
      ) {
        return refreshAuthenticated(session, 'none');
      }
      return publishAuthenticated(session, 'load_account');
    }

    if (session !== null && !validSession(session)) {
      return enterBlocked('invalid_session', true);
    }
    if (state.phase === 'booting' && session !== null) {
      return publishAuthenticated(session, 'load_account');
    }
    if (
      state.phase !== 'authenticated'
      || session === null
      || state.accountId !== session.user.id
    ) {
      return enterBlocked('scope_mismatch', true);
    }
    return refreshAuthenticated(session, 'none');
  }

  return Object.freeze({
    current: () => state,
    getSnapshot: () => state.phase,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    signalSerial: () => serial,
    isEffectCurrent(effect: AuthEffect): boolean {
      return effect.kind !== 'none'
        && effect === activeEffect
        && (!('stamp' in effect) || scope.isCurrent(effect.stamp));
    },
    accept(event: AccountAuthEvent, session: S | null): AuthEffect {
      replaceSerial(serial + 1);
      return activateEffect(reduceAuthSignal(event, session));
    },
    acceptFallback(
      startedAtSerial: number,
      result: Readonly<{ session: S | null; error: unknown | null }>,
    ): AuthEffect {
      if (state.phase !== 'booting' || startedAtSerial !== serial) return NONE_EFFECT;
      if (result.error !== null) return activateEffect(enterBlocked('bootstrap_failed', true));
      if (result.session === null) return activateEffect(publishAnonymous());
      if (!validSession(result.session)) return activateEffect(enterBlocked('invalid_session', true));
      return activateEffect(publishAuthenticated(result.session, 'load_account'));
    },
    resume(): AuthEffect {
      if (state.phase === 'authenticated') return activateEffect(stampEffect('load_account', state.stamp));
      if (state.phase === 'anonymous') return activateEffect(Object.freeze({ kind: 'anonymous' }));
      if (state.phase === 'blocked') {
        return activateEffect(blockedEffect(lastBlockedReason ?? 'scope_transition_failed'));
      }
      return NONE_EFFECT;
    },
  });
}
