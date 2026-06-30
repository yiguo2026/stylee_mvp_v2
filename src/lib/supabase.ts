import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from './secrets';

if (!SUPABASE_URL) {
  console.error('[Supabase] ⚠️ URL is EMPTY — .env not loaded. Restart Metro with: npx expo start --clear');
} else {
  console.log('[Supabase] ✅ URL:', SUPABASE_URL.slice(0, 40) + '...');
}

const isWeb = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

let authStorage;
if (isWeb) {
  authStorage = {
    getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
    removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
  };
} else {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    authStorage = AsyncStorage;
  } catch {
    authStorage = undefined;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    ...(authStorage ? { storage: authStorage } : {}),
    autoRefreshToken: true,
    persistSession: !!authStorage,
    detectSessionInUrl: false,
  },
  global: {
    fetch: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
  },
});

// Admin client with service_role key — used to auto-confirm users (bypass email verification)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
  },
});

/** Auto-confirm a user by ID using service_role */
export async function confirmUser(userId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) {
      console.warn('[Supabase] auto-confirm failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Supabase] auto-confirm error:', e);
    return false;
  }
}
