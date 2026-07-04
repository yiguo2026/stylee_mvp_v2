import { create } from 'zustand';
import { Platform } from 'react-native';
import { loadSelfie } from '@/lib/bodyModel';

const isWeb = Platform.OS === 'web';

export interface TryOnRecordItem {
  name: string;
  category: string;
  color?: string;
  image_url?: string;
}

export interface TryOnRecord {
  id: string;
  scene: string;
  sceneEmoji: string;
  sceneLabel: string;
  outfitName: string;
  items: TryOnRecordItem[];
  createdAt: string;
  selfieUri: string | null;
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
  addRecord: (record: Omit<TryOnRecord, 'id' | 'createdAt'>) => void;
  loadSelfieFromServer: (userId: string) => Promise<void>;
  clearAll: () => void;
}

const RECORDS_KEY = 'stylee-tryon-records';
const SCENE_KEY = 'stylee-tryon-scene';

const loadRecords = (): TryOnRecord[] => {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
};

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

const persistRecords = (records: TryOnRecord[]) => {
  if (!isWeb) return;
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch {}
};

export const useTryOnStore = create<TryOnState>()((set) => ({
  selfieUri: null,
  selectedOutfitId: null,
  selectedScene: loadPersistedScene(),
  tryOnResult: null,
  records: loadRecords(),
  loaded: false,

  setSelfie: (uri) => set({ selfieUri: uri }),
  setSelectedOutfit: (id) => set({ selectedOutfitId: id }),
  setSelectedScene: (scene) => { set({ selectedScene: scene }); persistScene(scene); },
  setTryOnResult: (uri) => set({ tryOnResult: uri }),
  addRecord: (record) => {
    const newRecord: TryOnRecord = {
      ...record,
      id: `tryon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => {
      const records = [newRecord, ...state.records].slice(0, 50);
      persistRecords(records);
      return { records };
    });
  },
  loadSelfieFromServer: async (userId) => {
    const url = await loadSelfie(userId);
    set({ selfieUri: url, loaded: true });
  },
  clearAll: () => set({ selfieUri: null, selectedOutfitId: null, selectedScene: 'cafe', tryOnResult: null }),
}));
