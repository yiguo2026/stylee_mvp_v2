import { create } from 'zustand';
import { Platform } from 'react-native';
import { loadSelfie } from '@/lib/bodyModel';
import { supabase } from '@/lib/supabase';
import type { TryOnSuggestion } from '@/lib/ai';

const isWeb = Platform.OS === 'web';

export interface TryOnRecordItem {
  name: string;
  category: string;
  color?: string;
  image_url?: string;
}

export interface TryOnRecord {
  record_id: string;
  user_id: string;
  scene: string;
  sceneLabel: string;
  outfitName: string;
  items: TryOnRecordItem[];
  selfieUri: string | null;
  resultImageUrl: string | null;
  suggestion: TryOnSuggestion | null;
  createdAt: string;
}

interface TryOnState {
  selfieUri: string | null;
  selectedOutfitId: string | null;
  selectedScene: string;
  tryOnResult: string | null;
  records: TryOnRecord[];
  loaded: boolean;

  setSelfie: (uri: string | null) => void;
  setSelectedOutfit: (id: string | null) => void;
  setSelectedScene: (scene: string) => void;
  setTryOnResult: (uri: string | null) => void;
  addRecord: (record: Omit<TryOnRecord, 'record_id' | 'user_id' | 'createdAt'>, userId: string) => Promise<void>;
  fetchRecords: (userId: string) => Promise<void>;
  loadSelfieFromServer: (userId: string) => Promise<void>;
  clearAll: () => void;
}

const SCENE_KEY = 'stylee-tryon-scene';

const loadPersistedScene = (): string => {
  if (!isWeb) return 'cafe';
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return 'cafe';
};

const persistScene = (scene: string) => {
  if (!isWeb) return;
  try { localStorage.setItem(SCENE_KEY, JSON.stringify(scene)); } catch {}
};

function dbRowToRecord(row: any): TryOnRecord {
  return {
    record_id: row.record_id,
    user_id: row.user_id,
    scene: row.scene,
    sceneLabel: row.scene_label ?? '',
    outfitName: row.outfit_name ?? '',
    items: Array.isArray(row.items) ? row.items : [],
    selfieUri: row.selfie_url ?? null,
    resultImageUrl: row.result_image_url ?? null,
    suggestion: row.suggestion ?? null,
    createdAt: row.created_at ?? '',
  };
}

export const useTryOnStore = create<TryOnState>()((set, get) => ({
  selfieUri: null,
  selectedOutfitId: null,
  selectedScene: loadPersistedScene(),
  tryOnResult: null,
  records: [],
  loaded: false,

  setSelfie: (uri) => set({ selfieUri: uri }),
  setSelectedOutfit: (id) => set({ selectedOutfitId: id }),
  setSelectedScene: (scene) => { set({ selectedScene: scene }); persistScene(scene); },
  setTryOnResult: (uri) => set({ tryOnResult: uri }),

  addRecord: async (record, userId) => {
    const { data, error } = await supabase
      .from('tryon_records')
      .insert({
        user_id: userId,
        scene: record.scene,
        scene_label: record.sceneLabel,
        outfit_name: record.outfitName,
        items: record.items,
        selfie_url: record.selfieUri,
        result_image_url: record.resultImageUrl,
        suggestion: record.suggestion,
      })
      .select()
      .single();

    if (error) {
      console.warn('[tryonStore] addRecord failed:', error.message);
      return;
    }

    if (data) {
      const newRecord = dbRowToRecord(data);
      set((state) => ({ records: [newRecord, ...state.records] }));
    }
  },

  fetchRecords: async (userId) => {
    const { data, error } = await supabase
      .from('tryon_records')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[tryonStore] fetchRecords failed:', error.message);
      return;
    }

    const records = (data ?? []).map(dbRowToRecord);
    set({ records });
  },

  loadSelfieFromServer: async (userId) => {
    const url = await loadSelfie(userId);
    set({ selfieUri: url, loaded: true });
  },

  clearAll: () => set({ selfieUri: null, selectedOutfitId: null, selectedScene: 'cafe', tryOnResult: null }),
}));
