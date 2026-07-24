import { create } from 'zustand';
import { WardrobeItem, normalizeCategory } from '@/types';
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

// 计算每件单品的穿搭次数（含此单品的搭配数）与收藏次数（含此单品的收藏搭配数）
async function fetchItemUsageStats(userId: string): Promise<Record<string, { wear: number; favorite: number }>> {
  const stats: Record<string, { wear: number; favorite: number }> = {};
  const { data: outfits } = await supabase
    .from('outfits')
    .select('outfit_id')
    .eq('user_id', userId);
  const outfitIds = (outfits ?? []).map((o: any) => o.outfit_id);
  if (outfitIds.length === 0) return stats;

  const { data: favs } = await supabase
    .from('outfit_favorites')
    .select('outfit_id')
    .eq('user_id', userId);
  const favSet = new Set((favs ?? []).map((f: any) => f.outfit_id));

  const { data: rows } = await supabase
    .from('outfit_items')
    .select('item_id, outfit_id')
    .in('outfit_id', outfitIds);

  for (const r of rows ?? []) {
    const s = stats[r.item_id] ?? { wear: 0, favorite: 0 };
    s.wear += 1;
    if (favSet.has(r.outfit_id)) s.favorite += 1;
    stats[r.item_id] = s;
  }
  return stats;
}

function sortWardrobeItemsNewestFirst(items: WardrobeItem[]): WardrobeItem[] {
  return [...items].sort((a, b) => {
    const createdDiff = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    if (createdDiff !== 0) return createdDiff;

    const updatedDiff = new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
    if (updatedDiff !== 0) return updatedDiff;

    return 0;
  });
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
      const rawItems = (data ?? []) as WardrobeItem[];

      // 附加穿搭/收藏次数，但衣橱列表始终保持按最新创建时间倒序展示
      let items = rawItems;
      try {
        const stats = await fetchItemUsageStats(userId);
        items = rawItems.map(it => {
          const s = stats[it.item_id] ?? { wear: 0, favorite: 0 };
          return { ...it, wear_count: s.wear, favorite_count: s.favorite };
        });
      } catch (statErr) {
        console.warn('[wardrobeStore.fetchItems] usage stats failed:', statErr);
      }
      items = sortWardrobeItemsNewestFirst(items);

      set({ items });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  addItem: async (item) => {
    set({ isLoading: true, error: null });
    try {
      const now = new Date().toISOString();
      const payload = {
        ...item,
        category: normalizeCategory(item.category),
        created_at: (item as Partial<WardrobeItem>).created_at ?? now,
        updated_at: (item as Partial<WardrobeItem>).updated_at ?? now,
      };
      const { data, error } = await supabase
        .from('wardrobe_items')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const newItem = data as WardrobeItem;
      set(state => ({ items: sortWardrobeItemsNewestFirst([newItem, ...state.items]) }));
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
