import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Toast } from '@/components/Toast';

export default function WishlistPage() {
  const { user } = useUserStore();
  const { fetchItems: fetchWardrobe } = useWardrobeStore();
  const { items: wishlistItems, fetchItems: fetchWishlist, moveToWardrobe, removeItem } = useWishlistStore();

  const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message });
    toastTimerRef.current = setTimeout(() => setToast({ visible: false, message: '' }), 1600);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useFocusEffect(useCallback(() => {
    if (user) fetchWishlist(user.id);
  }, [fetchWishlist, user]));

  const handleMoveToWardrobe = async (wishId: string) => {
    await moveToWardrobe(wishId);
    if (user) fetchWardrobe(user.id);
    showToast('已转入衣橱');
  };

  const handleRemoveWish = async (wishId: string) => {
    await removeItem(wishId);
    showToast('已删除心愿单单品');
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/wardrobe');
  };

  return (
    <SafeAreaView style={styles.wishlistOverlay}>
      <View style={styles.wishlistHeader}>
        <TouchableOpacity onPress={handleBack} hitSlop={12}>
          <Text style={styles.wishlistBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.wishlistTitle}>心愿单</Text>
        <Text style={styles.wishlistCountText}>{wishlistItems.length} 件想要的</Text>
      </View>
      <ScrollView style={styles.wishlistBody} contentContainerStyle={{ paddingBottom: 40 }}>
        {wishlistItems.length === 0 ? (
          <View style={styles.wishlistEmpty}>
            <Text style={styles.wishlistEmptyText}>还没有心愿单哦{'\n'}AI 推荐时会自动加入</Text>
          </View>
        ) : (
          wishlistItems.map(wish => (
            <View key={wish.wish_id} style={styles.wishItem}>
              <View style={styles.wishItemImg}>
                {wish.image_url
                  ? <Image source={{ uri: wish.image_url }} style={styles.image} resizeMode="cover" />
                  : <View style={styles.wishImgPlaceholder}><CategoryIcon category={wish.category} size={32} color={Colors.walnut2} /></View>
                }
              </View>
              <View style={styles.wishItemInfo}>
                <Text style={styles.wishItemName} numberOfLines={1}>{wish.name}</Text>
                <Text style={styles.wishItemMeta}>{wish.category} · {wish.color} · {wish.source === 'ai_recommended' ? '来自AI推荐' : '手动添加'}</Text>
              </View>
              <View style={styles.wishItemActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.wishAddBtn}
                  onPress={() => handleMoveToWardrobe(wish.wish_id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.wishAddBtnText}>转入衣橱</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.wishRemoveBtn}
                  onPress={() => handleRemoveWish(wish.wish_id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.wishRemoveText}>删除</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wishlistOverlay: { flex: 1, backgroundColor: Colors.paper },
  wishlistHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  wishlistBack: { fontSize: 16, fontFamily: Fonts.uiSemiBold, color: Colors.ink },
  wishlistTitle: { fontSize: 18, fontFamily: Fonts.titleSerif, color: Colors.ink },
  wishlistCountText: { fontSize: 13, color: Colors.walnut2, marginLeft: 'auto' },
  wishlistBody: { flex: 1, padding: Spacing.four },
  wishlistEmpty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  wishlistEmptyText: { fontSize: 14, color: Colors.walnut2, textAlign: 'center', lineHeight: 24 },
  wishItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.paperCard, borderRadius: 16, padding: 14, marginBottom: 12,
    ...Shadow.one,
  },
  image: { width: '100%', height: '100%' },
  wishItemImg: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.paperCard },
  wishImgPlaceholder: { width: 64, height: 64, borderRadius: 12, backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center' },
  wishItemInfo: { flex: 1, minWidth: 0 },
  wishItemName: { fontSize: 14, fontFamily: Fonts.uiSemiBold, color: Colors.ink, marginBottom: 4 },
  wishItemMeta: { fontSize: 12, color: Colors.walnut2 },
  wishItemActions: { flexDirection: 'column', gap: 6, flexShrink: 0 },
  wishAddBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: Colors.ink,
  },
  wishAddBtnText: { fontSize: 11, fontFamily: Fonts.uiSemiBold, color: Colors.paper },
  wishRemoveBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  wishRemoveText: { fontSize: 11, color: Colors.accent, textAlign: 'center' },
});
