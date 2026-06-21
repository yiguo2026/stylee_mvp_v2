import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, Image, SafeAreaView, RefreshControl,
  useWindowDimensions, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { WardrobeItem, ClothingCategory } from '@/types';

const CATEGORIES: (ClothingCategory | '全部')[] = ['全部', '上装', '下装', '连衣裙', '外套', '鞋', '包', '配饰'];

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
        <Text style={styles.cardMeta}>{item.color} · {item.category}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function WardrobeTab() {
  const { user } = useUserStore();
  const { items, isLoading, error, fetchItems } = useWardrobeStore();
  const [selectedCategory, setSelectedCategory] = useState<ClothingCategory | '全部'>('全部');
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - Spacing.four * 2 - Spacing.two) / 2;

  useEffect(() => {
    if (user) fetchItems(user.id);
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) await fetchItems(user.id);
    setRefreshing(false);
  };

  const filtered = items
    .filter(i => selectedCategory === '全部' || i.category === selectedCategory)
    .filter(i => !searchText || i.name.includes(searchText) || i.color.includes(searchText) || (i.brand ?? '').includes(searchText));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>我的衣橱</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.importBtn}
            onPress={() => router.push('/wardrobe/batch')}
          >
            <Feather name="download" size={14} color={Colors.ink} />
            <Text style={styles.importBtnText}>导入</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/wardrobe/add')}
          >
            <Feather name="plus" size={14} color={Colors.paper} />
            <Text style={styles.addBtnText}>添加</Text>
          </TouchableOpacity>
        </View>
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

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{items.length}</Text>
          <Text style={styles.statLabel}>件单品</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{items.filter(i => {
            const d = new Date(i.created_at);
            const now = new Date();
            return now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000;
          }).length}</Text>
          <Text style={styles.statLabel}>本周新加</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>
            {new Set(items.map(i => i.category)).size}
          </Text>
          <Text style={styles.statLabel}>类别</Text>
        </View>
      </View>

      {/* Category Filter */}
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={c => c}
        contentContainerStyle={styles.categoryList}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.catBtn, selectedCategory === cat && styles.catBtnActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>加载失败：{error}</Text>
          <TouchableOpacity onPress={() => user && fetchItems(user.id)}>
            <Text style={styles.errorRetry}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Grid */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="hanger" size={56} color={Colors.walnut2} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>
            {selectedCategory === '全部' ? '还没有衣物' : `没有${selectedCategory}类型的衣物`}
          </Text>
          <Text style={styles.emptySubtitle}>添加第一件衣服，开启你的数字衣橱</Text>
          {selectedCategory === '全部' && (
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/wardrobe/add')}
            >
              <Feather name="plus" size={14} color={Colors.paper} />
              <Text style={styles.emptyBtnText}>添加衣物</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={i => i.item_id}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => <ItemCard item={item} cardWidth={cardWidth} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  // 方正悠宋 — editorial body page title
  title: { ...T.pageTitle },
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  importBtn: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  importBtnText: { ...T.buttonSecondary, color: Colors.ink },
  addBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: { ...T.buttonSecondary, color: Colors.paper },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.four,
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  // Playfair Italic — stat numbers
  statNum: { ...T.statNum },
  // 苹方 Light — micro label
  statLabel: { ...T.micro },
  statDivider: { width: 1, backgroundColor: Colors.line },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  searchIcon: { marginRight: Spacing.one },
  searchInput: { ...T.inputText, flex: 1, paddingVertical: Spacing.two, color: Colors.ink },
  categoryList: { paddingHorizontal: Spacing.four, gap: Spacing.one, paddingBottom: Spacing.two },
  catBtn: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 4,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paperCard,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catText: { ...T.tag, color: Colors.walnut },
  catTextActive: { ...T.tag, color: Colors.paper },
  grid: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  row: { gap: Spacing.two, marginBottom: Spacing.two },
  card: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    ...Shadow.one,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: Colors.paper,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.vintageCream,
  },
  // imagePlaceholderText removed — now uses CategoryIcon component
  cardInfo: { padding: Spacing.two },
  // 方正悠宋 — item name
  cardName: { ...T.itemName },
  // 苹方 Light — metadata
  cardMeta: { ...T.micro, marginTop: 2 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  emptyIcon: { marginBottom: Spacing.one },
  // 汇文明朝体 — soul voice empty state
  emptyTitle: { ...T.emptyTitle },
  emptySubtitle: { ...T.itemDesc, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyBtnText: { ...T.buttonPrimary, color: Colors.paper },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#FFF3F3',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FFD6D6',
  },
  errorText: { ...T.micro, color: '#C0392B', flex: 1 },
  errorRetry: { ...T.tag, color: Colors.terracotta },
});
