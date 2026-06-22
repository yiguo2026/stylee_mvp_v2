import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Image, SafeAreaView, RefreshControl,
  useWindowDimensions, TextInput, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { WardrobeItem, ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL, PRESET_BASIC_ITEMS } from '@/types';

const CATEGORY_EMOJIS: Record<string, string> = {
  '全部': '📦', '上装': '👕', '下装': '👖', '连体装': '👗',
  '外套': '🧥', '鞋': '👟', '包': '👜', '帽子': '🧢', '围巾': '🧣',
};

function ItemCard({ item, cardWidth }: { item: WardrobeItem; cardWidth: number }) {
  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
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
  const [linkUrl, setLinkUrl] = useState('');
  const [linkImporting, setLinkImporting] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - Spacing.four * 2 - Spacing.two) / 2;

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
    .filter(i => !searchText || i.name.includes(searchText) || i.color.includes(searchText) || (i.brand ?? '').includes(searchText));

  const handleLinkImport = async () => {
    if (!linkUrl.trim() || !user) return;
    setLinkImporting(true);
    try {
      const { addItem } = useWardrobeStore.getState();
      await addItem({
        user_id: user.id,
        name: '链接导入商品',
        category: '上装',
        color: '未知',
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
        <TouchableOpacity onPress={() => {}}>
          <Ionicons name="heart-outline" size={22} color={Colors.ink} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Feather name="search" size={15} color={Colors.walnut2} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索名称、颜色、品牌…"
          placeholderTextColor={Colors.walnut2}
          value={searchText}
          onChangeText={setSearchText}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Category Filter with Count Badges */}
      <FlatList
        data={CLOTHING_CATEGORIES_WITH_ALL}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={c => c}
        contentContainerStyle={styles.categoryList}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.catBtn, selectedCategory === cat && styles.catBtnActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={styles.catEmoji}>{CATEGORY_EMOJIS[cat]}</Text>
            <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>
              {cat}
            </Text>
            <View style={[styles.catBadge, selectedCategory === cat && styles.catBadgeActive]}>
              <Text style={[styles.catBadgeText, selectedCategory === cat && styles.catBadgeTextActive]}>
                {counts[cat] ?? 0}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <ScrollView
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Quick Add Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={styles.sectionTitle}>✨ 快速添加推荐单品</Text>
              <Text style={styles.sectionSub}>从热门基础款中一键补充衣橱</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/wardrobe/add')}>
              <Text style={styles.sectionMore}>›</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={[...PRESET_BASIC_ITEMS.slice(0, 9), null]}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.quickAddList}
            renderItem={({ item, index }) => {
              if (item === null) {
                return (
                  <TouchableOpacity
                    style={styles.quickAddPlus}
                    onPress={() => router.push('/wardrobe/add')}
                  >
                    <Feather name="plus" size={24} color={Colors.walnut2} />
                    <Text style={styles.quickAddPlusText}>添加</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  style={styles.quickAddCard}
                  onPress={() => router.push({ pathname: '/wardrobe/[id]', params: { id: `rec_${index}` } })}
                >
                  <View style={styles.quickAddImage}>
                    <CategoryIcon category={item.category} size={28} color={Colors.walnut2} />
                  </View>
                  <Text style={styles.quickAddName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.quickAddMeta}>{item.category} · 衣橱</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Wishlist Section */}
        {wishlistItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>心愿单</Text>
              <Text style={styles.wishlistCount}>{wishlistItems.length} 件想要的</Text>
            </View>
            <FlatList
              data={wishlistItems}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={i => i.wish_id}
              contentContainerStyle={styles.wishlistList}
              renderItem={({ item: wish }) => (
                <View style={styles.wishCard}>
                  <View style={styles.wishImage}>
                    {wish.image_url
                      ? <Image source={{ uri: wish.image_url }} style={styles.image} resizeMode="cover" />
                      : <View style={styles.wishImagePlaceholder}><CategoryIcon category={wish.category} size={36} color={Colors.walnut2} /></View>
                    }
                  </View>
                  <Text style={styles.wishName} numberOfLines={1}>{wish.name}</Text>
                  <Text style={styles.wishMeta}>{wish.category} · {wish.color} · {wish.source === 'ai_recommended' ? 'AI推荐' : '手动'}</Text>
                  <View style={styles.wishActions}>
                    <TouchableOpacity style={styles.wishMoveBtn} onPress={() => handleMoveToWardrobe(wish.wish_id)}>
                      <Text style={styles.wishMoveText}>转入衣橱</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(wish.wish_id)}>
                      <Text style={styles.wishRemoveText}>移除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* Wardrobe Grid */}
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
              <ItemCard key={item.item_id} item={item} cardWidth={cardWidth} />
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
  headerActions: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    marginHorizontal: Spacing.four, marginBottom: Spacing.two,
    paddingHorizontal: Spacing.two, borderWidth: 1, borderColor: Colors.line,
  },
  searchIcon: { marginRight: Spacing.one },
  searchInput: { ...T.inputText, flex: 1, paddingVertical: Spacing.two, color: Colors.ink },

  categoryList: { paddingHorizontal: Spacing.four, gap: Spacing.one, paddingBottom: Spacing.two },
  catBtn: {
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.line,
    backgroundColor: Colors.paperCard, alignItems: 'center', gap: 2,
  },
  catBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catEmoji: { fontSize: 14 },
  catText: { ...T.tag, fontSize: 11, color: Colors.walnut },
  catTextActive: { ...T.tag, fontSize: 11, color: Colors.paper },
  catBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.vintageCream, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  catBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  catBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.walnut },
  catBadgeTextActive: { color: Colors.paper },

  scrollContent: { flex: 1 },

  section: {
    marginHorizontal: Spacing.four, marginBottom: Spacing.three,
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, borderWidth: 1, borderColor: Colors.line,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.two },
  sectionHeaderLeft: { flex: 1, gap: 2 },
  sectionTitle: { ...T.bodyText, fontWeight: '700', fontSize: 16, color: Colors.ink },
  sectionSub: { ...T.micro, color: Colors.walnut },
  sectionMore: { ...T.bodyText, fontSize: 22, color: Colors.walnut2, marginTop: Spacing.one },

  quickAddList: { gap: Spacing.two },
  quickAddCard: { width: 120, gap: Spacing.one },
  quickAddImage: {
    width: 120, height: 120, borderRadius: Radius.md,
    backgroundColor: Colors.vintageCream, alignItems: 'center', justifyContent: 'center',
  },
  quickAddName: { ...T.tag, fontSize: 12, color: Colors.ink, fontWeight: '500' },
  quickAddMeta: { ...T.micro, fontSize: 10, color: Colors.walnut2 },
  quickAddPlus: {
    width: 120, height: 120, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  quickAddPlusText: { ...T.micro, color: Colors.walnut2 },

  wishlistCount: { ...T.tag, fontSize: 12, color: '#6C5CE7', fontWeight: '500' },
  wishlistList: { gap: Spacing.two },
  wishCard: { width: 200, gap: Spacing.one, backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.two, borderWidth: 1, borderColor: Colors.line },
  wishImage: { width: '100%', height: 140, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.vintageCream, alignItems: 'center', justifyContent: 'center' },
  wishImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  wishName: { ...T.tag, fontSize: 13, color: Colors.ink, fontWeight: '600' },
  wishMeta: { ...T.micro, fontSize: 10, color: Colors.walnut2 },
  wishActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  wishMoveBtn: {
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one,
    backgroundColor: Colors.ink, borderRadius: Radius.sm,
  },
  wishMoveText: { ...T.micro, fontSize: 11, color: Colors.paper, fontWeight: '600' },
  wishRemoveText: { ...T.micro, fontSize: 11, color: Colors.terracotta },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.four, gap: Spacing.two },
  card: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    overflow: 'hidden', borderWidth: 1, borderColor: Colors.lineStrong, ...Shadow.one,
  },
  cardImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.paper },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.vintageCream },
  cardInfo: { padding: Spacing.two },
  cardName: { ...T.itemName },
  cardMeta: { ...T.micro, marginTop: 2 },

  emptyState: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.six, marginTop: Spacing.six },
  emptyTitle: { ...T.emptyTitle },
  emptySub: { ...T.itemDesc, textAlign: 'center' },

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
  linkTitle: { ...T.bodyText, fontWeight: '700', fontSize: 18, color: Colors.ink },
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
});
