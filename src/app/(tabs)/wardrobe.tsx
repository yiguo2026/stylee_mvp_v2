import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { T } from '@/constants/theme';
import { AddClothingSheet } from '@/components/AddClothingSheet';
import { CategoryIcon } from '@/components/CategoryIcon';
import ImportSkeletonCard from '@/components/ImportSkeletonCard';
import { WardrobeSkeletonGrid } from '@/components/Skeleton';
import ItemSelectionSheet from '@/components/ItemSelectionSheet';
import {
  ds,
  dsShadow,
  StyleeChoiceChip,
  StyleePageHeader,
  StyleeSearchField,
  StyleeWardrobeCard,
  StyleeWardrobeGrid,
} from '@/design-system';
import { useImportStore, type ImportTaskStatus } from '@/stores/importStore';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { track } from '@/lib/track';
import { matchesWardrobeSearch } from '@/lib/wardrobeSearchPolicy';
import { CLOTHING_CATEGORIES_WITH_ALL, ClothingCategory, WardrobeItem } from '@/types';

function ItemCard({ item, animateIn = false }: { item: WardrobeItem; animateIn?: boolean }) {
  const opacity = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(animateIn ? 1.02 : 1)).current;
  const metadata = `${item.color} · ${item.category}${
    item.wear_count ? ` · 穿过${item.wear_count}次` : ''
  }`;

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
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <StyleeWardrobeCard
        accessibilityLabel={`${item.name}，${item.color}，${item.category}`}
        imageUri={item.image_url}
        metadata={metadata}
        name={item.name}
        onPress={() => router.push({ pathname: '/wardrobe/[id]', params: { id: item.item_id } })}
        placeholder={(
          <View style={styles.imagePlaceholder}>
            <CategoryIcon
              category={item.category}
              size={ds.size.control.minimumTouch}
              color={ds.color.semantic.text.tertiary}
            />
          </View>
        )}
      />
    </Animated.View>
  );
}

export default function WardrobeTab() {
  const { user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();
  const wardrobeLoading = useWardrobeStore((state) => state.isLoading);
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
      try { track('wardrobe_view', { item_count: items.length }); } catch {}
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
    .filter((item) => matchesWardrobeSearch(item, searchText)), [items, searchText, selectedCategory]);

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

  // 首次进入衣橱、数据还没回来时先展示骨架网格，避免「还没有衣物」空态闪现
  const showSkeleton = wardrobeLoading && gridEntries.length === 0;
  const showEmptyState = !showSkeleton && gridEntries.length === 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <StyleePageHeader
        title="衣橱"
        actionLabel="添加衣物"
        actionIcon="plus"
        onActionPress={() => setShowAddModal(true)}
      />
      <View style={styles.searchRow}>
        <StyleeSearchField
          accessibilityLabel="搜索衣橱单品"
          onChangeText={setSearchText}
          placeholder="搜索单品..."
          testID="wardrobe-search"
          value={searchText}
        />
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
              <StyleeChoiceChip
                key={category}
                label={category}
                selected={selectedCategory === category}
                selectionMode="single"
                onPress={() => setSelectedCategory(category)}
                trailingContent={count > 0 ? (
                  <View style={[styles.catCount, selectedCategory === category && styles.catCountActive]}>
                    <Text style={[styles.catCountText, selectedCategory === category && styles.catCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                ) : undefined}
              />
            );
          })}
        </ScrollView>

        {showSkeleton ? (
          <WardrobeSkeletonGrid />
        ) : showEmptyState ? (
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
          <StyleeWardrobeGrid>
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
          </StyleeWardrobeGrid>
        )}
      </ScrollView>

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
  searchRow: {
    width: '100%',
    maxWidth: ds.layout.contentMaxReading,
    alignSelf: 'center',
    paddingHorizontal: ds.layout.screenPaddingCompact,
    marginTop: ds.component.wardrobeGrid.controlsGap,
    marginBottom: ds.component.wardrobeGrid.controlsGap,
  },

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
    width: ds.size.icon.xxl,
    height: ds.size.icon.xxl,
    borderRadius: ds.radius.full,
    backgroundColor: ds.color.semantic.surface.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBannerText: { flex: 1, gap: ds.space[0.5] },
  confirmBannerTitle: { ...T.content, color: ds.color.semantic.text.primary },
  confirmBannerSub: { ...T.support, color: ds.color.semantic.text.secondary },
  confirmBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds.space[0.5],
    paddingHorizontal: ds.space[2],
    minHeight: ds.size.control.minimumTouch,
    paddingVertical: ds.space[2],
    borderRadius: ds.radius.full,
    backgroundColor: ds.color.semantic.surface.floating,
  },
  confirmBannerBtnText: { ...T.content, color: ds.color.semantic.text.accent },

  categoryList: {
    paddingHorizontal: ds.component.wardrobeGrid.screenPadding,
    gap: ds.component.choiceChip.groupGap,
    paddingBottom: ds.component.wardrobeGrid.controlsGap,
  },
  catCount: {
    minWidth: ds.typography.support.lineHeight,
    height: ds.typography.support.lineHeight,
    borderRadius: ds.radius.full,
    backgroundColor: ds.color.semantic.status.neutralSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ds.space[0.5],
  },
  catCountActive: { backgroundColor: ds.color.semantic.surface.floating },
  catCountText: { ...T.support, color: ds.color.semantic.text.secondary },
  catCountTextActive: { color: ds.color.semantic.text.primary },
  scrollContent: { flex: 1 },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: ds.color.semantic.surface.card },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: ds.space[2], padding: ds.space[6], marginTop: ds.space[6] },
  emptyTitle: { ...T.emptyTitle },
  emptySub: { ...T.itemDesc, textAlign: 'center' },
});
