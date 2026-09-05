import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import type { AccountStamp } from '@stymobile/core';
import { UserProfile, UserStylePreference } from '@/types';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import { readProfileCache, writeProfileCache } from '@/lib/profileCache';
import { userPrivateReset } from '@/lib/privateStateReset';
import { webAccountScope } from '@/lib/accountScopeRuntime';
import { createLatestReadSlot, runScopedStoreRead } from '@/lib/scopedStoreRead';
import {
  profileReadPatch,
  type SettledRead,
} from '@/lib/storeReadPolicy';

interface UserState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  stylePreferences: UserStylePreference[];
  isLoading: boolean;

  publishSession: (session: Session | null) => undefined;
  setProfile: (profile: UserProfile | null) => void;
  setStylePreferences: (prefs: UserStylePreference[]) => void;
  fetchProfile: () => Promise<void>;
  // 仅解析路由所需的 gender：优先读本地缓存（瞬时），无缓存时只查单列，避免 select(*)+join 拖慢跳转
  resolveRouteGender: (stamp: AccountStamp) => Promise<string | null>;
  // 从本地缓存把 profile 直接灌进 store，先渲染再刷新（offline-first）
  hydrateFromCache: (userId: string) => UserProfile | null;
  // 把 gender 写进 auth user_metadata（服务端持久化），下次登录/冷启动路由可零 DB 查询
  syncGenderToAuth: (gender: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  resetPrivateState: () => undefined;
}

const profileReadSlot = createLatestReadSlot();
const routeGenderReadSlot = createLatestReadSlot();

export const useUserStore = create<UserState>((set, get) => {
  const publishSession = (session: Session | null): undefined => {
    set({ session, user: session?.user ?? null });
    return undefined;
  };

  const resolveRouteGender = async (stamp: AccountStamp): Promise<string | null> => {
    if (!webAccountScope.isCurrent(stamp)) return null;
    const publishedUser = get().user;
    if (publishedUser?.id !== stamp.accountId) return null;
    routeGenderReadSlot.cancel();

    const metadataGender = publishedUser.user_metadata?.gender;
    if (
      typeof metadataGender === 'string'
      && metadataGender.length > 0
      && webAccountScope.isCurrent(stamp)
    ) {
      return metadataGender;
    }

    const cached = readProfileCache<UserProfile>(stamp.accountId);
    if (cached !== null && webAccountScope.isCurrent(stamp)) {
      set({ profile: cached });
      if (!webAccountScope.isCurrent(stamp)) return null;
      if (typeof cached.gender === 'string' && cached.gender.length > 0) {
        return cached.gender;
      }
    }

    let resolvedGender: string | null = null;
    await runScopedStoreRead({
      scope: webAccountScope,
      stamp,
      slot: routeGenderReadSlot,
      execute: async ({ accountId }) => {
        const response = await withTimeout(
          supabase.from('users').select('gender').eq('user_id', accountId).single(),
          6000,
          'route-gender',
        );
        if (response.error) throw response.error;
        return response.data as Readonly<{ gender?: unknown }> | null;
      },
      apply: (row) => {
        resolvedGender = typeof row?.gender === 'string' && row.gender.length > 0
          ? row.gender
          : null;
        return undefined;
      },
    });
    return resolvedGender;
  };

  return ({
  session: null,
  user: null,
  profile: null,
  stylePreferences: [],
  isLoading: false,

  publishSession,

  setProfile: (profile) => set({ profile }),

  setStylePreferences: (prefs) => set({ stylePreferences: prefs }),

  fetchProfile: async () => {
    const stamp = webAccountScope.capture();
    if (stamp === null) return;

    await runScopedStoreRead({
      scope: webAccountScope,
      stamp,
      slot: profileReadSlot,
      execute: async ({ accountId }) => {
        const [profileResult, preferencesResult] = await Promise.allSettled([
          withTimeout(
            supabase.from('users').select('*').eq('user_id', accountId).single(),
            8000,
            'profile',
          ),
          withTimeout(
            supabase
              .from('user_style_preferences')
              .select('*, tags(*)')
              .eq('user_id', accountId),
            8000,
            'style-prefs',
          ),
        ]);

        const profile: SettledRead<UserProfile> = profileResult.status === 'rejected'
          ? { status: 'rejected' }
          : {
              status: 'fulfilled',
              data: profileResult.value.data as UserProfile | null,
              error: profileResult.value.error,
            };
        const stylePreferences: SettledRead<UserStylePreference[]> = preferencesResult.status === 'rejected'
          ? { status: 'rejected' }
          : {
              status: 'fulfilled',
              data: preferencesResult.value.data as UserStylePreference[] | null,
              error: preferencesResult.value.error,
            };
        return { profile, stylePreferences };
      },
      apply: ({ profile, stylePreferences }) => {
        const patch = profileReadPatch<UserProfile, UserStylePreference>(profile, stylePreferences);
        const next: Partial<UserState> = {};
        if (patch.profile.kind === 'replace') next.profile = patch.profile.value;
        if (patch.stylePreferences.kind === 'replace') {
          next.stylePreferences = patch.stylePreferences.value;
        }
        if (Object.keys(next).length > 0) set(next);
        if (patch.cacheProfile !== null) {
          writeProfileCache(stamp.accountId, patch.cacheProfile);
        }
        const failed = profile.status === 'rejected'
          || (profile.status === 'fulfilled' && profile.error !== null)
          || stylePreferences.status === 'rejected'
          || (stylePreferences.status === 'fulfilled' && stylePreferences.error !== null);
        if (failed) console.warn('[UserStore] profile read failed');
        return undefined;
      },
      onError: () => {
        console.warn('[UserStore] profile read failed');
        return undefined;
      },
      onLoadingChange: (isLoading) => {
        set({ isLoading });
        return undefined;
      },
    });
  },

  hydrateFromCache: (accountId) => {
    const stamp = webAccountScope.capture();
    if (stamp?.accountId !== accountId) return null;

    const cached = readProfileCache<UserProfile>(accountId);
    if (!webAccountScope.isCurrent(stamp)) return null;
    if (cached !== null) set({ profile: cached });
    return webAccountScope.isCurrent(stamp) ? cached : null;
  },

  resolveRouteGender,

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
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('[UserStore] signOut failed');
  },

  resetPrivateState: () => {
    profileReadSlot.cancel();
    routeGenderReadSlot.cancel();
    set(userPrivateReset());
    return undefined;
  },
  });
});
