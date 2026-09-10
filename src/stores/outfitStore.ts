import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { outfitPrivateReset } from '@/lib/privateStateReset';
import { webAccountScope } from '@/lib/accountScopeRuntime';
import { runScopedStoreRead } from '@/lib/scopedStoreRead';
import { secondaryStoreReadSlots } from '@/lib/secondaryStoreReads';

interface OutfitState {
  savedCount: number;
  favoriteCount: number;
  refreshCounts: (userId: string) => Promise<void>;
  /**
   * 切换某套搭配的收藏状态。写入/删除 outfit_favorites 并刷新计数。
   * 返回写入后的真实收藏状态；写入失败时返回原状态（供调用方回滚乐观更新）。
   */
  toggleFavorite: (
    userId: string,
    outfitId: string,
    currentlyFavorited: boolean,
  ) => Promise<boolean>;
  resetPrivateState: () => undefined;
}

export const useOutfitStore = create<OutfitState>((set, get) => ({
  savedCount: 0,
  favoriteCount: 0,

  toggleFavorite: async (userId, outfitId, currentlyFavorited) => {
    try {
      if (currentlyFavorited) {
        const { error } = await supabase
          .from('outfit_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('outfit_id', outfitId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('outfit_favorites')
          .insert({ user_id: userId, outfit_id: outfitId });
        // 唯一约束冲突（已收藏）视为成功
        if (error && error.code !== '23505') throw error;
      }
      await get().refreshCounts(userId);
      return !currentlyFavorited;
    } catch (e: any) {
      console.warn('[outfitStore] toggleFavorite error:', e?.message);
      return currentlyFavorited;
    }
  },

  refreshCounts: async (userId: string) => {
    await runScopedStoreRead({
      scope: webAccountScope,
      expectedAccountId: userId,
      slot: secondaryStoreReadSlots.outfitCounts,
      execute: async ({ accountId }) => {
        const [outfitRes, favRes] = await Promise.all([
          supabase
            .from('outfits')
            .select('outfit_id', { count: 'exact', head: true })
            .eq('user_id', accountId),
          supabase
            .from('outfit_favorites')
            .select('favorite_id', { count: 'exact', head: true })
            .eq('user_id', accountId),
        ]);
        if (outfitRes.error) throw outfitRes.error;
        if (favRes.error) throw favRes.error;
        return {
          savedCount: outfitRes.count ?? 0,
          favoriteCount: favRes.count ?? 0,
        };
      },
      apply: (counts) => {
        set(counts);
        return undefined;
      },
    });
  },

  resetPrivateState: () => {
    secondaryStoreReadSlots.outfitCounts.cancel();
    set(outfitPrivateReset());
    return undefined;
  },
}));
