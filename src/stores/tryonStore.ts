import { create } from 'zustand';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// Web-safe storage wrapper (AsyncStorage uses import.meta which breaks web)
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

interface TryOnState {
  selfieUri: string | null;
  selectedOutfitId: string | null;
  selectedScene: string;
  tryOnResult: string | null;

  setSelfie: (uri: string | null) => void;
  setSelectedOutfit: (id: string | null) => void;
  setSelectedScene: (scene: string) => void;
  setTryOnResult: (uri: string | null) => void;
  clearAll: () => void;
}

const loadPersisted = (): Partial<TryOnState> => {
  if (!isWeb) return {};
  try {
    const raw = localStorage.getItem('stylee-tryon');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

const persistState = (state: Partial<TryOnState>) => {
  if (!isWeb) return;
  try {
    localStorage.setItem('stylee-tryon', JSON.stringify({
      selfieUri: state.selfieUri,
      selectedScene: state.selectedScene,
    }));
  } catch {}
};

export const useTryOnStore = create<TryOnState>()((set) => {
  const saved = loadPersisted();
  return {
    selfieUri: saved.selfieUri ?? null,
    selectedOutfitId: null,
    selectedScene: saved.selectedScene ?? 'cafe',
    tryOnResult: null,

    setSelfie: (uri) => { set({ selfieUri: uri }); persistState({ selfieUri: uri }); },
    setSelectedOutfit: (id) => set({ selectedOutfitId: id }),
    setSelectedScene: (scene) => { set({ selectedScene: scene }); persistState({ selectedScene: scene }); },
    setTryOnResult: (uri) => set({ tryOnResult: uri }),
    clearAll: () => set({ selfieUri: null, selectedOutfitId: null, selectedScene: 'cafe', tryOnResult: null }),
  };
});
