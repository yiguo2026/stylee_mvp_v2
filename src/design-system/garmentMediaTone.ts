import { ds } from './tokens.ts';

export type GarmentMediaTone = 'neutral' | 'owned' | 'recommended' | 'inverse';

export const garmentMediaBackgroundByTone: Record<GarmentMediaTone, string> = {
  neutral: ds.color.semantic.surface.card,
  owned: ds.color.semantic.surface.input,
  recommended: ds.color.semantic.status.attentionSubtle,
  inverse: ds.color.semantic.surface.inverse,
};
