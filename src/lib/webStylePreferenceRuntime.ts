import {
  createStylePreferenceController,
  createSupabaseStylePreferencePort,
  type StylePreferenceController,
  type SupabaseStylePreferenceClient,
} from '@stymobile/api-client';
import type { AccountScope } from '@stymobile/core';

import { webAccountScope } from '@/lib/accountScopeRuntime';
import { supabase } from '@/lib/supabase';
import {
  createWebStylePreferencePendingStore,
  type WebPreferenceStorage,
} from '@/lib/stylePreferencePendingStore';

export interface WebCryptoUuidProvider {
  randomUUID(): string;
}

export const WEB_STYLE_PREFERENCE_RUNTIME_RESTART_REQUIRED = 'preference_runtime_restart_required';

type RetainedPreferenceRuntime = Readonly<{
  client: SupabaseStylePreferenceClient;
  controller: StylePreferenceController;
}>;

type RetainedPreferenceRegistry = WeakMap<AccountScope, RetainedPreferenceRuntime>;

const RETAINED_PREFERENCE_REGISTRY = Symbol.for('stylee.web.preference.controller.v1');

export function createWebStylePreferenceRuntime(options: Readonly<{
  client: SupabaseStylePreferenceClient;
  scope: AccountScope;
  storage?: WebPreferenceStorage;
  crypto?: WebCryptoUuidProvider | null;
}>): StylePreferenceController {
  const crypto = options.crypto === undefined
    ? globalThis.crypto as WebCryptoUuidProvider | undefined
    : options.crypto;
  return createStylePreferenceController({
    port: createSupabaseStylePreferencePort(options.client),
    pendingStore: createWebStylePreferencePendingStore(options.storage),
    scope: options.scope,
    createOperationId: () => {
      if (crypto === null || crypto === undefined || typeof crypto.randomUUID !== 'function') {
        throw new Error('preference_operation_id_unavailable');
      }
      return crypto.randomUUID();
    },
  });
}

function retainProductionController(
  scope: AccountScope,
  client: SupabaseStylePreferenceClient,
): StylePreferenceController {
  const host = globalThis as unknown as Record<PropertyKey, unknown>;
  try {
    const retainedValue = host[RETAINED_PREFERENCE_REGISTRY];
    let registry: RetainedPreferenceRegistry;
    if (retainedValue === undefined) {
      registry = new WeakMap();
      host[RETAINED_PREFERENCE_REGISTRY] = registry;
    } else if (retainedValue instanceof WeakMap) {
      registry = retainedValue as RetainedPreferenceRegistry;
    } else {
      throw new Error(WEB_STYLE_PREFERENCE_RUNTIME_RESTART_REQUIRED);
    }

    const retained = registry.get(scope);
    if (retained !== undefined) {
      if (retained.client !== client) {
        throw new Error(WEB_STYLE_PREFERENCE_RUNTIME_RESTART_REQUIRED);
      }
      return retained.controller;
    }

    const controller = createWebStylePreferenceRuntime({ client, scope });
    registry.set(scope, Object.freeze({ client, controller }));
    return controller;
  } catch {
    throw new Error(WEB_STYLE_PREFERENCE_RUNTIME_RESTART_REQUIRED);
  }
}

export const webStylePreferenceController = retainProductionController(webAccountScope, supabase);
