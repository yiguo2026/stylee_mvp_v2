import { create } from 'zustand';
import { WishlistItem, normalizeCategory } from '@/types';
import { supabase } from '@/lib/supabase';
import { useWardrobeStore } from '@/stores/wardrobeStore';

interface WishlistState {
  items: WishlistItem[];
  isLoading: boolean;
  error: string | null;

  fetchItems: (userId: string) => Promise<void>;
  addItem: (item: Omit<WishlistItem, 'wish_id' | 'created_at'>) => Promise<WishlistItem | null>;
  removeItem: (wishId: string) => Promise<void>;
  moveToWardrobe: (wishId: string) => Promise<void>;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchItems: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wishlist_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ items: (data ?? []) as WishlistItem[] });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  addItem: async (item) => {
    try {
      const { data, error } = await supabase
        .from('wishlist_items')
        .insert({ ...item, category: normalizeCategory(item.category) })
        .select()
        .single();
      if (error) throw error;
      const newItem = data as WishlistItem;
      set(state => ({ items: [newItem, ...state.items] }));
      return newItem;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  removeItem: async (wishId) => {
    // Optimistic UI: remove locally first so the user always sees feedback.
    const prev = get().items;
    set(state => ({ items: state.items.filter(i => i.wish_id !== wishId) }));
    try {
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('wish_id', wishId);
      if (error) throw error;
    } catch (e: any) {
      // Keep UI change; only log the failure so the demo flow feels responsive.
      console.warn('[wishlistStore.removeItem] supabase failed:', e?.message);
      set({ error: e.message });
      // If the wish_id was ephemeral (client-only) keep it removed; otherwise no rollback for MVP.
      void prev;
    }
  },

  moveToWardrobe: async (wishId) => {
    const item = get().items.find(i => i.wish_id === wishId);
    if (!item) return;

    // Optimistic UI: remove from wishlist locally first.
    const prevItems = get().items;
    set(state => ({ items: state.items.filter(i => i.wish_id !== wishId) }));

    try {
      // Insert into wardrobe_items
      const { error: insertError } = await supabase
        .from('wardrobe_items')
        .insert({
          user_id: item.user_id,
          name: item.name,
          category: normalizeCategory(item.category),
          color: item.color || '',
          image_url: item.image_url || null,
          source_type: 'manual',
          source_label: '来自心愿单',
          status: 'active',
        });
      if (insertError) {
        console.error('[wishlistStore.moveToWardrobe] insert failed:', insertError.message);
        set({ items: prevItems, error: insertError.message });
        return;
      }

      // Remove from wishlist server-side
      const { error: deleteError } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('wish_id', wishId);
      if (deleteError) {
        console.error('[wishlistStore.moveToWardrobe] delete failed:', deleteError.message);
        set({ error: deleteError.message });
        return;
      }

      // Refresh wardrobe so the new item appears
      try { await useWardrobeStore.getState().fetchItems(item.user_id); } catch {}
    } catch (e: any) {
      console.error('[wishlistStore.moveToWardrobe] unexpected error:', e?.message);
      set({ items: prevItems, error: e.message });
    }
  },
}));
