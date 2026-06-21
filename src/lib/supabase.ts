import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl) {
  console.error('[Supabase] ⚠️ URL is EMPTY — .env not loaded. Restart Metro with: npx expo start --clear');
} else {
  console.log('[Supabase] ✅ URL:', supabaseUrl.slice(0, 40) + '...');
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
