import { create } from 'zustand';
import { WishlistItem } from '@/types';
import { supabase } from '@/lib/supabase';

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
        .insert(item)
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
    try {
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('wish_id', wishId);
      if (error) throw error;
      set(state => ({ items: state.items.filter(i => i.wish_id !== wishId) }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  moveToWardrobe: async (wishId) => {
    const item = get().items.find(i => i.wish_id === wishId);
    if (!item) return;

    try {
      // Insert into wardrobe_items
      const { error: insertError } = await supabase
        .from('wardrobe_items')
        .insert({
          user_id: item.user_id,
          name: item.name,
          category: item.category,
          color: item.color,
          image_url: item.image_url,
          source_type: 'ai_recommended',
          source_label: item.source === 'ai_recommended' ? '来自心愿单' : '手动添加',
          status: 'active',
        });
      if (insertError) throw insertError;

      // Remove from wishlist
      const { error: deleteError } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('wish_id', wishId);
      if (deleteError) throw deleteError;

      set(state => ({ items: state.items.filter(i => i.wish_id !== wishId) }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },
}));
