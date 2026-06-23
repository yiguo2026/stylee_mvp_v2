import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://pdgocqjvncxkwfrcdhtj.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ29jcWp2bmN4a3dmcmNkaHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjc4ODYsImV4cCI6MjA5NDg0Mzg4Nn0.4-fS0LhF1YpA5cF-T7Jd0eST5j1-SHMqDQWl0XmMFSY';
const supabaseServiceKey = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ29jcWp2bmN4a3dmcmNkaHRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2Nzg4NiwiZXhwIjoyMDk0ODQzODg2fQ.GAODsJvb_0Mxuj5PZztF8fhb9D7RrRTcPD7_F7UHmg8';

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

// Admin client with service_role key — used to auto-confirm users (bypass email verification)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
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
