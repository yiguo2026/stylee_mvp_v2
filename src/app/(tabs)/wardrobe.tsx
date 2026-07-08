import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, RefreshControl,
  TextInput, Modal, ScrollView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Fonts, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { AddClothingSheet } from '@/components/AddClothingSheet';
import { Toast } from '@/components/Toast';
import { WardrobeItem, ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL } from '@/types';

const isWeb = Platform.OS === 'web';

function ItemCard({ item }: { item: WardrobeItem }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: '/wardrobe/[id]', params: { id: item.item_id } })}
    >
      <View style={styles.cardImage}>
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
          : (
            <View style={styles.imagePlaceholder}>
              <CategoryIcon category={item.category} size={44} color={Colors.walnut2} />
            </View>
          )
        }
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardMeta}>
          {item.color} · {item.category}
          {item.wear_count ? ` · 穿过${item.wear_count}次` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function WardrobeTab() {
  const { user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();
  const { items: wishlistItems, fetchItems: fetchWishlist, moveToWardrobe, removeItem } = useWishlistStore();
  const [selectedCategory, setSelectedCategory] = useState<ClothingCategory | '全部'>('全部');
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message });
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: '' });
    }, 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useFocusEffect(useCallback(() => {
    if (user) {
      fetchItems(user.id);
      fetchWishlist(user.id);
    }
  }, [fetchItems, fetchWishlist, user]));

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await Promise.all([fetchItems(user.id), fetchWishlist(user.id)]);
    }
    setRefreshing(false);
  };

  const categoryCounts = useCallback(() => {
    const counts: Record<string, number> = { '全部': items.length };
    for (const cat of CLOTHING_CATEGORIES_WITH_ALL) {
      if (cat !== '全部') counts[cat] = items.filter(i => i.category === cat).length;
    }
    return counts;
  }, [items]);
  const counts = categoryCounts();

  const filtered = items
    .filter(i => selectedCategory === '全部' || i.category === selectedCategory)
    .filter(i => {
      if (!searchText) return true;
      const q = searchText.trim();
      const SEARCH_ALIASES: Record<string, string[]> = {
        '裤子': ['裤', '下装'],
        '上衣': ['上装', '衬衫', 'T恤', '卫衣', '针织', '开衫'],
        '衣服': ['上装', '外套', '衬衫', 'T恤', '卫衣'],
        '裙子': ['裙', '连体装'],
        '鞋': ['鞋', '靴', '鞋履'],
        '包': ['包', '挎', '背包', '包袋'],
      };
      const terms = [q, ...(SEARCH_ALIASES[q] ?? [])];
      const haystack = [i.name, i.category, i.color, i.brand ?? '', i.material ?? ''].join(' ');
      return terms.some(t => haystack.includes(t));
    });

  const handleMoveToWardrobe = async (wishId: string) => {
    await moveToWardrobe(wishId);
    if (user) fetchItems(user.id);
    showToast('已转入衣橱');
  };

  const handleRemoveWish = async (wishId: string) => {
    await removeItem(wishId);
    showToast('已删除心愿单单品');
  };

  const wishlistOverlayContent = (
    <SafeAreaView style={styles.wishlistOverlay}>
      <View style={styles.wishlistHeader}>
        <TouchableOpacity onPress={() => setShowWishlist(false)} hitSlop={12}>
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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>衣橱</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Feather name="search" size={15} color={Colors.walnut2} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索单品..."
            placeholderTextColor={Colors.walnut2}
            value={searchText}
            onChangeText={setSearchText}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Category Pills — text only, count badge, fixed height */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {CLOTHING_CATEGORIES_WITH_ALL.map(cat => {
            const count = counts[cat] ?? 0;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.catPill, selectedCategory === cat && styles.catPillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catPillText, selectedCategory === cat && styles.catPillTextActive]}>
                  {cat}
                </Text>
                {count > 0 && (
                  <View style={[styles.catCount, selectedCategory === cat && styles.catCountActive]}>
                    <Text style={[styles.catCountText, selectedCategory === cat && styles.catCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* My Wardrobe Grid (first) */}
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="hanger" size={56} color={Colors.walnut2} />
            {selectedCategory === '全部' ? (
              <>
                <Text style={styles.emptyTitle}>还没有衣物</Text>
                <Text style={styles.emptySub}>添加第一件衣服，开启你的数字衣橱</Text>
              </>
            ) : (
              <Text style={styles.emptySub}>
                {`没有${selectedCategory}类型的衣物。添加第一件衣服，开启你的数字衣橱`}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map(item => (
              <ItemCard key={item.item_id} item={item} />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={24} color={Colors.paper} />
      </TouchableOpacity>

      {/* Add Modal */}
      <AddClothingSheet
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onOpenWishlist={() => setShowWishlist(true)}
        wishlistCount={wishlistItems.length}
      />

      {/* Wishlist Overlay (slide-in full page) */}
      {isWeb ? (
        showWishlist ? <View style={styles.webLayer}>{wishlistOverlayContent}</View> : null
      ) : (
        <Modal visible={showWishlist} animationType="slide" onRequestClose={() => setShowWishlist(false)}>
          {wishlistOverlayContent}
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
  },
  safe: { flex: 1, backgroundColor: Colors.paper, position: 'relative' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    minHeight: 44,
  },
  title: { ...T.pageTitle },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    paddingHorizontal: Spacing.two, borderWidth: 1, borderColor: Colors.line,
  },
  searchIcon: { marginRight: Spacing.one },
  searchInput: { ...T.inputText, flex: 1, paddingVertical: Spacing.two, color: Colors.ink },

  // Category pills — fixed 32px height, text only, count badge
  categoryList: { paddingHorizontal: Spacing.four, gap: Spacing.one, paddingBottom: Spacing.two },
  catPill: {
    position: 'relative',
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  catPillActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catPillText: { fontSize: 12, fontFamily: Fonts.ui, color: Colors.ink },
  catPillTextActive: { color: '#fff' },
  catCount: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.line, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  catCountActive: { backgroundColor: Colors.line },
  catCountText: { fontSize: 10, fontFamily: Fonts.uiSemiBold, color: Colors.gray1 },
  catCountTextActive: { color: Colors.gray1 },

  scrollContent: { flex: 1 },

  // Wardrobe grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.four, gap: Spacing.two },
  card: {
    width: '47.5%',
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    overflow: 'hidden', ...Shadow.one,
  },
  cardImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.paperCard },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paperCard },
  cardInfo: { padding: Spacing.two },
  cardName: { ...T.itemName },
  cardMeta: { ...T.micro, marginTop: 2 },

  emptyState: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.six, marginTop: Spacing.six },
  emptyTitle: { ...T.emptyTitle },
  emptySub: { ...T.itemDesc, textAlign: 'center' },

  // Wishlist entry (bottom of page)
  wishlistEntry: { paddingHorizontal: Spacing.four, marginTop: Spacing.three },
  wishlistEntryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, backgroundColor: Colors.accentSoft, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accentSoft,
  },
  wishlistEntryIcon: { fontSize: 20, color: Colors.accent },
  wishlistEntryLabel: { fontSize: 14, fontFamily: Fonts.uiSemiBold, color: Colors.accent },
  wishlistEntryBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  wishlistEntryBadgeText: { fontSize: 10, fontFamily: Fonts.uiSemiBold, color: Colors.paper },
  wishlistEntryArrow: { marginLeft: 'auto', fontSize: 16, color: Colors.accent },

  // Quick add entry
  quickAddEntry: { paddingHorizontal: Spacing.four, marginTop: Spacing.two, marginBottom: Spacing.four },
  quickAddEntryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: Colors.paperCard, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.line, borderStyle: 'dashed',
  },
  quickAddEntryIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center',
  },
  quickAddEntryIconText: { fontSize: 18 },
  quickAddEntryInfo: { flex: 1 },
  quickAddEntryTitle: { fontSize: 13, fontFamily: Fonts.uiSemiBold, color: Colors.ink },
  quickAddEntrySub: { fontSize: 11, color: Colors.gray1, marginTop: 2 },
  quickAddEntryArrow: { fontSize: 14, color: Colors.gray1 },

  fab: {
    position: 'absolute', bottom: Spacing.four + 60, right: Spacing.four,
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center', ...Shadow.two,
  },

  // Wishlist overlay (full page)
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
