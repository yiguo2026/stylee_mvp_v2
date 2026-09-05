import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile, UserStylePreference } from '@/types';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import { useImportStore } from '@/stores/importStore';
import { clearProfileCache, readProfileCache, writeProfileCache } from '@/lib/profileCache';
import { userPrivateReset } from '@/lib/privateStateReset';

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
  // 把 gender 写进 auth user_metadata（服务端持久化），下次登录/冷启动路由可零 DB 查询
  syncGenderToAuth: (gender: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  resetPrivateState: () => undefined;
}

export const useUserStore = create<UserState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  stylePreferences: [],
  isLoading: false,

  setSession: (session) => {
    useImportStore.getState().setActiveUser(session?.user.id ?? null);
    set({ session, user: session?.user ?? null });
  },

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
    const cached = readProfileCache<UserProfile>(userId);
    if (cached) set({ profile: cached });
    return cached;
  },

  resolveRouteGender: async () => {
    const { user } = get();
    if (!user) return null;
    // 0) auth user_metadata 优先：登录返回的 session 自带 gender → 零 DB 查询、最快
    const metaGender = (user.user_metadata as any)?.gender;
    if (typeof metaGender === 'string' && metaGender) return metaGender;
    // 1) 本地缓存：老设备/回访用户瞬时拿到 gender，跳转零等待
    const cached = readProfileCache<UserProfile>(user.id);
    if (cached?.gender) {
      set({ profile: cached });
      return cached.gender;
    }
    // 2) 兜底：只查 gender 单列（比 select(*)+style_preferences join 快很多）
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

  syncGenderToAuth: async (gender) => {
    try {
      const res: any = await withTimeout(
        supabase.auth.updateUser({ data: { gender } }),
        6000, 'sync-gender',
      );
      // 同步刷新内存里的 session.user，让本次会话也能零查询命中
      if (res?.data?.user) set({ user: res.data.user });
    } catch (e: any) {
      // 失败不影响主流程：下次仍可回退到缓存 / 单列查询
      console.warn('[UserStore] syncGenderToAuth failed:', e?.message);
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
      // gender 变化时同步到 auth metadata + 本地缓存，保证下次登录路由零查询
      if (typeof updates.gender === 'string' && updates.gender) {
        writeProfileCache(user.id, { ...profile!, ...updates } as UserProfile);
        void get().syncGenderToAuth(updates.gender);
      }
    } catch (e: any) {
      console.warn('[UserStore] updateProfile failed:', e.message);
    }
  },

  signOut: async () => {
    const { user } = get();
    await supabase.auth.signOut();
    if (user) clearProfileCache(user.id);
    useImportStore.getState().setActiveUser(null);
    set({ session: null, user: null, profile: null, stylePreferences: [] });
  },

  resetPrivateState: () => {
    set(userPrivateReset());
    return undefined;
  },
}));
