import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile, UserStylePreference } from '@/types';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';

interface UserState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  stylePreferences: UserStylePreference[];
  isLoading: boolean;

  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setStylePreferences: (prefs: UserStylePreference[]) => void;
  fetchProfile: () => Promise<void>;
  // 仅解析路由所需的 gender：优先读本地缓存（瞬时），无缓存时只查单列，避免 select(*)+join 拖慢跳转
  resolveRouteGender: () => Promise<string | null>;
  // 从本地缓存把 profile 直接灌进 store，先渲染再刷新（offline-first）
  hydrateFromCache: (userId: string) => UserProfile | null;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  signOut: () => Promise<void>;
}

const PROFILE_CACHE_PREFIX = 'stylee.profile.';

function readProfileCache(userId: string): UserProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROFILE_CACHE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeProfileCache(userId: string, profile: UserProfile) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROFILE_CACHE_PREFIX + userId, JSON.stringify(profile));
  } catch {
    /* ignore quota / serialization errors */
  }
}

function clearProfileCache(userId: string) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(PROFILE_CACHE_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

export const useUserStore = create<UserState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  stylePreferences: [],
  isLoading: false,

  setSession: (session) => set({ session, user: session?.user ?? null }),

  setProfile: (profile) => set({ profile }),

  setStylePreferences: (prefs) => set({ stylePreferences: prefs }),

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;
    set({ isLoading: true });
    try {
      // 两个查询相互独立，并行执行并各自加超时，避免顺序等待 + 网络挂起导致长时间转圈
      const [profileRes, prefsRes] = await Promise.allSettled([
        withTimeout(
          supabase.from('users').select('*').eq('user_id', user.id).single(),
          8000, 'profile',
        ),
        withTimeout(
          supabase.from('user_style_preferences').select('*, tags(*)').eq('user_id', user.id),
          8000, 'style-prefs',
        ),
      ]);
      if (profileRes.status === 'fulfilled') {
        const { data } = profileRes.value as { data: UserProfile | null };
        set({ profile: data ? (data as UserProfile) : null });
        if (data) writeProfileCache(user.id, data as UserProfile);
      }
      if (prefsRes.status === 'fulfilled') {
        const { data: prefs } = prefsRes.value as { data: UserStylePreference[] | null };
        if (prefs) set({ stylePreferences: prefs as UserStylePreference[] });
      }
    } catch (e: any) {
      console.warn('[UserStore] fetchProfile failed:', e.message);
    } finally {
      set({ isLoading: false });
    }
  },

  hydrateFromCache: (userId) => {
    const cached = readProfileCache(userId);
    if (cached) set({ profile: cached });
    return cached;
  },

  resolveRouteGender: async () => {
    const { user } = get();
    if (!user) return null;
    // 1) 本地缓存优先：老设备/回访用户瞬时拿到 gender，跳转零等待
    const cached = readProfileCache(user.id);
    if (cached?.gender) {
      set({ profile: cached });
      return cached.gender;
    }
    // 2) 无缓存时只查 gender 单列（比 select(*)+style_preferences join 快很多）
    try {
      const res: any = await withTimeout(
        supabase.from('users').select('gender').eq('user_id', user.id).single(),
        6000, 'route-gender',
      );
      return res?.data?.gender ?? null;
    } catch (e: any) {
      console.warn('[UserStore] resolveRouteGender failed:', e?.message);
      return null;
    }
  },

  updateProfile: async (updates) => {
    const { user, profile } = get();
    if (!user) return;
    try {
      const { error } = await supabase
        .from('users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      set({ profile: { ...profile!, ...updates } });
    } catch (e: any) {
      console.warn('[UserStore] updateProfile failed:', e.message);
    }
  },

  signOut: async () => {
    const { user } = get();
    await supabase.auth.signOut();
    if (user) clearProfileCache(user.id);
    set({ session: null, user: null, profile: null, stylePreferences: [] });
  },
}));
