import { createLatestReadSlot, type LatestReadSlot } from './scopedStoreRead.ts';

export interface SecondaryStoreReadSlots {
  readonly wishlist: LatestReadSlot;
  readonly outfitCounts: LatestReadSlot;
  readonly tryOnRecords: LatestReadSlot;
  readonly tryOnSelfie: LatestReadSlot;
}

export function createSecondaryStoreReadSlots(): SecondaryStoreReadSlots {
  return Object.freeze({
    wishlist: createLatestReadSlot(),
    outfitCounts: createLatestReadSlot(),
    tryOnRecords: createLatestReadSlot(),
    tryOnSelfie: createLatestReadSlot(),
  });
}

export const secondaryStoreReadSlots = createSecondaryStoreReadSlots();
