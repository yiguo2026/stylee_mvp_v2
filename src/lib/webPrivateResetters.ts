import { installWebPrivateResetters } from '@/lib/accountScopeRuntime';
import { clearProfileCache } from '@/lib/profileCache';
import { createOrderedWebPrivateResetters } from '@/lib/privateStateReset';
import { useImportStore } from '@/stores/importStore';
import { useOutfitStore } from '@/stores/outfitStore';
import { usePreferenceStore } from '@/stores/preferenceStore';
import { useTryOnStore } from '@/stores/tryonStore';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';

installWebPrivateResetters(createOrderedWebPrivateResetters({
  import: () => useImportStore.getState().resetPrivateState(),
  tryon: () => useTryOnStore.getState().resetPrivateState(),
  wardrobe: () => useWardrobeStore.getState().resetPrivateState(),
  wishlist: () => useWishlistStore.getState().resetPrivateState(),
  outfit: () => useOutfitStore.getState().resetPrivateState(),
  preference: () => usePreferenceStore.getState().resetPrivateState(),
  user: () => useUserStore.getState().resetPrivateState(),
  profileCache: () => {
    const departingAccountId = useUserStore.getState().user?.id;
    if (departingAccountId) clearProfileCache(departingAccountId);
    return undefined;
  },
}));
