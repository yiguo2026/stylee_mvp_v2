import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, SafeAreaView, Modal,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { fetchWeather, getMockWeather, searchCitiesOnline, getTempTag, CityResult } from '@/lib/weather';
import { supabase } from '@/lib/supabase';
import { WeatherIcon } from '@/components/WeatherIcon';
import { CategoryIcon } from '@/components/CategoryIcon';
import {
  WeatherData, FilterTag, Outfit, InspirationCard,
  OCCASION_TAGS, STYLE_TAGS, COLOR_TAGS, TEMP_TAGS,
} from '@/types';


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

  // Tags
  const [allTags, setAllTags] = useState<FilterTag[]>([
    ...OCCASION_TAGS, ...STYLE_TAGS, ...COLOR_TAGS,
  ]);

  // Inspiration
  const [inspirations, setInspirations] = useState<InspirationCard[]>(MOCK_INSPIRATIONS);

  useEffect(() => {
    if (user) fetchItems(user.id);
  }, [user]);

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

  const handleGenerate = (modeOverride?: InputMode) => {
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

  const recentItems = items.slice(0, 8);

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
          <TouchableOpacity style={styles.weatherBtn} onPress={openCityModal}>
            <WeatherIcon condition={weather.condition} size={16} color={Colors.ink} />
            <Text style={styles.weatherBtnText}>{weather.temp}°C · {weather.city}</Text>
            <Feather name="chevron-down" size={12} color={Colors.walnut2} />
          </TouchableOpacity>
        </View>

        {/* ── Section 1: AI Input Area ── */}
        <View style={styles.inputSection}>
          {/* Tab switcher */}
          <View style={styles.inputTabRow}>
            <TouchableOpacity
              style={[styles.inputTab, inputMode === 'description' && styles.inputTabActive]}
              onPress={() => setInputMode('description')}
            >
              <Ionicons name="chatbubble-outline" size={14} color={inputMode === 'description' ? Colors.paper : Colors.walnut} />
              <Text style={[styles.inputTabText, inputMode === 'description' && styles.inputTabTextActive]}>
                描述需求
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inputTab, inputMode === 'tags' && styles.inputTabActive]}
              onPress={() => setInputMode('tags')}
            >
              <Feather name="tag" size={14} color={inputMode === 'tags' ? Colors.paper : Colors.walnut} />
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
                placeholderTextColor={Colors.walnut2}
                value={query}
                onChangeText={setQuery}
                multiline
              />
              <TouchableOpacity
                style={[styles.generateBtn, !query.trim() && styles.generateBtnDisabled]}
                onPress={() => handleGenerate('description')}
                disabled={!query.trim()}
              >
                <Ionicons name="sparkles-outline" size={14} color={Colors.paper} />
                <Text style={styles.generateBtnText}>生成穿搭</Text>
              </TouchableOpacity>
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
                        <TouchableOpacity
                          key={tag.id}
                          style={[styles.tag, tag.selected && styles.tagSelected]}
                          onPress={() => toggleTag(tag.id)}
                        >
                          <Text style={[styles.tagText, tag.selected && styles.tagTextSelected]}>
                            {tag.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.generateBtn, !allTags.some(t => t.selected) && styles.generateBtnDisabled]}
                onPress={() => handleGenerate('tags')}
                disabled={!allTags.some(t => t.selected)}
              >
                <Ionicons name="sparkles-outline" size={14} color={Colors.paper} />
                <Text style={styles.generateBtnText}>生成穿搭</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Section 2: My Wardrobe Preview ── */}
        <View style={styles.wardrobeSection}>
          <View style={styles.wardrobeHeader}>
            <Text style={styles.wardrobeTitle}>我的衣橱</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/wardrobe')}>
              <Text style={styles.wardrobeViewAll}>查看全部 ›</Text>
            </TouchableOpacity>
          </View>

          {recentItems.length === 0 ? (
            <TouchableOpacity
              style={styles.wardrobeEmpty}
              onPress={() => router.push('/wardrobe/add')}
            >
              <Feather name="camera" size={24} color={Colors.walnut2} />
              <Text style={styles.wardrobeEmptyText}>拍一件衣服开始你的穿搭之旅</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.wardrobeRow}>
                {/* Add button first */}
                <TouchableOpacity
                  style={styles.wardrobeAddBtn}
                  onPress={() => router.push('/wardrobe/add')}
                >
                  <Feather name="plus" size={20} color={Colors.terracotta} />
                  <Text style={styles.wardrobeAddText}>添加</Text>
                </TouchableOpacity>
                {recentItems.map(item => (
                  <TouchableOpacity
                    key={item.item_id}
                    style={styles.wardrobeThumb}
                    onPress={() => router.push({ pathname: '/wardrobe/[id]', params: { id: item.item_id } })}
                  >
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.wardrobeThumbImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.wardrobeThumbPlaceholder}>
                        <CategoryIcon category={item.category} size={20} color={Colors.walnut2} />
                      </View>
                    )}
                    <Text style={styles.wardrobeThumbName} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ── Section 3: Outfit Inspiration ── */}
        <View style={styles.inspirationSection}>
          <View style={styles.inspirationHeader}>
            <Text style={styles.inspirationTitle}>✨ 穿搭灵感</Text>
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
                      <MaterialCommunityIcons name="hanger" size={32} color={Colors.walnut2} />
                    </View>
                  )}
                  <View style={styles.inspirationInfo}>
                    <View style={styles.inspirationTags}>
                      {card.style_tags.slice(0, 2).map((tag, i) => (
                        <View key={i} style={styles.inspirationTag}>
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
        <View style={styles.tryOnSection}>
          <View style={styles.tryOnPreview}>
            <Ionicons name="person-outline" size={48} color={Colors.walnut2} />
            <Text style={styles.tryOnLabel}>AI试穿</Text>
            <Text style={styles.tryOnDesc}>真人建模·场景化氛围感生图</Text>
          </View>
          <TouchableOpacity style={styles.tryOnBtn} onPress={() => router.push('/outfit/try-on')}>
            <Text style={styles.tryOnBtnText}>生成图像</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* City Modal */}
      <Modal visible={cityModalVisible} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>📍 选择城市</Text>
            <TextInput
              style={styles.citySearchInput}
              placeholder="搜索城市..."
              placeholderTextColor={Colors.walnut2}
              value={citySearch}
              onChangeText={handleCitySearch}
              autoFocus
            />
            <ScrollView style={styles.cityList} keyboardShouldPersistTaps="handled">
              {cityResults.map(cr => {
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
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setCityModalVisible(false); setCitySearch(''); }}>
              <Text style={styles.modalCloseText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  // ── Weather Bar ──
  weatherBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  brandText: {
    fontFamily: Fonts.numeric,
    fontSize: 28,
    letterSpacing: 0,
    color: Colors.ink,
  },
  weatherBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    paddingHorizontal: Spacing.two + 4, paddingVertical: Spacing.one + 2,
    borderWidth: 1, borderColor: Colors.lineStrong,
  },
  weatherBtnText: { ...T.tag, color: Colors.ink },

  // ── Input Section ──
  inputSection: { gap: Spacing.two },
  inputTabRow: { flexDirection: 'row', gap: Spacing.one },
  inputTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: Spacing.two,
    borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.line, backgroundColor: Colors.paperCard,
  },
  inputTabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  inputTabText: { ...T.tag, color: Colors.walnut },
  inputTabTextActive: { ...T.tag, color: Colors.paper },

  descCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  queryInput: {
    ...T.bodyText, color: Colors.ink, minHeight: 60,
    textAlignVertical: 'top',
  },
  tagsCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  tagSection: { gap: Spacing.one },
  tagSectionTitle: { ...T.formLabel, letterSpacing: 1.56 },
  tagRow: { flexDirection: 'row', gap: Spacing.one },
  tag: {
    paddingHorizontal: Spacing.two + 4, paddingVertical: Spacing.one + 2,
    borderRadius: 10, borderWidth: 1,
    borderColor: Colors.lineStrong, backgroundColor: Colors.paper,
  },
  tagSelected: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  tagText: { ...T.tag, color: Colors.ink },
  tagTextSelected: { ...T.tag, color: Colors.paper },

  generateBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 2, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  generateBtnDisabled: { opacity: 0.4 },
  generateBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 14 },

  // ── Wardrobe Preview ──
  wardrobeSection: { gap: Spacing.two },
  wardrobeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  wardrobeTitle: { ...T.subTitle },
  wardrobeViewAll: { ...T.tag, color: Colors.terracotta },
  wardrobeEmpty: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.four, alignItems: 'center', gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line, borderStyle: 'dashed',
  },
  wardrobeEmptyText: { ...T.emptyTitle, fontSize: 14 },
  wardrobeRow: { flexDirection: 'row', gap: Spacing.two },
  wardrobeAddBtn: {
    width: 80, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.lineStrong, gap: 4,
    paddingVertical: Spacing.three,
  },
  wardrobeAddText: { ...T.micro, color: Colors.terracotta },
  wardrobeThumb: { width: 80, gap: 4 },
  wardrobeThumbImg: { width: 80, height: 80, borderRadius: Radius.md },
  wardrobeThumbPlaceholder: {
    width: 80, height: 80, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
  },
  wardrobeThumbName: { ...T.micro, fontSize: 10, textAlign: 'center' },

  // ── Inspiration ──
  inspirationSection: { gap: Spacing.two },
  inspirationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inspirationTitle: { ...T.subTitle },
  inspirationRow: { flexDirection: 'row', gap: Spacing.two },
  inspirationCard: {
    width: '47%', backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.line,
  },
  inspirationImage: {
    width: '100%', aspectRatio: 3 / 4, backgroundColor: Colors.paperCard,
    alignItems: 'center', justifyContent: 'center',
  },
  inspirationInfo: { padding: Spacing.two, gap: 4 },
  inspirationTags: { flexDirection: 'row', gap: 4 },
  inspirationTag: {
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 5,
    borderWidth: 1, borderColor: Colors.lineStrong,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  inspirationTagText: {
    ...T.micro, color: Colors.inkSoft, fontSize: 10,
    textTransform: 'uppercase',
  },
  inspirationComment: {
    ...T.bodyText, fontSize: 12, lineHeight: 18,
    color: Colors.walnut,
  },

  // ── AI Try-on (P2) ──
  tryOnSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, alignItems: 'center', gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  tryOnPreview: { alignItems: 'center', gap: Spacing.one },
  tryOnLabel: { ...T.subTitle },
  tryOnDesc: { ...T.micro, fontSize: 12 },
  tryOnBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.two,
  },
  tryOnBtnText: { ...T.buttonSecondary, color: Colors.paper, fontSize: 13 },

  // ── City Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    maxHeight: '70%', padding: Spacing.four,
  },
  modalTitle: { ...T.sectionTitle, textAlign: 'center', marginBottom: Spacing.three },
  citySearchInput: {
    ...T.inputText,
    backgroundColor: Colors.paperCard, borderWidth: 1.5, borderColor: Colors.line,
    borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
    fontSize: 13, color: Colors.ink, marginBottom: Spacing.two,
  },
  cityList: { maxHeight: 200 },
  cityRow: {
    paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
  },
  cityRowActive: { backgroundColor: Colors.signalSoft },
  cityRowText: { ...T.bodyText, color: Colors.walnut, fontSize: 14 },
  cityRowTextActive: { color: Colors.ink, fontFamily: Fonts.ui },
  modalCloseBtn: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  modalCloseText: { ...T.buttonSecondary, color: Colors.walnut },
});
