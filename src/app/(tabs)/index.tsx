import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, SafeAreaView, Modal,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { fetchWeather, getMockWeather, searchCitiesOnline, getTempTag, CityResult } from '@/lib/weather';
import { aiExtractTags } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { WeatherIcon } from '@/components/WeatherIcon';
import {
  WeatherData, FilterTag, Outfit,
  OCCASION_TAGS, STYLE_TAGS, COLOR_TAGS, TEMP_TAGS,
} from '@/types';

export default function OutfitTab() {
  const { profile, user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();

  const defaultCity = profile?.permanent_city ?? '北京';
  const [weather, setWeather] = useState<WeatherData>(getMockWeather(defaultCity));
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [query, setQuery] = useState('');
  const [allTags, setAllTags] = useState<FilterTag[]>([
    ...OCCASION_TAGS, ...STYLE_TAGS, ...COLOR_TAGS, ...TEMP_TAGS,
  ]);
  const [savedOutfits, setSavedOutfits] = useState<Outfit[]>([]);

  useEffect(() => {
    if (user) fetchItems(user.id);
  }, [user]);

  // Fetch real weather on mount / city change
  useEffect(() => {
    fetchWeather(defaultCity).then(setWeather);
  }, [defaultCity]);

  // Load saved outfits history
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('outfits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => { if (data) setSavedOutfits(data as Outfit[]); });
  }, [user?.id]);

  // Auto-select temperature tag based on weather
  useEffect(() => {
    const tempTagId = getTempTag(weather.temp);
    setAllTags(prev => prev.map(t =>
      t.type === 'temperature' ? { ...t, selected: t.id === tempTagId } : t
    ));
  }, [weather]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (text.length > 0) {
      aiExtractTags(text).then(matched => {
        if (matched.length > 0) {
          setAllTags(prev => prev.map(t => ({
            ...t,
            selected: matched.includes(t.id) || t.selected,
          })));
        }
      });
    }
  };

  const toggleTag = (tagId: string) => {
    setAllTags(prev => prev.map(t =>
      t.id === tagId ? { ...t, selected: !t.selected } : t
    ));
  };

  const handleGenerate = () => {
    const selectedTagIds = allTags.filter(t => t.selected).map(t => t.id);
    router.push({
      pathname: '/outfit/result',
      params: {
        city: weather.city,
        temp: weather.temp,
        weather: weather.condition,
        query,
        tags: selectedTagIds.join(','),
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

  // Initialize city results on modal open
  const openCityModal = () => {
    setCityModalVisible(true);
    setCitySearch('');
    searchCitiesOnline('').then(setCityResults);
  };

  const tagSections = [
    { title: '场合', tags: allTags.filter(t => t.type === 'occasion') },
    { title: '风格', tags: allTags.filter(t => t.type === 'style') },
    { title: '色系', tags: allTags.filter(t => t.type === 'color_system') },
    { title: '温度', tags: allTags.filter(t => t.type === 'temperature') },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={styles.pageTitle}>今日穿搭</Text>

        {/* Weather Card */}
        <TouchableOpacity
          style={styles.weatherCard}
          onPress={openCityModal}
        >
          <View style={styles.weatherLeft}>
            <View style={styles.weatherIconWrap}>
              <WeatherIcon condition={weather.condition} size={28} color={Colors.ink} />
            </View>
            <View>
              <Text style={styles.weatherCity}>{weather.city} · {weather.condition}</Text>
              <Text style={styles.weatherTemp}>{weather.temp}°C</Text>
            </View>
          </View>
          <Text style={styles.weatherChange}>切换城市 ›</Text>
        </TouchableOpacity>

        {/* NLP Input */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.queryInput}
            placeholder="描述你的需求，例如：周末约会优雅一点"
            placeholderTextColor={Colors.walnut2}
            value={query}
            onChangeText={handleQueryChange}
            multiline
          />
        </View>

        {/* Filter Tags */}
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

        {/* Wardrobe hint */}
        {items.length === 0 && (
          <View style={styles.hintCard}>
            <Feather name="info" size={14} color={Colors.walnut} style={styles.hintIcon} />
            <Text style={styles.hintText}>
              衣橱还是空的，先去添加几件衣服，推荐效果更好哦
            </Text>
          </View>
        )}

        {/* Generate Button */}
        <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate}>
          <Ionicons name="sparkles-outline" size={16} color={Colors.paper} style={styles.generateIcon} />
          <Text style={styles.generateText}>生成穿搭推荐</Text>
        </TouchableOpacity>

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
              {citySearch.trim() && cityResults.length === 0 && (
                <Text style={styles.cityEmpty}>没有找到匹配的城市</Text>
              )}
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
  pageTitle: { ...T.pageTitle, marginBottom: Spacing.one },
  weatherCard: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  weatherLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  weatherIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  weatherCity: { ...T.caption, fontSize: 13, letterSpacing: 1.04 },
  weatherTemp: { ...T.tempLarge, fontSize: 30 },
  weatherChange: { ...T.buttonSecondary, color: Colors.terracotta },
  inputCard: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  queryInput: {
    ...T.bodyText,
    color: Colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  tagSection: { gap: Spacing.one },
  tagSectionTitle: { ...T.formLabel, letterSpacing: 1.56 },
  tagRow: { flexDirection: 'row', gap: Spacing.one },
  tag: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paperCard,
  },
  tagSelected: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  tagText: { ...T.tag, color: Colors.walnut },
  tagTextSelected: { ...T.tag, color: Colors.paper },
  hintCard: {
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.linen,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  hintIcon: { marginTop: 3 },
  hintText: { ...T.emptyTitle, fontSize: 13, letterSpacing: 0.78, lineHeight: 22, flex: 1 },
  generateBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  generateIcon: { marginRight: 2 },
  generateText: { ...T.buttonPrimary, color: Colors.paper },
  historySection: { gap: Spacing.two, marginTop: Spacing.one },
  historySectionTitle: { ...T.subTitle, color: Colors.walnut },
  historyRow: { flexDirection: 'row', gap: Spacing.two },
  historyCard: {
    width: 90,
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.md,
    padding: Spacing.two,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.one,
  },
  historyEmoji: {
    width: 56, height: 56,
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  historyName: { ...T.itemName, fontSize: 11, textAlign: 'center' },
  historyDate: { ...T.micro, fontSize: 10 },

  // City modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '70%',
    padding: Spacing.four,
  },
  modalTitle: {
    ...T.sectionTitle,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  citySearchInput: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 13,
    color: Colors.ink,
    marginBottom: Spacing.two,
  },
  cityList: {
    maxHeight: 200,
  },
  cityRow: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
  },
  cityRowActive: {
    backgroundColor: '#F0EDFF',
  },
  cityRowText: {
    ...T.bodyText,
    color: Colors.walnut,
    fontSize: 14,
  },
  cityRowTextActive: {
    color: '#6C5CE7',
    fontWeight: '500',
  },
  cityEmpty: {
    ...T.micro,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    color: Colors.walnut2,
  },
  modalCloseBtn: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  modalCloseText: {
    ...T.buttonSecondary,
    color: Colors.walnut,
  },
});
