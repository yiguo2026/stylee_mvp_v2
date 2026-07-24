// ─────────────────────────────────────────────────────────
// preferenceStore.ts — 用户搭配偏好学习（D04 / P01）
// ─────────────────────────────────────────────────────────
// 收藏 → 记录 {风格 + 品类 + 配色} → 累计 ≥3 套同风格进入 Top 偏好。
// Web 端用 localStorage 持久化；Native 端仅在内存中（demo 用途）。
// ─────────────────────────────────────────────────────────

import { create } from 'zustand';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
const STORAGE_KEY = 'stylee-preference-store-v1';

export interface PreferenceRecord {
  ts: number;
  styleId?: string;   // 主风格 id（如无则不计入 topStyles 权重）
  auxStyleId?: string;
  sceneCode?: string; // S01..S08
  categories: string[]; // 出现在该套搭配里的品类列表
  colors: string[];     // 出现在该套搭配里的配色列表
}

interface PersistShape {
  records: PreferenceRecord[];
}

interface PreferenceState {
  records: PreferenceRecord[];
  /** 从上一次收藏至今连续 “换一套” 的次数，仅内存。 */
  consecutiveSwapsSinceFavorite: number;
  /** 会话内是否已经提示过“试试切换风格”（避免每次刷屏） */
  swapHintShownAt: number | null;

  recordFavorite: (r: Omit<PreferenceRecord, 'ts'>) => void;
  removeFavorite: (styleId?: string, categories?: string[]) => void;

  getStyleCount: (styleId: string) => number;
  /** ≥3 套同风格 → Top 偏好，按次数降序返回 styleId。 */
  getTopStyleIds: () => string[];
  /** 权重排序全部收藏过的风格（>=1 次）。 */
  getStyleRanking: () => Array<{ styleId: string; count: number }>;
  /** 常用配色 Top-N。 */
  getTopColors: (limit?: number) => string[];

  registerSwap: () => number;
  resetSwaps: () => void;

  hydrate: () => void;
  reset: () => void;
}

function loadPersisted(): PersistShape | null {
  if (!isWeb) return null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.records)) return parsed as PersistShape;
  } catch {}
  return null;
}

function savePersisted(records: PreferenceRecord[]) {
  if (!isWeb) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ records } satisfies PersistShape));
    }
  } catch {}
}

const initial = loadPersisted();

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  records: initial?.records ?? [],
  consecutiveSwapsSinceFavorite: 0,
  swapHintShownAt: null,

  recordFavorite: (r) => {
    const rec: PreferenceRecord = { ts: Date.now(), ...r };
    const records = [...get().records, rec];
    savePersisted(records);
    set({ records, consecutiveSwapsSinceFavorite: 0, swapHintShownAt: null });
  },

  removeFavorite: (styleId, categories) => {
    // 简化：命中 (styleId + 相同 categories) 的最早一条移除；主要用于取消收藏场景。
    const records = get().records.slice();
    const idx = records.findIndex(
      (rc) => rc.styleId === styleId &&
        (!categories || categories.every((c) => rc.categories.includes(c))),
    );
    if (idx >= 0) {
      records.splice(idx, 1);
      savePersisted(records);
      set({ records });
    }
  },

  getStyleCount: (styleId) =>
    get().records.reduce((n, r) => (r.styleId === styleId ? n + 1 : n), 0),

  getTopStyleIds: () => {
    const counts = new Map<string, number>();
    get().records.forEach((r) => {
      if (r.styleId) counts.set(r.styleId, (counts.get(r.styleId) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  },

  getStyleRanking: () => {
    const counts = new Map<string, number>();
    get().records.forEach((r) => {
      if (r.styleId) counts.set(r.styleId, (counts.get(r.styleId) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([styleId, count]) => ({ styleId, count }))
      .sort((a, b) => b.count - a.count);
  },

  getTopColors: (limit = 3) => {
    const counts = new Map<string, number>();
    get().records.forEach((r) => {
      r.colors.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([c]) => c);
  },

  registerSwap: () => {
    const next = get().consecutiveSwapsSinceFavorite + 1;
    set({ consecutiveSwapsSinceFavorite: next });
    return next;
  },

  resetSwaps: () => set({ consecutiveSwapsSinceFavorite: 0, swapHintShownAt: null }),

  hydrate: () => {
    const persisted = loadPersisted();
    if (persisted) set({ records: persisted.records });
  },

  reset: () => {
    savePersisted([]);
    set({ records: [], consecutiveSwapsSinceFavorite: 0, swapHintShownAt: null });
  },
}));
