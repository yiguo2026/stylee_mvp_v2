import { create } from 'zustand';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

const webStorage = {
  getItem: (name: string) => {
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name: string, value: string) => {
    try { localStorage.setItem(name, value); } catch {}
  },
  removeItem: (name: string) => {
    try { localStorage.removeItem(name); } catch {}
  },
};

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

  setSelfie: (uri: string | null) => void;
  setSelectedOutfit: (id: string | null) => void;
  setSelectedScene: (scene: string) => void;
  setTryOnResult: (uri: string | null) => void;
  addRecord: (record: Omit<TryOnRecord, 'id' | 'createdAt'>) => void;
  clearAll: () => void;
}

const STORAGE_KEY = 'stylee-tryon';
const RECORDS_KEY = 'stylee-tryon-records';

const loadPersisted = (): Partial<TryOnState> => {
  if (!isWeb) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const loadRecords = (): TryOnRecord[] => {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
};

const persistState = (state: Partial<TryOnState>) => {
  if (!isWeb) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selfieUri: state.selfieUri,
      selectedScene: state.selectedScene,
    }));
  } catch {}
};

const persistRecords = (records: TryOnRecord[]) => {
  if (!isWeb) return;
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {}
};

export const useTryOnStore = create<TryOnState>()((set) => {
  const saved = loadPersisted();
  return {
    selfieUri: saved.selfieUri ?? null,
    selectedOutfitId: null,
    selectedScene: saved.selectedScene ?? 'cafe',
    tryOnResult: null,
    records: loadRecords(),

    setSelfie: (uri) => { set({ selfieUri: uri }); persistState({ selfieUri: uri }); },
    setSelectedOutfit: (id) => set({ selectedOutfitId: id }),
    setSelectedScene: (scene) => { set({ selectedScene: scene }); persistState({ selectedScene: scene }); },
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
    clearAll: () => set({ selfieUri: null, selectedOutfitId: null, selectedScene: 'cafe', tryOnResult: null }),
  };
});
