import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, SafeAreaView, Modal,
  Image, Platform, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { fetchWeather, getMockWeather, searchCitiesOnline, getTempTag, CityResult } from '@/lib/weather';
import { supabase } from '@/lib/supabase';
import { getQuota } from '@/lib/dailyQuota';
import { track } from '@/lib/track';
import {
  isStyleCompatible, isOccasionCompatible, buildConflictMessage,
} from '@/lib/tagCompat';
import { WeatherIcon } from '@/components/WeatherIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { AddClothingSheet } from '@/components/AddClothingSheet';
import ImportSkeletonCard from '@/components/ImportSkeletonCard';
import { SkeletonBlock } from '@/components/Skeleton';
import { showToast } from '@/components/Toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ds, StyleeButton, StyleeChoiceChip } from '@/design-system';
import { useImportStore } from '@/stores/importStore';
import {
  WeatherData, FilterTag, InspirationCard,
  OCCASION_TAGS, STYLE_TAGS, COLOR_TAGS,
} from '@/types';
// 穿搭灵感单一数据源（含真实单品缩略图）：首页与灵感详情页共用同一份。
import { FALLBACK_INSPIRATIONS } from '@/data/inspirations';

const isWeb = Platform.OS === 'web';

// ─── 首页 cache-first 存储（缓解冷启动闪烁）────────────────────
// 首帧优先读本地 cache 直接渲染真数据，无 cache 时渲染骨架；后台静默刷新。
// 仅在 web（localStorage 同步可读）上做首帧命中；native 首帧走骨架，随后淡入。
const INSP_CACHE_KEY = 'stylee.home.inspirations';
const WEATHER_CACHE_PREFIX = 'stylee.home.weather.';

function readInspCache(): InspirationCard[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(INSP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InspirationCard[]) : null;
  } catch {
    return null;
  }
}

function writeInspCache(cards: InspirationCard[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(INSP_CACHE_KEY, JSON.stringify(cards));
    }
  } catch { /* ignore quota / serialize errors */ }
}

function readWeatherCache(city: string): WeatherData | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(WEATHER_CACHE_PREFIX + city);
    return raw ? (JSON.parse(raw) as WeatherData) : null;
  } catch {
    return null;
  }
}

function writeWeatherCache(city: string, data: WeatherData) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEATHER_CACHE_PREFIX + city, JSON.stringify(data));
    }
  } catch { /* ignore */ }
}

/** 数据到达后 opacity 0→1 淡入，避免从骨架/空白硬切换的 pop-in */
function FadeInView({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

type InputMode = 'description' | 'tags';

// style_tag id → 中文展示标签（灵感卡与详情页统一使用）
const STYLE_LABEL: Record<string, string> = Object.fromEntries(
  STYLE_TAGS.map(t => [t.id, t.label]),
);

// occasion_tag id → 中文展示标签（confirm 文案用）
const OCCASION_LABEL: Record<string, string> = Object.fromEntries(
  OCCASION_TAGS.map(t => [t.id, t.label]),
);

export default function OutfitTab() {
  const { profile, user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();

  const defaultCity = profile?.permanent_city ?? '北京';
  // 天气：cache-first。首帧命中本地 cache 直接渲染（无骨架）；无 cache 时为 null → 渲染骨架，
  // 真数据到达后只 setState 一次（不再先塞一份 mock 假值造成闪烁）。
  const [weather, setWeather] = useState<WeatherData | null>(() => readWeatherCache(defaultCity));
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('description');
  const [query, setQuery] = useState('');

  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Tags
  const [allTags, setAllTags] = useState<FilterTag[]>([
    ...OCCASION_TAGS, ...STYLE_TAGS, ...COLOR_TAGS,
  ]);

  // 灵感卡：cache-first → DB → 编辑精选兜底。
  // - null                → 加载中（渲染骨架）
  // - InspirationCard[]   → 展示内容（可能是 DB 数据、cache 或编辑精选兜底）
  const [inspirations, setInspirations] = useState<InspirationCard[] | null>(() => readInspCache());
  const [inspError, setInspError] = useState(false);

  useFocusEffect(useCallback(() => {
    if (user?.id) fetchItems(user.id);
  }, [user?.id, fetchItems]));

  useEffect(() => {
    if (!user?.id) return;
    getQuota(user.id, 'recommend').then(q => setQuota({ remaining: q.remaining, limit: q.limit }));
  }, [user?.id]);

  // Refresh quota when returning from outfit/result page
  useFocusEffect(useCallback(() => {
    if (user?.id) {
      getQuota(user.id, 'recommend').then(q => setQuota({ remaining: q.remaining, limit: q.limit }));
    }
  }, [user?.id]));

  useEffect(() => {
    let cancelled = false;
    fetchWeather(defaultCity).then(data => {
      if (cancelled) return;
      setWeather(data);            // 只在真数据到达后 setState 一次
      writeWeatherCache(defaultCity, data);
    });
    return () => { cancelled = true; };
  }, [defaultCity]);

  useEffect(() => {
    if (!weather) return;
    const tempTagId = getTempTag(weather.temp);
    setAllTags(prev => prev.map(t =>
      t.type === 'temperature' ? { ...t, selected: t.id === tempTagId } : t
    ));
  }, [weather]);

  // Load inspirations from DB（后台静默刷新：有 cache 时保持展示，成功后 diff 更新 + 回写 cache）
  const fetchInspirations = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspiration_cards')
      .select('*')
      .order('sort_order')
      .limit(10);
    if (error) {
      // 仅在没有任何可展示内容时暴露错误态；已有 cache 则静默保留
      setInspError(true);
      return;
    }
    const cards = (data ?? []) as InspirationCard[];
    setInspError(false);
    // DB 有数据用 DB 的；DB 空则回退到编辑精选 5 张兜底灵感
    const effective = cards.length > 0 ? cards : FALLBACK_INSPIRATIONS;
    setInspirations(effective);
    if (cards.length > 0) writeInspCache(cards);
  }, []);

  useEffect(() => {
    void fetchInspirations();
  }, [fetchInspirations]);

  const retryInspirations = useCallback(() => {
    setInspError(false);
    setInspirations(null); // 回到骨架态
    void fetchInspirations();
  }, [fetchInspirations]);

  const toggleTag = (tagId: string) => {
    setAllTags(prev => prev.map(t =>
      t.id === tagId ? { ...t, selected: !t.selected } : t
    ));
  };

  // ─── 场合 × 风格 软引导互斥（只作用于 inputMode === 'tags' 生成 filter） ───

  // 当前已选（并集判定所需）
  const selectedOccasionIds = useMemo(
    () => allTags.filter(t => t.type === 'occasion' && t.selected).map(t => t.id),
    [allTags],
  );
  const selectedStyleIds = useMemo(
    () => allTags.filter(t => t.type === 'style' && t.selected).map(t => t.id),
    [allTags],
  );

  // 当前 render 下"不兼容且未选"的 tag id 集合（用于降饱和 + 曝光埋点）
  const incompatibleTagIds = useMemo(() => {
    const set = new Set<string>();
    allTags.forEach(t => {
      if (t.selected) return;
      if (t.type === 'style' && !isStyleCompatible(t.id, selectedOccasionIds)) {
        set.add(t.id);
      } else if (t.type === 'occasion' && !isOccasionCompatible(t.id, selectedStyleIds)) {
        set.add(t.id);
      }
    });
    return set;
  }, [allTags, selectedOccasionIds, selectedStyleIds]);

  // 曝光去重：同一个 tag 短时间内只上报一次 filter_conflict_shown
  const shownRef = useRef<Set<string>>(new Set());

  // 依赖变化时，diff 出"新增不兼容"上报（避免每次滚动/render 都炸库）
  useEffect(() => {
    if (inputMode !== 'tags') return;
    incompatibleTagIds.forEach(id => {
      if (shownRef.current.has(id)) return;
      shownRef.current.add(id);
      const tag = allTags.find(t => t.id === id);
      if (!tag) return;
      try {
        track('filter_conflict_shown', {
          tag: id,
          tag_kind: tag.type === 'style' ? 'style' : 'occasion',
        });
      } catch { /* 埋点失败静默 */ }
    });
    // 已回归兼容的 tag 从 shownRef 中移除，便于下次再变为不兼容时重新曝光
    Array.from(shownRef.current).forEach(id => {
      if (!incompatibleTagIds.has(id)) shownRef.current.delete(id);
    });
  }, [incompatibleTagIds, inputMode, allTags]);

  // Confirm 弹窗状态
  const [conflictConfirm, setConflictConfirm] = useState<{
    tagId: string;
    tagLabel: string;
    tagKind: 'style' | 'occasion';
    selectedOtherIds: string[];
    selectedOtherLabels: string[];
  } | null>(null);

  // 生成穿搭 filter 中的 tag 点击处理（内部路由：兼容→直接切换；不兼容→confirm）
  const handleFilterTagPress = (tag: FilterTag) => {
    // 已选中或色系/温度 tag：走原来的直接切换
    if (tag.selected || (tag.type !== 'style' && tag.type !== 'occasion')) {
      toggleTag(tag.id);
      return;
    }

    const isIncompatible =
      (tag.type === 'style' && !isStyleCompatible(tag.id, selectedOccasionIds)) ||
      (tag.type === 'occasion' && !isOccasionCompatible(tag.id, selectedStyleIds));

    if (!isIncompatible) {
      toggleTag(tag.id);
      return;
    }

    const otherIds = tag.type === 'style' ? selectedOccasionIds : selectedStyleIds;
    const otherLabelMap = tag.type === 'style' ? OCCASION_LABEL : STYLE_LABEL;
    setConflictConfirm({
      tagId: tag.id,
      tagLabel: tag.label,
      tagKind: tag.type === 'style' ? 'style' : 'occasion',
      selectedOtherIds: otherIds,
      selectedOtherLabels: otherIds.map(i => otherLabelMap[i] ?? i),
    });
  };

  const handleConflictConfirm = () => {
    if (!conflictConfirm) return;
    const { tagId, tagKind, selectedOtherIds } = conflictConfirm;
    try {
      track('filter_conflict_confirmed', {
        tag: tagId,
        tag_kind: tagKind,
        selected_others: selectedOtherIds,
      });
    } catch { /* 埋点失败静默 */ }
    toggleTag(tagId);
    setConflictConfirm(null);
  };

  const handleConflictCancel = () => setConflictConfirm(null);

  const handleGenerate = async (modeOverride?: InputMode) => {
    if (!user?.id) {
      showToast('请先登录后再生成搭配');
      return;
    }

    const q = await getQuota(user.id, 'recommend');
    setQuota({ remaining: q.remaining, limit: q.limit });
    if (q.remaining <= 0) {
      showToast(`今日推荐次数已用完，AI 推荐每日 ${q.limit} 次，明天再来`);
      return;
    }

    const mode = modeOverride ?? inputMode;
    const selectedTagIds = allTags.filter(t => t.selected).map(t => t.id);

    try {
      track('outfit_generate_click', {
        query_type: mode === 'description' ? 'scene' : 'style',
        query_text: mode === 'description' ? query : selectedTagIds.join(','),
      });
    } catch {}

    // 天气尚未加载完成时，用 mock 兜底，保证生成链路可用（不阻塞）
    const w = weather ?? getMockWeather(defaultCity);
    router.push({
      pathname: '/outfit/result',
      params: {
        city: w.city,
        temp: w.temp,
        weather: w.condition,
        query: mode === 'description' ? query : '',
        tags: mode === 'tags' ? selectedTagIds.join(',') : '',
        inputMode: mode,
      },
    });
  };

  const handleInspire = (card: InspirationCard) => {
    const primaryStyle = STYLE_LABEL[card.style_tags[0]] ?? card.style_tags[0] ?? '';
    const tagStr = card.occasion ? `${primaryStyle} · ${card.occasion}` : card.style_tags.map(t => STYLE_LABEL[t] ?? t).join(' · ');
    const itemsStr = card.items ? encodeURIComponent(JSON.stringify(card.items)) : '';
    router.push({
      pathname: '/outfit/inspiration',
      params: {
        card_id: encodeURIComponent(card.card_id || ''),
        title: encodeURIComponent(card.title || ''),
        tag: encodeURIComponent(tagStr),
        desc: encodeURIComponent(card.comment || ''),
        image_url: encodeURIComponent(card.image_url || ''),
        style_tags: encodeURIComponent(card.style_tags.join(',')),
        occasion_tags: encodeURIComponent(card.occasion || ''),
        items: itemsStr,
      },
    });
  };

  const selectCity = (city: string) => {
    setCityModalVisible(false);
    setCitySearch('');
    fetchWeather(city).then(data => {
      setWeather(data);
      writeWeatherCache(city, data);
    });
  };

  const handleCitySearch = (text: string) => {
    setCitySearch(text);
    searchCitiesOnline(text).then(setCityResults);
  };

  const openCityModal = () => {
    setCityModalVisible(true);
    setCitySearch('');
    searchCitiesOnline('').then(setCityResults);
  };

  const citySheet = (
    <View style={styles.modalOverlay}>
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>选择城市</Text>
        <TextInput
          style={styles.citySearchInput}
          placeholder="搜索城市..."
          placeholderTextColor={ds.color.semantic.text.tertiary}
          value={citySearch}
          onChangeText={handleCitySearch}
          autoFocus
        />
        <ScrollView style={styles.cityList} keyboardShouldPersistTaps="handled">
          {citySearch && cityResults.length === 0 ? (
            <Text style={styles.cityNoResult}>无搜索结果</Text>
          ) : (
            cityResults.map(cr => {
              const isActive = weather?.city === cr.name;
              return (
                <TouchableOpacity
                  key={cr.id || cr.name}
                  style={[styles.cityRow, isActive && styles.cityRowActive]}
                  onPress={() => selectCity(cr.name)}
                >
                  <Text style={[styles.cityRowText, isActive && styles.cityRowTextActive]}>
                    {cr.name}{cr.adm1 ? ` (${cr.adm1})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setCityModalVisible(false); setCitySearch(''); }}>
          <Feather name="x-circle" size={16} color={ds.color.semantic.text.secondary} />
          <Text style={styles.modalCloseText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const recentItems = items.slice(0, 8);

  // 异步导入中的任务——在首页「我的衣橱」横向列表里展示进度
  const tasks = useImportStore((state) => state.tasks);
  const retryFailed = useImportStore((state) => state.retryFailed);
  const previewTasks = useMemo(
    () => [...tasks].reverse().filter((task) => task.status !== 'done'),
    [tasks],
  );
  const previewEntries = useMemo(() => {
    const entries = [
      ...previewTasks.map((task) => ({ type: 'task' as const, key: `task:${task.id}`, task })),
      ...recentItems.map((item) => ({ type: 'item' as const, key: `item:${item.item_id}`, item })),
    ];
    return entries.slice(0, 8);
  }, [recentItems, previewTasks]);

  const tagSections = [
    { title: '场合', tags: allTags.filter(t => t.type === 'occasion') },
    { title: '风格', tags: allTags.filter(t => t.type === 'style') },
    { title: '色系', tags: allTags.filter(t => t.type === 'color_system') },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Section 0: Weather Bar ── */}
        <View style={styles.weatherBar}>
          <Text style={styles.brandText}>Stylee</Text>
          {weather ? (
            <FadeInView>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`当前城市 ${weather.city}，${weather.temp} 度`}
                accessibilityHint="选择其他城市"
                style={styles.weatherBtn}
                onPress={openCityModal}
              >
                <WeatherIcon condition={weather.condition} size={16} color={ds.color.semantic.text.primary} />
                <Text style={styles.weatherBtnText}>{weather.temp}°C · {weather.city}</Text>
                <Feather name="chevron-down" size={12} color={ds.color.semantic.text.tertiary} />
              </TouchableOpacity>
            </FadeInView>
          ) : (
            // 天气加载中：骨架占位，避免先渲染 mock 假天气再刷成真值的闪烁
            <SkeletonBlock style={styles.weatherSkeleton} />
          )}
        </View>

        {/* ── Section 1: AI Input Area ── */}
        <View style={styles.inputSection}>
          {/* Tab switcher */}
          <View style={styles.inputTabRow}>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: inputMode === 'description' }}
              style={[styles.inputTab, inputMode === 'description' && styles.inputTabActive]}
              onPress={() => setInputMode('description')}
            >
              <Ionicons name="chatbubble-outline" size={16} color={inputMode === 'description' ? ds.color.semantic.text.inverse : ds.color.semantic.text.secondary} />
              <Text style={[styles.inputTabText, inputMode === 'description' && styles.inputTabTextActive]}>
                描述需求
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: inputMode === 'tags' }}
              style={[styles.inputTab, inputMode === 'tags' && styles.inputTabActive]}
              onPress={() => setInputMode('tags')}
            >
              <Feather name="tag" size={16} color={inputMode === 'tags' ? ds.color.semantic.text.inverse : ds.color.semantic.text.secondary} />
              <Text style={[styles.inputTabText, inputMode === 'tags' && styles.inputTabTextActive]}>
                标签筛选
              </Text>
            </TouchableOpacity>
          </View>

          {/* Path A: Description input */}
          {inputMode === 'description' && (
            <View style={styles.descCard}>
              <TextInput
                style={styles.queryInput}
                placeholder="周末约会穿什么？"
                placeholderTextColor={ds.color.semantic.text.tertiary}
                value={query}
                onChangeText={setQuery}
                multiline
              />
              <StyleeButton
                label="生成穿搭"
                size="large"
                onPress={() => { void handleGenerate('description'); }}
                leadingIcon={<Ionicons name="sparkles-outline" size={16} color={ds.color.semantic.text.inverse} />}
                accessibilityHint="根据你的描述生成穿搭建议"
              />
              {quota ? (
                <Text style={styles.quotaHint}>今日剩余 {quota.remaining}/{quota.limit} 次</Text>
              ) : null}
            </View>
          )}

          {/* Path B: Tag filter */}
          {inputMode === 'tags' && (
            <View style={styles.tagsCard}>
              {tagSections.map(section => (
                <View key={section.title} style={styles.tagSection}>
                  <Text style={styles.tagSectionTitle}>{section.title}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.tagRow}>
                      {section.tags.map(tag => {
                        const dim = incompatibleTagIds.has(tag.id);
                        return (
                          <StyleeChoiceChip
                            key={tag.id}
                            label={tag.label}
                            selected={tag.selected}
                            onPress={() => handleFilterTagPress(tag)}
                            // 软引导：不兼容 tag 降饱和显示（仍可点击）
                            style={dim ? styles.tagChipIncompatible : undefined}
                            accessibilityLabel={
                              dim
                                ? `${tag.label}（与已选不太协调，点击可确认使用）`
                                : tag.label
                            }
                          />
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              ))}
              <StyleeButton
                label="生成穿搭"
                size="large"
                onPress={() => { void handleGenerate('tags'); }}
                leadingIcon={<Ionicons name="sparkles-outline" size={16} color={ds.color.semantic.text.inverse} />}
                accessibilityHint="根据已选标签生成穿搭建议"
              />
              {quota ? (
                <Text style={styles.quotaHint}>今日剩余 {quota.remaining}/{quota.limit} 次</Text>
              ) : null}
            </View>
          )}
        </View>

        {/* ── Section 2: My Wardrobe Preview ── */}
        <View style={styles.wardrobeSection}>
          <View style={styles.wardrobeHeader}>
            <Text style={styles.wardrobeTitle}>我的衣橱</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/wardrobe?scrollTop=1')}>
              <Text style={styles.wardrobeViewAll}>查看全部 ›</Text>
            </TouchableOpacity>
          </View>

          {previewEntries.length === 0 ? (
            <TouchableOpacity
              style={styles.wardrobeEmpty}
              onPress={() => setShowAddSheet(true)}
            >
              <Feather name="camera" size={24} color={ds.color.semantic.text.tertiary} />
              <Text style={styles.wardrobeEmptyText}>拍一件衣服开始你的穿搭之旅</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.wardrobeRow}>
                {/* Add button first — matches thumb column layout */}
                <View style={styles.wardrobeThumb}>
                  <TouchableOpacity
                    style={styles.wardrobeAddBox}
                    onPress={() => setShowAddSheet(true)}
                    activeOpacity={0.8}
                  >
                    <Feather name="plus" size={22} color={ds.color.semantic.text.accent} />
                  </TouchableOpacity>
                  <Text style={styles.wardrobeAddText} numberOfLines={1}>添加</Text>
                </View>
                {previewEntries.map((entry) => (
                  entry.type === 'task' ? (
                    <ImportSkeletonCard
                      key={entry.key}
                      task={entry.task}
                      variant="preview"
                      onPress={
                        entry.task.status === 'needs_selection'
                          ? (task) => router.push({ pathname: '/(tabs)/wardrobe', params: { scrollTop: '1', openImportTask: task.id } })
                          : entry.task.status === 'failed'
                            ? (task) => retryFailed(task.id)
                            : () => router.push('/(tabs)/wardrobe?scrollTop=1')
                      }
                    />
                  ) : (
                    <TouchableOpacity
                      key={entry.key}
                      style={styles.wardrobeThumb}
                      onPress={() => router.push({ pathname: '/wardrobe/[id]', params: { id: entry.item.item_id } })}
                    >
                      {entry.item.image_url ? (
                        <Image source={{ uri: entry.item.image_url }} style={styles.wardrobeThumbImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.wardrobeThumbPlaceholder}>
                          <CategoryIcon category={entry.item.category} size={20} color={ds.color.semantic.text.tertiary} />
                        </View>
                      )}
                      <Text style={styles.wardrobeThumbName} numberOfLines={1}>{entry.item.name}</Text>
                    </TouchableOpacity>
                  )
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ── Section 3: Outfit Inspiration ── */}
        <View style={styles.inspirationSection}>
          <View style={styles.inspirationHeader}>
            <Text style={styles.inspirationTitle}>穿搭灵感</Text>
          </View>

          {inspirations === null ? (
            // 加载中：优先骨架屏；若首拉失败且无 cache，显示可点击重试
            inspError ? (
              <TouchableOpacity style={styles.inspStateBox} onPress={retryInspirations} activeOpacity={0.8}>
                <Feather name="wifi-off" size={22} color={ds.color.semantic.text.tertiary} />
                <Text style={styles.inspStateText}>网络异常，点击重试</Text>
              </TouchableOpacity>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.inspirationRow}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <View key={`insp-skeleton-${i}`} style={styles.inspirationCard}>
                      <SkeletonBlock style={styles.inspirationImage} />
                      <View style={styles.inspirationInfo}>
                        <SkeletonBlock style={styles.inspSkeletonTag} />
                        <SkeletonBlock style={styles.inspSkeletonLine} />
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )
          ) : (
            <FadeInView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.inspirationRow}>
                  {inspirations.map(card => (
                    <TouchableOpacity key={card.card_id} style={styles.inspirationCard}
                      onPress={() => handleInspire(card)} activeOpacity={0.8}
                    >
                      {card.image_url ? (
                        <Image source={{ uri: card.image_url }} style={styles.inspirationImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.inspirationImage}>
                          <MaterialCommunityIcons name="hanger" size={32} color={ds.color.semantic.text.tertiary} />
                        </View>
                      )}
                      <View style={styles.inspirationInfo}>
                        <View style={styles.inspirationTags}>
                          {card.style_tags.slice(0, 2).map((tag) => (
                            <View key={`${card.card_id}:${tag}`} style={styles.inspirationTag}>
                              <Text style={styles.inspirationTagText}>{STYLE_LABEL[tag] ?? tag}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.inspirationComment} numberOfLines={2}>{card.comment}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </FadeInView>
          )}
        </View>

        {/* ── Section P2: AI Try-on ── */}
        <TouchableOpacity
          style={styles.tryOnSection}
          onPress={() => router.push('/outfit/try-on')}
          activeOpacity={0.85}
        >
          <Text style={styles.tryOnTitle}>AI试穿</Text>
          <Text style={styles.tryOnSubtitle}>选一套搭配，看看上身效果</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* City Modal */}
      {isWeb ? (
        cityModalVisible ? <View style={styles.webLayer}>{citySheet}</View> : null
      ) : (
        <Modal visible={cityModalVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => { setCityModalVisible(false); setCitySearch(''); }}>
          {citySheet}
        </Modal>
      )}

      <AddClothingSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />

      {/* 场合 × 风格 软引导互斥 —— 不兼容 tag 点击时弹 confirm 询问 */}
      <ConfirmModal
        visible={!!conflictConfirm}
        title={
          conflictConfirm
            ? `「${conflictConfirm.tagLabel}」和已选${
                conflictConfirm.tagKind === 'style' ? '场合' : '风格'
              }「${conflictConfirm.selectedOtherLabels.slice(0, 3).join('、')}${
                conflictConfirm.selectedOtherLabels.length > 3 ? '…' : ''
              }」搭配可能不太协调`
            : ''
        }
        message={conflictConfirm ? '仍要使用吗？' : undefined}
        confirmText="仍然选择"
        cancelText="取消"
        onConfirm={handleConflictConfirm}
        onCancel={handleConflictCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
  },
  safe: { flex: 1, backgroundColor: ds.color.semantic.surface.base, position: 'relative' },
  container: { flex: 1 },
  content: {
    paddingHorizontal: ds.layout.screenPaddingCompact,
    paddingTop: ds.space[2],
    gap: ds.space[3],
    paddingBottom: ds.space[6],
  },

  // ── Weather Bar ──
  weatherBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  brandText: {
    // ds-exception: Stylee wordmark is a brand asset, not product typography.
    fontFamily: Fonts.displayItalic,
    fontSize: 26,
    letterSpacing: 0,
    color: ds.color.semantic.text.primary,
  },
  weatherBtn: {
    minHeight: ds.size.control.minimumTouch,
    flexDirection: 'row', alignItems: 'center', gap: ds.space[1],
    backgroundColor: ds.color.semantic.surface.card, borderRadius: ds.radius.xl,
    paddingHorizontal: ds.space[3],
    borderWidth: 1, borderColor: ds.color.semantic.border.default,
  },
  weatherBtnText: { ...T.tag, color: ds.color.semantic.text.primary },
  weatherSkeleton: {
    width: 108,
    height: ds.size.control.minimumTouch,
    borderRadius: ds.radius.xl,
  },

  // ── Input Section ──
  inputSection: { gap: ds.space[2] },
  inputTabRow: { flexDirection: 'row', gap: ds.space[2] },
  inputTab: {
    minHeight: ds.size.control.minimumTouch,
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: ds.space[2],
    borderRadius: ds.radius.xl, borderWidth: 1,
    borderColor: ds.color.semantic.border.default, backgroundColor: ds.color.semantic.surface.card,
  },
  inputTabActive: { backgroundColor: ds.color.semantic.action.primary, borderColor: ds.color.semantic.action.primary },
  inputTabText: { ...T.tag, color: ds.color.semantic.text.secondary },
  inputTabTextActive: { ...T.tag, color: ds.color.semantic.text.inverse },

  descCard: {
    backgroundColor: ds.color.semantic.surface.card, borderRadius: ds.radius.xxl,
    padding: ds.space[3],
    gap: ds.space[3],
    borderWidth: 1, borderColor: ds.color.semantic.border.default,
  },
  queryInput: {
    ...T.bodyText, color: ds.color.semantic.text.primary, minHeight: ds.size.control.hero,
    textAlignVertical: 'top',
  },
  tagsCard: {
    backgroundColor: ds.color.semantic.surface.card, borderRadius: ds.radius.xxl,
    padding: ds.space[3],
    gap: ds.space[3],
    borderWidth: 1, borderColor: ds.color.semantic.border.default,
  },
  tagSection: { gap: ds.space[1] },
  tagSectionTitle: { ...T.support },
  tagRow: { flexDirection: 'row', gap: ds.component.choiceChip.groupGap },
  // 场合 × 风格 软引导：不兼容 tag 降饱和显示（仍可点击）
  // 不新增 DS token，直接用 opacity 让底层 chip 视觉减弱到 45%
  tagChipIncompatible: { opacity: 0.45 },
  quotaHint: {
    ...T.micro,
    textAlign: 'center',
    color: ds.color.semantic.text.tertiary,
    marginTop: 2,
  },

  // ── Wardrobe Preview ──
  wardrobeSection: { gap: ds.space[3] },
  wardrobeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  wardrobeTitle: { ...T.subTitle },
  wardrobeViewAll: { ...T.tag, color: ds.color.semantic.text.accent },
  wardrobeEmpty: {
    backgroundColor: ds.color.semantic.surface.card, borderRadius: ds.radius.xxl,
    paddingVertical: 18,
    paddingHorizontal: ds.space[4],
    alignItems: 'center', gap: ds.space[2],
    borderWidth: 1, borderColor: ds.color.semantic.border.default, borderStyle: 'dashed',
  },
  wardrobeEmptyText: { ...T.content },
  wardrobeRow: { flexDirection: 'row', gap: ds.layout.gridGap, alignItems: 'flex-start' },
  wardrobeAddBox: {
    width: 80, height: 80, borderRadius: ds.radius.xl,
    borderWidth: 1, borderColor: ds.color.semantic.border.strong,
    backgroundColor: ds.color.semantic.surface.card,
    alignItems: 'center', justifyContent: 'center',
  },
  wardrobeAddText: { ...T.support, textAlign: 'center', color: ds.color.semantic.text.accent },
  wardrobeThumb: { width: 80, gap: 4 },
  wardrobeThumbImg: { width: 80, height: 80, borderRadius: ds.radius.xl, backgroundColor: ds.color.semantic.surface.card },
  wardrobeThumbPlaceholder: {
    width: 80, height: 80, borderRadius: ds.radius.xl,
    backgroundColor: ds.color.semantic.surface.card, alignItems: 'center', justifyContent: 'center',
  },
  wardrobeThumbName: { ...T.support, textAlign: 'center' },

  // ── Inspiration ──
  inspirationSection: { gap: ds.space[3] },
  inspirationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inspirationTitle: { ...T.subTitle },
  inspirationRow: { flexDirection: 'row', gap: ds.layout.gridGap, paddingRight: ds.space[3] },
  inspirationCard: {
    width: 156, backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.radius.xxl, overflow: 'hidden',
    borderWidth: 1, borderColor: ds.color.semantic.border.default,
  },
  inspirationImage: {
    width: '100%', aspectRatio: 3 / 4, backgroundColor: ds.color.semantic.surface.card,
    alignItems: 'center', justifyContent: 'center',
  },
  inspirationInfo: { paddingHorizontal: ds.space[2], paddingTop: ds.space[2], paddingBottom: ds.space[2], gap: ds.space[1] },
  inspirationTags: { flexDirection: 'row', gap: 4 },
  inspirationTag: {
    backgroundColor: ds.color.semantic.surface.floating, borderRadius: ds.radius.sm,
    borderWidth: 1, borderColor: ds.color.semantic.border.strong,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  inspirationTagText: {
    ...T.support, color: ds.color.semantic.text.primary,
  },
  inspirationComment: {
    ...T.support,
    color: ds.color.semantic.text.secondary,
  },
  // 灵感卡骨架内文字占位
  inspSkeletonTag: { width: '55%', height: ds.space[3], borderRadius: ds.radius.sm },
  inspSkeletonLine: { width: '82%', height: ds.space[2], borderRadius: ds.radius.sm },
  // 灵感区空态 / 错误态占位框（复用 dashed 卡片风格，与衣橱空态一致）
  inspStateBox: {
    backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.radius.xxl,
    paddingVertical: ds.space[6],
    paddingHorizontal: ds.space[4],
    alignItems: 'center',
    gap: ds.space[2],
    borderWidth: 1,
    borderColor: ds.color.semantic.border.default,
    borderStyle: 'dashed',
  },
  inspStateText: { ...T.content, color: ds.color.semantic.text.secondary },

  // ── AI Try-on (P2) ──
  tryOnSection: {
    minHeight: ds.size.control.large,
    backgroundColor: ds.color.semantic.surface.card,
    borderRadius: ds.radius.xxl,
    paddingVertical: ds.space[3],
    paddingHorizontal: ds.space[4],
    gap: ds.space[1],
    borderWidth: 1,
    borderColor: ds.color.semantic.border.default,
  },
  tryOnTitle: {
    ...T.heading,
  },
  tryOnSubtitle: {
    ...T.support,
    color: ds.color.semantic.text.secondary,
  },

  // ── City Modal ──
  modalOverlay: { flex: 1, backgroundColor: ds.color.semantic.overlay.scrim, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: ds.color.semantic.surface.floating,
    borderTopLeftRadius: ds.radius.xxxl, borderTopRightRadius: ds.radius.xxxl,
    maxHeight: '70%', padding: ds.space[4],
  },
  modalTitle: { ...T.sectionTitle, textAlign: 'center', marginBottom: ds.space[3] },
  citySearchInput: {
    ...T.inputText,
    minHeight: ds.size.control.minimumTouch,
    backgroundColor: ds.color.semantic.surface.input, borderWidth: 1, borderColor: ds.color.semantic.border.default,
    borderRadius: ds.radius.lg, paddingHorizontal: ds.space[3], paddingVertical: ds.space[2],
    color: ds.color.semantic.text.primary, marginBottom: ds.space[2],
  },
  cityList: { maxHeight: 200 },
  cityRow: {
    minHeight: ds.size.control.minimumTouch,
    paddingVertical: ds.space[2], paddingHorizontal: ds.space[3],
    borderRadius: ds.radius.sm,
  },
  cityRowActive: { backgroundColor: ds.color.semantic.status.neutralSubtle },
  cityRowText: { ...T.content, color: ds.color.semantic.text.secondary },
  cityRowTextActive: { color: ds.color.semantic.text.primary },
  cityNoResult: { ...T.content, color: ds.color.semantic.text.tertiary, textAlign: 'center', paddingVertical: ds.space[4] },
  modalCloseBtn: { minHeight: ds.size.control.minimumTouch, marginTop: ds.space[3], alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: ds.space[2], paddingVertical: ds.space[2] },
  modalCloseText: { ...T.buttonSecondary, color: ds.color.semantic.text.secondary },
});
