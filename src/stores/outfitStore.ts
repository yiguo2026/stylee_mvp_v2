import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface OutfitState {
  savedCount: number;
  favoriteCount: number;
  refreshCounts: (userId: string) => Promise<void>;
}

export const useOutfitStore = create<OutfitState>((set) => ({
  savedCount: 0,
  favoriteCount: 0,

  refreshCounts: async (userId: string) => {
    const [outfitRes, favRes] = await Promise.all([
      supabase
        .from('outfits')
        .select('outfit_id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('outfit_favorites')
        .select('favorite_id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);
    set({
      savedCount: outfitRes.count ?? 0,
      favoriteCount: favRes.count ?? 0,
    });
  },
}));
