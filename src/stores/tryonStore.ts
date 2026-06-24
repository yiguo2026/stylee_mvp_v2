import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const useTryOnStore = create<TryOnState>()(
  persist(
    (set) => ({
      selfieUri: null,
      selectedOutfitId: null,
      selectedScene: 'cafe',
      tryOnResult: null,

      setSelfie: (uri) => set({ selfieUri: uri }),
      setSelectedOutfit: (id) => set({ selectedOutfitId: id }),
      setSelectedScene: (scene) => set({ selectedScene: scene }),
      setTryOnResult: (uri) => set({ tryOnResult: uri }),
      clearAll: () => set({ selfieUri: null, selectedOutfitId: null, selectedScene: 'cafe', tryOnResult: null }),
    }),
    {
      name: 'stylee-tryon',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selfieUri: state.selfieUri,
        selectedScene: state.selectedScene,
      }),
    },
  ),
);
