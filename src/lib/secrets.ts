// All keys are loaded from environment variables only — never hardcoded.
// Local dev: set in .env (gitignored)
// CI: injected via GitHub Secrets at build time

export const DEEPSEEK_KEY = process.env.EXPO_PUBLIC_DEEPSEEK_KEY || '';
export const DEEPSEEK_HOST = process.env.EXPO_PUBLIC_DEEPSEEK_HOST || 'api.deepseek.com';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
export const SUPABASE_SERVICE_KEY = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || '';
export const QWEATHER_KEY = process.env.EXPO_PUBLIC_QWEATHER_KEY || '';
export const QWEATHER_HOST = process.env.EXPO_PUBLIC_QWEATHER_HOST || 'devapi.qweather.com';
export const DASHSCOPE_API_KEY = process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY || '';
