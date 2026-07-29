import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, SafeAreaView, Modal,
  Image, Platform,
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
import { WeatherIcon } from '@/components/WeatherIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import { AddClothingSheet } from '@/components/AddClothingSheet';
import ImportSkeletonCard from '@/components/ImportSkeletonCard';
import { showToast } from '@/components/Toast';
import { ds, StyleeButton, StyleeChoiceChip } from '@/design-system';
import { useImportStore } from '@/stores/importStore';
import {
  WeatherData, FilterTag, InspirationCard,
  OCCASION_TAGS, STYLE_TAGS, COLOR_TAGS,
} from '@/types';

const isWeb = Platform.OS === 'web';

// Mock inspiration data (will be replaced by DB content)
const MOCK_INSPIRATIONS: InspirationCard[] = [
  {
    card_id: 'insp-1',
    title: '法式温柔风',
    image_url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&h=800&fit=crop',
    style_tags: ['french', 'romantic'],
    comment: '巴黎街头的慵懒与精致',
    occasion: '约会',
    items: [
      { name: '针织开衫', category: '外套', color: '米色', image_url: 'https://images.unsplash.com/photo-1583744946564-b53ac1efb997?w=300&h=300&fit=crop' },
      { name: '白色T恤', category: '上装', color: '白色', image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300&h=300&fit=crop' },
      { name: '蓝色牛仔裤', category: '下装', color: '蓝色', image_url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&h=300&fit=crop' },
      { name: '帆布鞋', category: '鞋履', color: '白色', image_url: 'https://images.unsplash.com/photo-1605812860427-4024433a70fd?w=300&h=300&fit=crop' },
    ],
  },
  {
    card_id: 'insp-2',
    title: '通勤简约风',
    image_url: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=600&h=800&fit=crop',
    style_tags: ['commute_style', 'minimalist'],
    comment: '用基本款穿出高级感',
    occasion: '职场',
    items: [
      { name: '白衬衫', category: '上装', color: '白色', image_url: 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?w=300&h=300&fit=crop' },
      { name: '黑色长裤', category: '下装', color: '黑色', image_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&h=300&fit=crop' },
      { name: '小白鞋', category: '鞋履', color: '白色', image_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&h=300&fit=crop' },
    ],
  },
  {
    card_id: 'insp-3',
    title: '甜美少女风',
    image_url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=800&fit=crop',
    style_tags: ['sweet', 'romantic'],
    comment: '清新温柔的日常穿搭',
    occasion: '休闲',
    items: [
      { name: '白色连衣裙', category: '连体装', color: '白色', image_url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=300&fit=crop' },
      { name: '帆布鞋', category: '鞋履', color: '白色', image_url: 'https://images.unsplash.com/photo-1605812860427-4024433a70fd?w=300&h=300&fit=crop' },
    ],
  },
  {
    card_id: 'insp-4',
    title: '静奢老钱风',
    image_url: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=800&fit=crop',
    style_tags: ['quiet_luxury', 'minimalist'],
    comment: '低调质感的从容优雅',
    occasion: '职场',
    items: [
      { name: '针织衫', category: '上装', color: '米色', image_url: 'https://images.unsplash.com/photo-1434389677669-e08b4cda3a7a?w=300&h=300&fit=crop' },
      { name: '黑色长裤', category: '下装', color: '黑色', image_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&h=300&fit=crop' },
      { name: '米色风衣', category: '外套', color: '米色', image_url: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=300&h=300&fit=crop' },
      { name: '双肩包', category: '包袋', color: '黑色', image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&h=300&fit=crop' },
    ],
  },
];

type InputMode = 'description' | 'tags';

export default function OutfitTab() {
  const { profile, user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();

  const defaultCity = profile?.permanent_city ?? '北京';
  const [weather, setWeather] = useState<WeatherData>(getMockWeather(defaultCity));
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

  // Inspiration
  const [inspirations, setInspirations] = useState<InspirationCard[]>(MOCK_INSPIRATIONS);

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
    fetchWeather(defaultCity).then(setWeather);
  }, [defaultCity]);

  useEffect(() => {
    const tempTagId = getTempTag(weather.temp);
    setAllTags(prev => prev.map(t =>
      t.type === 'temperature' ? { ...t, selected: t.id === tempTagId } : t
    ));
  }, [weather]);

  // Load inspirations from DB if available
  useEffect(() => {
    supabase
      .from('inspiration_cards')
      .select('*')
      .order('sort_order')
      .limit(10)
      .then(({ data }) => {
        if (data && data.length > 0) setInspirations(data as InspirationCard[]);
      });
  }, []);

  const toggleTag = (tagId: string) => {
    setAllTags(prev => prev.map(t =>
      t.id === tagId ? { ...t, selected: !t.selected } : t
    ));
  };

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
    router.push({
      pathname: '/outfit/result',
      params: {
        city: weather.city,
        temp: weather.temp,
        weather: weather.condition,
        query: mode === 'description' ? query : '',
        tags: mode === 'tags' ? selectedTagIds.join(',') : '',
        inputMode: mode,
      },
    });
  };

  const handleInspire = (card: InspirationCard) => {
    const tagStr = card.occasion ? `${card.style_tags[0] ?? ''} · ${card.occasion}` : card.style_tags.join(' · ');
    const itemsStr = card.items ? encodeURIComponent(JSON.stringify(card.items)) : '';
    router.push({
      pathname: '/outfit/inspiration',
      params: {
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
    fetchWeather(city).then(setWeather);
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
              const isActive = weather.city === cr.name;
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
                      {section.tags.map(tag => (
                        <StyleeChoiceChip
                          key={tag.id}
                          label={tag.label}
                          selected={tag.selected}
                          onPress={() => toggleTag(tag.id)}
                        />
                      ))}
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
                          <Text style={styles.inspirationTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.inspirationComment} numberOfLines={2}>{card.comment}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
    width: '100%', aspectRatio: 4 / 3, backgroundColor: ds.color.semantic.surface.card,
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
    textTransform: 'uppercase',
  },
  inspirationComment: {
    ...T.support,
    color: ds.color.semantic.text.secondary,
  },

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
