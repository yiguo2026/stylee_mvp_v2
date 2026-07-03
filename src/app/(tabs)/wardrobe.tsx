import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, SafeAreaView, RefreshControl,
  TextInput, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Fonts, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { WardrobeItem, ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL } from '@/types';
import { aiExtractProductFromLink } from '@/lib/ai';

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

function LinkImportModal({ visible, url, onChangeUrl, importing, onImport, onClose }: {
  visible: boolean; url: string; onChangeUrl: (v: string) => void;
  importing: boolean; onImport: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.linkHeader}>
            <Text style={styles.linkTitle}>🔗 链接导入</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.linkClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.linkLabel}>商品链接</Text>
          <TextInput
            style={styles.linkInput}
            placeholder="粘贴商品链接…"
            placeholderTextColor={Colors.walnut2}
            value={url}
            onChangeText={onChangeUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.linkHint}>AI 将自动识别商品信息并填入衣橱</Text>
          <TouchableOpacity
            style={[styles.linkImportBtn, importing && styles.disabled]}
            onPress={onImport}
            disabled={importing}
          >
            {importing
              ? <ActivityIndicator color={Colors.paper} />
              : <Text style={styles.linkImportBtnText}>导入商品</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkImporting, setLinkImporting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchItems(user.id);
      fetchWishlist(user.id);
    }
  }, [user]);

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

  const handleLinkImport = async () => {
    if (!linkUrl.trim() || !user) return;
    setLinkImporting(true);
    try {
      const product = await aiExtractProductFromLink(linkUrl.trim());
      const { addItem } = useWardrobeStore.getState();
      await addItem({
        user_id: user.id,
        name: product?.name ?? '链接导入商品',
        category: product?.category ?? '上装',
        color: product?.color ?? '未知',
        material: product?.material || undefined,
        brand: product?.brand || undefined,
        source_type: 'link',
        source_label: linkUrl.trim(),
        status: 'active',
      });
      setLinkUrl('');
      setShowLinkModal(false);
      Alert.alert('导入成功', '商品已添加到衣橱，请编辑补充详细信息');
    } catch (e: any) {
      Alert.alert('导入失败', e.message || '请稍后重试');
    } finally {
      setLinkImporting(false);
    }
  };

  const handleMoveToWardrobe = async (wishId: string) => {
    await moveToWardrobe(wishId);
    if (user) fetchItems(user.id);
  };

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
            <Text style={styles.emptyTitle}>
              {selectedCategory === '全部' ? '还没有衣物' : `没有${selectedCategory}类型的衣物`}
            </Text>
            <Text style={styles.emptySub}>添加第一件衣服，开启你的数字衣橱</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map(item => (
              <ItemCard key={item.item_id} item={item} />
            ))}
          </View>
        )}

        {/* Wishlist Entry (bottom of page) */}
        <View style={styles.wishlistEntry}>
          <TouchableOpacity style={styles.wishlistEntryBtn} onPress={() => setShowWishlist(true)}>
            <Text style={styles.wishlistEntryIcon}>♡</Text>
            <Text style={styles.wishlistEntryLabel}>心愿单</Text>
            {wishlistItems.length > 0 && (
              <View style={styles.wishlistEntryBadge}>
                <Text style={styles.wishlistEntryBadgeText}>{wishlistItems.length}</Text>
              </View>
            )}
            <Text style={styles.wishlistEntryArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Add Section */}
        <View style={styles.quickAddEntry}>
          <TouchableOpacity style={styles.quickAddEntryBtn} onPress={() => router.push('/wardrobe/quick-add')}>
            <View style={styles.quickAddEntryIcon}>
              <Text style={styles.quickAddEntryIconText}>✨</Text>
            </View>
            <View style={styles.quickAddEntryInfo}>
              <Text style={styles.quickAddEntryTitle}>快速添加推荐单品</Text>
              <Text style={styles.quickAddEntrySub}>从热门基础款中一键补充衣橱</Text>
            </View>
            <Text style={styles.quickAddEntryArrow}>›</Text>
          </TouchableOpacity>
        </View>

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
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalWarning}>⚠️ 仅支持单品上传，请每次上传一件衣物</Text>

            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowAddModal(false); router.push('/wardrobe/add'); }}>
              <Text style={styles.modalOptionIcon}>🖼️</Text>
              <Text style={styles.modalOptionText}>单品录入</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowAddModal(false); router.push('/wardrobe/batch'); }}>
              <Text style={styles.modalOptionIcon}>📚</Text>
              <Text style={styles.modalOptionText}>批量导入</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowAddModal(false); setShowLinkModal(true); }}>
              <Text style={styles.modalOptionIcon}>🔗</Text>
              <Text style={styles.modalOptionText}>链接导入</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Link Import Modal */}
      <LinkImportModal
        visible={showLinkModal}
        url={linkUrl}
        onChangeUrl={setLinkUrl}
        importing={linkImporting}
        onImport={handleLinkImport}
        onClose={() => setShowLinkModal(false)}
      />

      {/* Wishlist Overlay (slide-in full page) */}
      <Modal visible={showWishlist} animationType="slide">
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
                    <TouchableOpacity style={styles.wishAddBtn} onPress={() => handleMoveToWardrobe(wish.wish_id)}>
                      <Text style={styles.wishAddBtnText}>转入衣橱</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(wish.wish_id)}>
                      <Text style={styles.wishRemoveText}>移除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two,
  },
  title: { ...T.pageTitle },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.four, marginBottom: Spacing.two,
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.paper, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six,
  },
  modalWarning: { ...T.bodyText, fontSize: 13, color: Colors.walnut, textAlign: 'center', marginBottom: Spacing.one },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.two,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  modalOptionIcon: { fontSize: 22 },
  modalOptionText: { ...T.bodyText, fontSize: 16, color: Colors.ink },
  modalCancel: { alignItems: 'center', paddingVertical: Spacing.three, marginTop: Spacing.one },
  modalCancelText: { ...T.bodyText, fontSize: 16, color: Colors.walnut },

  linkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two },
  linkTitle: { ...T.bodyText, fontFamily: Fonts.cnTitle, fontSize: 18, color: Colors.ink },
  linkClose: { fontSize: 18, color: Colors.walnut2 },
  linkLabel: { ...T.tag, fontSize: 12, color: Colors.walnut, marginBottom: Spacing.one },
  linkInput: {
    ...T.inputText, borderWidth: 1, borderColor: Colors.line, borderRadius: Radius.md,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, color: Colors.ink,
  },
  linkHint: { ...T.micro, color: Colors.walnut2, marginTop: Spacing.one },
  linkImportBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.three,
  },
  linkImportBtnText: { ...T.buttonPrimary, color: Colors.paper },
  disabled: { opacity: 0.6 },

  // Wishlist overlay (full page)
  wishlistOverlay: { flex: 1, backgroundColor: Colors.paper },
  wishlistHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  wishlistBack: { fontSize: 16, fontFamily: Fonts.uiSemiBold, color: Colors.ink },
  wishlistTitle: { fontSize: 18, fontFamily: Fonts.cnTitle, color: Colors.ink },
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
  wishRemoveText: { fontSize: 11, color: Colors.accent, textAlign: 'center' },
});
