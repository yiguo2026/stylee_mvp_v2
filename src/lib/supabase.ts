import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './secrets';

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
