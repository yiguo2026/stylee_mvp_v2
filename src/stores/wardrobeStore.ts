import { create } from 'zustand';
import { WardrobeItem } from '@/types';
import { supabase } from '@/lib/supabase';

interface WardrobeState {
  items: WardrobeItem[];
  isLoading: boolean;
  error: string | null;

  fetchItems: (userId: string) => Promise<void>;
  addItem: (item: Omit<WardrobeItem, 'item_id' | 'created_at' | 'updated_at'>) => Promise<WardrobeItem | null>;
  updateItem: (itemId: string, updates: Partial<WardrobeItem>) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  incrementWearCount: (itemId: string) => Promise<void>;
  setItems: (items: WardrobeItem[]) => void;
}

export const useWardrobeStore = create<WardrobeState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  setItems: (items) => set({ items }),

  fetchItems: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wardrobe_items')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ items: (data ?? []) as WardrobeItem[] });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  addItem: async (item) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('wardrobe_items')
        .insert(item)
        .select()
        .single();
      if (error) throw error;
      const newItem = data as WardrobeItem;
      set(state => ({ items: [newItem, ...state.items] }));
      return newItem;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  updateItem: async (itemId, updates) => {
    try {
      const { error } = await supabase
        .from('wardrobe_items')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('item_id', itemId);
      if (error) throw error;
      set(state => ({
        items: state.items.map(i => i.item_id === itemId ? { ...i, ...updates } : i),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteItem: async (itemId) => {
    try {
      const { error } = await supabase
        .from('wardrobe_items')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('item_id', itemId);
      if (error) throw error;
      set(state => ({ items: state.items.filter(i => i.item_id !== itemId) }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  incrementWearCount: async (itemId) => {
    const item = get().items.find(i => i.item_id === itemId);
    if (!item) return;
    const newCount = (item.wear_count ?? 0) + 1;
    try {
      const { error } = await supabase
        .from('wardrobe_items')
        .update({ wear_count: newCount, last_worn_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('item_id', itemId);
      if (error) throw error;
      set(state => ({
        items: state.items.map(i => i.item_id === itemId ? { ...i, wear_count: newCount, last_worn_at: new Date().toISOString() } : i),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },
}));
