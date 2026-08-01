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
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  signOut: () => Promise<void>;
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
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, stylePreferences: [] });
  },
}));
