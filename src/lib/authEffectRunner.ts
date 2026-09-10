import type { AccountScope, AccountStamp } from '@stymobile/core';
import type { AuthEffect } from './authSessionCoordinator.ts';

export interface AuthEffectPorts {
  activateImportOwner(accountId: string): undefined;
  hydrate(accountId: string): undefined;
  resolveGender(stamp: AccountStamp): Promise<string | null>;
  startProfileRead(): undefined;
  navigate(path: '/(auth)/login' | '/onboarding/step1-info' | '/(tabs)' | '/profile/change-password'): undefined;
  notifyBlocked(message: string): undefined;
}

export async function runAuthEffect(
  effect: AuthEffect,
  options: Readonly<{
    scope: AccountScope;
    publicPreview: boolean;
    isEffectCurrent(effect: AuthEffect): boolean;
    ports: AuthEffectPorts;
  }>,
): Promise<'applied' | 'discarded'> {
  const { scope, ports } = options;
  const current = () => !options.publicPreview
    && effect.kind !== 'none'
    && options.isEffectCurrent(effect)
    && (!('stamp' in effect) || scope.isCurrent(effect.stamp));
  if (!current()) return 'discarded';
  if (effect.kind === 'anonymous' || effect.kind === 'blocked') {
    if (effect.kind === 'blocked') {
      ports.notifyBlocked('账号状态异常，请刷新应用后重新登录');
    }
    if (!current()) return 'discarded';
    ports.navigate('/(auth)/login');
    return 'applied';
  }
  if (!('stamp' in effect)) return 'discarded';
  ports.activateImportOwner(effect.stamp.accountId);
  if (!current()) return 'discarded';

  let path: Parameters<AuthEffectPorts['navigate']>[0] = '/profile/change-password';
  if (effect.kind === 'load_account') {
    ports.hydrate(effect.stamp.accountId);
    if (!current()) return 'discarded';
    const gender = await ports.resolveGender(effect.stamp);
    if (!current()) return 'discarded';
    path = gender === 'private' ? '/onboarding/step1-info' : '/(tabs)';
  }
  ports.startProfileRead();
  if (!current()) return 'discarded';
  ports.navigate(path);
  return 'applied';
}
