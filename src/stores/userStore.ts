import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { UserProfile, UserStylePreference } from '@/types';
import { supabase } from '@/lib/supabase';

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
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) set({ profile: data as UserProfile });

      const { data: prefs } = await supabase
        .from('user_style_preferences')
        .select('*, tags(*)')
        .eq('user_id', user.id);
      if (prefs) set({ stylePreferences: prefs as UserStylePreference[] });
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
