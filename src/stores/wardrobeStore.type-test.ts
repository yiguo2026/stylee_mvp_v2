import type { WardrobeState } from './wardrobeStore';

declare const state: WardrobeState;

const updateResult: Promise<boolean> = state.updateItem('item-1', {
  image_url: 'https://storage.test/replacement.png',
});

void updateResult;
