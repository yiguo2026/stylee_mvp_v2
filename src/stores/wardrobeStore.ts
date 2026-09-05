import { create } from 'zustand';
import { WardrobeItem, normalizeCategory } from '@/types';
import { supabase } from '@/lib/supabase';
import {
  WARDROBE_IMPORT_CONFLICT_TARGET,
  wardrobePersistenceMethod,
} from '@/lib/wardrobePersistencePolicy';
import {
  applyWardrobeOptimisticUpdate,
  runRollbackableWardrobeUpdate,
  type WardrobeMutationGenerations,
  type WardrobeRollbackTransaction,
} from '@/lib/wardrobeOptimisticUpdate';
import { wardrobePrivateReset } from '@/lib/privateStateReset';
import { webAccountScope } from '@/lib/accountScopeRuntime';
import { createLatestReadSlot, runScopedStoreRead } from '@/lib/scopedStoreRead';
import { mergeWardrobeRead } from '@/lib/storeReadPolicy';

export interface WardrobeState {
  items: WardrobeItem[];
  isLoading: boolean;
  error: string | null;

  // —— 本次会话的本地乐观改动，用于在 focus 重新拉取云端数据（fetchItems）时把本地
  // 视为可信来源覆盖回去：demo 环境云端可能鉴权失效/写入被丢弃（例如 price 清空时
  // supabase.update({price: undefined}) 会在序列化时丢弃 undefined 字段，导致云端从未
  // 真正清除），若直接用云端旧数据覆盖，就会出现「删除的属性再次进入详情页又出现」。
  pendingEdits: Record<string, Partial<WardrobeItem>>;
  deletedIds: string[];
  mutationGenerations: WardrobeMutationGenerations;

  fetchItems: (userId: string) => Promise<void>;
  addItem: (item: Omit<WardrobeItem, 'item_id' | 'created_at' | 'updated_at'>) => Promise<WardrobeItem | null>;
  updateItem: (itemId: string, updates: Partial<WardrobeItem>) => Promise<boolean>;
  updateItemWithRollback: (itemId: string, updates: Partial<WardrobeItem>) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<void>;
  incrementWearCount: (itemId: string) => Promise<void>;
  setItems: (items: WardrobeItem[]) => void;
  resetPrivateState: () => undefined;
}

// 计算每件单品的穿搭次数（含此单品的搭配数）与收藏次数（含此单品的收藏搭配数）
async function fetchItemUsageStats(accountId: string): Promise<Record<string, { wear: number; favorite: number }>> {
  const stats: Record<string, { wear: number; favorite: number }> = {};
  const { data: outfits, error: outfitsError } = await supabase
    .from('outfits')
    .select('outfit_id')
    .eq('user_id', accountId);
  if (outfitsError) throw outfitsError;
  const outfitIds = (outfits ?? []).map((o: any) => o.outfit_id);
  if (outfitIds.length === 0) return stats;

  const { data: favs, error: favoritesError } = await supabase
    .from('outfit_favorites')
    .select('outfit_id')
    .eq('user_id', accountId);
  if (favoritesError) throw favoritesError;
  const favSet = new Set((favs ?? []).map((f: any) => f.outfit_id));

  const { data: rows, error: outfitItemsError } = await supabase
    .from('outfit_items')
    .select('item_id, outfit_id')
    .in('outfit_id', outfitIds);
  if (outfitItemsError) throw outfitItemsError;

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

type WardrobeStoreSetter = (
  updater: (state: WardrobeState) => Partial<WardrobeState>,
) => void;

function applyOptimisticUpdate(
  set: WardrobeStoreSetter,
  itemId: string,
  updates: Partial<WardrobeItem>,
  updatedAt: string,
): WardrobeRollbackTransaction {
  let transaction: WardrobeRollbackTransaction | undefined;
  set((state) => {
    const applied = applyWardrobeOptimisticUpdate({
      items: state.items,
      pendingEdits: state.pendingEdits,
      mutationGenerations: state.mutationGenerations,
    }, itemId, updates, updatedAt);
    transaction = applied.transaction;
    return applied.state;
  });
  if (!transaction) throw new Error('optimistic wardrobe update did not start');
  return transaction;
}

const wardrobeReadSlot = createLatestReadSlot();

export const useWardrobeStore = create<WardrobeState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  pendingEdits: {},
  deletedIds: [],
  mutationGenerations: {},

  setItems: (items) => set({ items }),

  fetchItems: async (userId: string) => {
    await runScopedStoreRead({
      scope: webAccountScope,
      expectedAccountId: userId,
      slot: wardrobeReadSlot,
      execute: async ({ accountId }) => {
        const { data, error } = await supabase
          .from('wardrobe_items')
          .select('*')
          .eq('user_id', accountId)
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const rawItems = (data ?? []) as WardrobeItem[];

        // Stats are allowed to degrade, but a failed response is never interpreted as zero counts.
        let stats: Record<string, { wear: number; favorite: number }> | null;
        try {
          stats = await fetchItemUsageStats(accountId);
        } catch {
          stats = null;
        }
        return { rawItems, stats };
      },
      apply: ({ rawItems, stats }) => {
        const { pendingEdits, deletedIds } = get();
        if (stats === null) console.warn('[WardrobeStore] usage stats read failed');
        set({
          items: mergeWardrobeRead({
            rawItems,
            stats,
            pendingEdits,
            deletedIds,
          }),
        });
        return undefined;
      },
      onError: () => {
        set({ error: '衣橱加载失败，请重试' });
        return undefined;
      },
      onLoadingChange: (isLoading) => {
        set(isLoading ? { isLoading: true, error: null } : { isLoading: false });
        return undefined;
      },
    });
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
      const wardrobeTable = supabase.from('wardrobe_items');
      const write = wardrobePersistenceMethod(payload) === 'upsert'
        ? wardrobeTable.upsert(payload, {
            onConflict: WARDROBE_IMPORT_CONFLICT_TARGET,
            ignoreDuplicates: false,
          })
        : wardrobeTable.insert(payload);
      const { data, error } = await write.select().single();
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
    // 先做乐观本地更新：保证即使云端（Supabase）鉴权异常/离线，
    // 用户在单品详情页的编辑也能即时生效并在本次会话内保留，
    // 避免「加完属性、离开再进来就没了」。
    // 同时把改动累加进 pendingEdits，并本地 bump updated_at，
    // 使 focus 重新 fetchItems 时本地覆盖云端旧值、详情页 resync 也能感知变化。
    const now = new Date().toISOString();
    applyOptimisticUpdate(set, itemId, updates, now);
    try {
      const { error } = await supabase
        .from('wardrobe_items')
        .update({ ...updates, updated_at: now })
        .eq('item_id', itemId);
      if (error) throw error;
      return true;
    } catch (e: any) {
      // 云端写入失败不回滚本地更改（demo 环境云端可能不可用），仅记录错误
      set({ error: e.message });
      return false;
    }
  },

  updateItemWithRollback: async (itemId, updates) => {
    const now = new Date().toISOString();
    const result = await runRollbackableWardrobeUpdate({
      getState: () => {
        const state = get();
        return {
          items: state.items,
          pendingEdits: state.pendingEdits,
          mutationGenerations: state.mutationGenerations,
        };
      },
      setState: (next) => { set(next); },
      itemId,
      updates,
      updatedAt: now,
      persist: async (payload) => {
        const { error } = await supabase
          .from('wardrobe_items')
          .update(payload)
          .eq('item_id', itemId);
        if (error) throw error;
      },
    });
    if (result.ok) return true;
    const message = result.error instanceof Error
      ? result.error.message
      : String(result.error);
    set({ error: message });
    return false;
  },

  deleteItem: async (itemId) => {
    // 乐观删除：先从本地列表移除（与 updateItem 的乐观策略一致），
    // 保证即使云端鉴权异常/离线，用户的删除操作也能即时反映在 UI 上，
    // 并记入 deletedIds，避免 focus 重新 fetchItems 时被云端旧数据「复活」。
    set(state => ({
      items: state.items.filter(i => i.item_id !== itemId),
      deletedIds: state.deletedIds.includes(itemId) ? state.deletedIds : [...state.deletedIds, itemId],
    }));
    try {
      const { error } = await supabase
        .from('wardrobe_items')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('item_id', itemId);
      if (error) throw error;
    } catch (e: any) {
      // 云端失败不还原本地删除（demo 环境云端可能不可用），仅记录错误
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

  resetPrivateState: () => {
    wardrobeReadSlot.cancel();
    set(wardrobePrivateReset());
    return undefined;
  },
}));
