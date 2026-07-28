import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Fonts, T } from '@/constants/theme';
import { AddClothingSheet } from '@/components/AddClothingSheet';
import { CategoryIcon } from '@/components/CategoryIcon';
import ImportSkeletonCard from '@/components/ImportSkeletonCard';
import ItemSelectionSheet from '@/components/ItemSelectionSheet';
import { ds, dsShadow } from '@/design-system';
import { useImportStore, type ImportTaskStatus } from '@/stores/importStore';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { CLOTHING_CATEGORIES_WITH_ALL, ClothingCategory, WardrobeItem } from '@/types';

function ItemCard({ item, animateIn = false }: { item: WardrobeItem; animateIn?: boolean }) {
  const opacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(animateIn ? 1.02 : 1)).current;

  useEffect(() => {
    if (!animateIn) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }

    opacity.setValue(0);
    scale.setValue(1.02);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animateIn, item.item_id, opacity, scale]);

  return (
    <Animated.View style={[styles.gridItem, { opacity, transform: [{ scale }] }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${item.name}，${item.color}，${item.category}`}
        style={styles.card}
        onPress={() => router.push({ pathname: '/wardrobe/[id]', params: { id: item.item_id } })}
      >
        <View style={styles.cardImage}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <CategoryIcon category={item.category} size={44} color={ds.color.semantic.text.tertiary} />
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardMeta}>
            {item.color} · {item.category}
            {item.wear_count ? ` · 穿过${item.wear_count}次` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function WardrobeTab() {
  const { user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();
  const { items: wishlistItems, fetchItems: fetchWishlist } = useWishlistStore();
  const tasks = useImportStore((state) => state.tasks);
  const retryFailed = useImportStore((state) => state.retryFailed);

  const [selectedCategory, setSelectedCategory] = useState<ClothingCategory | '全部'>('全部');
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectionTaskId, setSelectionTaskId] = useState<string | null>(null);
  const [dismissedSelectionIds, setDismissedSelectionIds] = useState<string[]>([]);
  const [recentlyCompletedUris, setRecentlyCompletedUris] = useState<string[]>([]);

  const pendingSelectionTasks = useMemo(
    () => tasks.filter((task) => task.status === 'needs_selection'),
    [tasks],
  );

  const previousTaskStatusRef = useRef<Record<string, ImportTaskStatus>>({});
  const scrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ scrollTop?: string; openImportTask?: string }>();

  useFocusEffect(useCallback(() => {
    if (user) {
      fetchItems(user.id);
      fetchWishlist(user.id);
    }
  }, [fetchItems, fetchWishlist, user]));

  useEffect(() => {
    if (params.scrollTop) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      router.setParams({ scrollTop: undefined });
    }
  }, [params.scrollTop]);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const nextStatusMap: Record<string, ImportTaskStatus> = {};

    tasks.forEach((task) => {
      nextStatusMap[task.id] = task.status;
      const previousStatus = previousTaskStatusRef.current[task.id];
      if (previousStatus && previousStatus !== 'done' && task.status === 'done') {
        const completedKeys = [task.sourceUri, task.standardizedImageUri].filter((uri): uri is string => Boolean(uri));
        setRecentlyCompletedUris((prev) => Array.from(new Set([...completedKeys, ...prev])));
        const timeout = setTimeout(() => {
          setRecentlyCompletedUris((prev) => prev.filter((uri) => !completedKeys.includes(uri)));
        }, 520);
        timeouts.push(timeout);
      }
    });

    previousTaskStatusRef.current = nextStatusMap;
    return () => timeouts.forEach(clearTimeout);
  }, [tasks]);

  useEffect(() => {
    if (!selectionTaskId) return;
    const stillPending = tasks.some((task) => task.id === selectionTaskId && task.status === 'needs_selection');
    if (!stillPending) {
      setSelectionTaskId(null);
    }
  }, [selectionTaskId, tasks]);

  // 检测到多件单品时主动弹出选择面板（对齐线上「识别到多件即弹确认」的体验），
  // 不再依赖用户去发现骨架卡上的小字提示。用户点「稍后再说」后记入 dismissed，
  // 避免被反复弹起；之后仍可从顶部横幅/骨架卡再次进入确认。
  useEffect(() => {
    if (selectionTaskId) return;
    const next = pendingSelectionTasks.find((task) => !dismissedSelectionIds.includes(task.id));
    if (next) setSelectionTaskId(next.id);
  }, [pendingSelectionTasks, selectionTaskId, dismissedSelectionIds]);

  const handleCloseSelection = useCallback(() => {
    setSelectionTaskId((current) => {
      if (current) {
        setDismissedSelectionIds((prev) => (prev.includes(current) ? prev : [...prev, current]));
      }
      return null;
    });
  }, []);

  const openPendingConfirmation = useCallback(() => {
    const first = pendingSelectionTasks[0];
    if (!first) return;
    setDismissedSelectionIds((prev) => prev.filter((id) => id !== first.id));
    setSelectionTaskId(first.id);
  }, [pendingSelectionTasks]);

  useEffect(() => {
    if (!params.openImportTask) return;

    const targetTask = tasks.find(
      (task) => task.id === params.openImportTask && task.status === 'needs_selection',
    ) ?? tasks.find((task) => task.status === 'needs_selection');

    if (targetTask) {
      setSelectionTaskId(targetTask.id);
      router.setParams({ openImportTask: undefined });
    }
  }, [params.openImportTask, tasks]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await Promise.all([fetchItems(user.id), fetchWishlist(user.id)]);
    }
    setRefreshing(false);
  };

  const counts = useMemo(() => {
    const allCounts: Record<string, number> = { 全部: items.length };
    for (const category of CLOTHING_CATEGORIES_WITH_ALL) {
      if (category !== '全部') {
        allCounts[category] = items.filter((item) => item.category === category).length;
      }
    }
    return allCounts;
  }, [items]);

  const filteredItems = useMemo(() => items
    .filter((item) => selectedCategory === '全部' || item.category === selectedCategory)
    .filter((item) => {
      if (!searchText) return true;
      const query = searchText.trim();
      const SEARCH_ALIASES: Record<string, string[]> = {
        裤子: ['裤', '下装'],
        上衣: ['上装', '衬衫', 'T恤', '卫衣', '针织', '开衫'],
        衣服: ['上装', '外套', '衬衫', 'T恤', '卫衣'],
        裙子: ['裙', '连体装'],
        鞋: ['鞋', '靴', '鞋履'],
        包: ['包', '挎', '背包', '包袋'],
      };
      const terms = [query, ...(SEARCH_ALIASES[query] ?? [])];
      const haystack = [item.name, item.category, item.color, item.brand ?? '', item.material ?? ''].join(' ');
      return terms.some((term) => haystack.includes(term));
    }), [items, searchText, selectedCategory]);

  const skeletonTasks = useMemo(
    () => [...tasks].reverse().filter((task) => task.status !== 'done'),
    [tasks],
  );

  const gridEntries = useMemo(() => [
    ...skeletonTasks.map((task) => ({ type: 'task' as const, key: `task:${task.id}`, task })),
    ...filteredItems.map((item) => ({ type: 'item' as const, key: `item:${item.item_id}`, item })),
  ], [filteredItems, skeletonTasks]);

  const handleSkeletonPress = useCallback((taskId: string, status: ImportTaskStatus) => {
    if (status === 'needs_selection') {
      setSelectionTaskId(taskId);
      return;
    }
    if (status === 'failed') {
      retryFailed(taskId);
    }
  }, [retryFailed]);

  const showEmptyState = gridEntries.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>衣橱</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={ds.color.semantic.text.tertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索单品..."
            placeholderTextColor={ds.color.semantic.text.tertiary}
            value={searchText}
            onChangeText={setSearchText}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {pendingSelectionTasks.length > 0 && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="确认识别到的多件单品"
          style={styles.confirmBanner}
          onPress={openPendingConfirmation}
          activeOpacity={0.88}
        >
          <View style={styles.confirmBannerIcon}>
            <MaterialCommunityIcons name="hanger" size={18} color={ds.color.semantic.text.accent} />
          </View>
          <View style={styles.confirmBannerText}>
            <Text style={styles.confirmBannerTitle} numberOfLines={1}>
              {pendingSelectionTasks.length > 1
                ? `${pendingSelectionTasks.length} 张照片识别到多件单品`
                : `识别到 ${pendingSelectionTasks[0].allDetectedItems?.length ?? 0} 件单品，待你确认`}
            </Text>
            <Text style={styles.confirmBannerSub} numberOfLines={1}>选择要导入衣橱的单品</Text>
          </View>
          <View style={styles.confirmBannerBtn}>
            <Text style={styles.confirmBannerBtnText}>去确认</Text>
            <Feather name="chevron-right" size={14} color={ds.color.semantic.text.accent} />
          </View>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {CLOTHING_CATEGORIES_WITH_ALL.map((category) => {
            const count = counts[category] ?? 0;
            return (
              <TouchableOpacity
                key={category}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedCategory === category }}
                style={[styles.catPill, selectedCategory === category && styles.catPillActive]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.catPillText, selectedCategory === category && styles.catPillTextActive]}>
                  {category}
                </Text>
                {count > 0 ? (
                  <View style={[styles.catCount, selectedCategory === category && styles.catCountActive]}>
                    <Text style={[styles.catCountText, selectedCategory === category && styles.catCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {showEmptyState ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="hanger" size={56} color={ds.color.semantic.text.tertiary} />
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
            {gridEntries.map((entry) => (
              entry.type === 'task' ? (
                <ImportSkeletonCard
                  key={entry.key}
                  task={entry.task}
                  onPress={
                    entry.task.status === 'needs_selection' || entry.task.status === 'failed'
                      ? (task) => handleSkeletonPress(task.id, task.status)
                      : undefined
                  }
                />
              ) : (
                <ItemCard
                  key={entry.key}
                  item={entry.item}
                  animateIn={!!entry.item.image_url && recentlyCompletedUris.includes(entry.item.image_url)}
                />
              )
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="添加衣物"
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={24} color={ds.color.semantic.text.inverse} />
      </TouchableOpacity>

      <AddClothingSheet
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        wishlistCount={wishlistItems.length}
      />

      <ItemSelectionSheet
        visible={!!selectionTaskId}
        taskId={selectionTaskId}
        onClose={handleCloseSelection}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ds.color.semantic.surface.base, position: 'relative' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ds.layout.screenPaddingCompact,
    paddingTop: ds.space[2],
    paddingBottom: ds.space[2],
    minHeight: ds.size.control.minimumTouch,
  },
  title: { ...T.pageTitle },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ds.layout.screenPaddingCompact,
    marginBottom: ds.space[2],
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ds.size.control.minimumTouch,
    backgroundColor: ds.color.semantic.surface.input,
    borderRadius: ds.radius.xl,
    paddingHorizontal: ds.space[3],
    borderWidth: 1,
    borderColor: ds.color.semantic.border.default,
  },
  searchIcon: { marginRight: ds.space[2] },
  searchInput: { ...T.inputText, flex: 1, paddingVertical: ds.space[2], color: ds.color.semantic.text.primary },

  // 待确认横幅 —— 识别到多件单品时置顶提示，明显且常驻
  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ds.component.inlineStatus.minimumHeight,
    gap: ds.space[2],
    marginHorizontal: ds.layout.screenPaddingCompact,
    marginBottom: ds.space[2],
    paddingVertical: ds.space[3],
    paddingHorizontal: ds.space[3],
    borderRadius: ds.component.inlineStatus.radius,
    backgroundColor: ds.color.semantic.status.attentionSubtle,
    borderWidth: 1,
    borderColor: ds.color.semantic.border.default,
    ...dsShadow.one,
  },
  confirmBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ds.color.semantic.surface.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBannerText: { flex: 1, gap: 2 },
  confirmBannerTitle: { fontFamily: Fonts.uiSemiBold, ...ds.typography.label, color: ds.color.semantic.text.primary },
  confirmBannerSub: { fontFamily: Fonts.body, ...ds.typography.micro, color: ds.color.semantic.text.secondary },
  confirmBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 10,
    paddingRight: 6,
    minHeight: ds.size.control.minimumTouch,
    paddingVertical: ds.space[2],
    borderRadius: ds.radius.full,
    backgroundColor: ds.color.semantic.surface.floating,
  },
  confirmBannerBtnText: { fontFamily: Fonts.uiSemiBold, ...ds.typography.caption, color: ds.color.semantic.text.accent },

  categoryList: { paddingHorizontal: ds.layout.screenPaddingCompact, gap: ds.space[2], paddingBottom: ds.space[2] },
  catPill: {
    position: 'relative',
    minHeight: ds.size.control.minimumTouch,
    paddingHorizontal: ds.space[3],
    borderRadius: ds.radius.lg,
    borderWidth: 1,
    borderColor: ds.color.semantic.border.strong,
    backgroundColor: ds.color.semantic.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPillActive: { backgroundColor: ds.color.semantic.action.primary, borderColor: ds.color.semantic.action.primary },
  catPillText: { ...ds.typography.caption, fontFamily: Fonts.ui, color: ds.color.semantic.text.primary },
  catPillTextActive: { color: ds.color.semantic.text.inverse },
  catCount: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ds.color.semantic.status.neutralSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  catCountActive: { backgroundColor: ds.color.semantic.surface.floating },
  catCountText: { fontSize: 10, fontFamily: Fonts.uiSemiBold, color: ds.color.semantic.text.secondary },
  catCountTextActive: { color: ds.color.semantic.text.primary },
  scrollContent: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: ds.layout.screenPaddingCompact,
    rowGap: ds.layout.gridGap,
  },
  gridItem: { width: '47.5%' },
  card: {
    width: '100%',
    backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ds.color.semantic.border.subtle,
    ...dsShadow.one,
  },
  cardImage: { width: '100%', aspectRatio: 1, backgroundColor: ds.color.semantic.surface.card },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ds.color.semantic.surface.card },
  cardInfo: { minHeight: ds.size.control.hero, padding: ds.space[2], justifyContent: 'center' },
  cardName: { ...T.itemName },
  cardMeta: { ...T.micro, marginTop: 2 },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: ds.space[2], padding: ds.space[6], marginTop: ds.space[6] },
  emptyTitle: { ...T.emptyTitle },
  emptySub: { ...T.itemDesc, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: ds.space[4] + 60,
    right: ds.layout.screenPaddingCompact,
    width: ds.size.control.hero,
    height: ds.size.control.hero,
    borderRadius: ds.radius.full,
    backgroundColor: ds.color.semantic.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...dsShadow.two,
  },
});
