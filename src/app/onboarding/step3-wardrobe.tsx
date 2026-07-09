import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T, Fonts, Shadow } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { setPendingImages } from '@/lib/pendingImages';
import { PRESET_BASIC_ITEMS, ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL } from '@/types';
import { CategoryIcon } from '@/components/CategoryIcon';
import { showToast } from '@/components/Toast';

export default function OnboardingStep3() {
  const { user } = useUserStore();
  const { addItem, items, fetchItems } = useWardrobeStore();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filterCategory, setFilterCategory] = useState<ClothingCategory | '全部'>('全部');
  const [loading, setLoading] = useState(false);

  // Refresh wardrobe when returning from /wardrobe/add
  useFocusEffect(useCallback(() => {
    if (user?.id) fetchItems(user.id);
  }, [fetchItems, user?.id]));

  const toggleItem = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === PRESET_BASIC_ITEMS.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(PRESET_BASIC_ITEMS.map((_, i) => i)));
    }
  };

  const handleAlbumImport = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('需要相册权限才能选择图片', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    const uris = result.assets.map(a => a.uri);
    console.log('[step3] album import, uris:', uris.length);
    setPendingImages(uris);
    router.push('/wardrobe/add');
  };

  const handleFinish = async () => {
    if (!user?.id) return;
    if (selected.size === 0) {
      router.replace('/(tabs)');
      return;
    }
    setLoading(true);
    try {
      for (const index of selected) {
        const item = PRESET_BASIC_ITEMS[index];
        await addItem({
          user_id: user.id,
          name: item.name,
          category: item.category,
          color: item.color,
          material: item.material || undefined,
          image_url: item.image_url || undefined,
          source_type: 'manual',
          source_label: '快速添加',
          status: 'active',
        });
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      showToast(e.message || '添加失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        <View style={styles.progress}>
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={[styles.progressDot, styles.progressDotActive]} />
        </View>

        <Text style={styles.title}>初始化你的衣橱</Text>
        <Text style={styles.subtitle}>AI 匹配基础款，一键添加</Text>

        {/* AI Recommended Section */}
        <View style={styles.builtinSection}>
          <View style={styles.builtinHeader}>
            <Text style={styles.builtinHeaderTitle}>AI 推荐单品</Text>
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.builtinSelectAll}>
                {selected.size === PRESET_BASIC_ITEMS.length ? '取消全选' : '全选添加'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoryRow}>
              {CLOTHING_CATEGORIES_WITH_ALL.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBtn, filterCategory === cat && styles.catBtnActive]}
                  onPress={() => setFilterCategory(cat)}
                >
                  <Text style={[styles.catText, filterCategory === cat && styles.catTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.builtinGrid}>
            {PRESET_BASIC_ITEMS.map((item, index) => {
              if (filterCategory !== '全部' && item.category !== filterCategory) return null;
              const isSelected = selected.has(index);
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.builtinItem, isSelected && styles.builtinItemSelected]}
                  onPress={() => toggleItem(index)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.builtinIcon, isSelected && styles.builtinIconSelected]}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.builtinImage} resizeMode="cover" />
                    ) : (
                      <CategoryIcon category={item.category} size={24} color={isSelected ? Colors.ink : Colors.walnut2} />
                    )}
                    {isSelected ? (
                      <View style={styles.builtinCheck}>
                        <Feather name="check" size={10} color={Colors.paper} />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.builtinInfo}>
                    <Text style={[styles.builtinName, isSelected && styles.builtinNameSelected]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.builtinDesc} numberOfLines={1}>{item.color} · {item.category}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selected.size > 0 && (
            <Text style={styles.selectedCount}>
              已选 {selected.size} 件 → 完成后自动加入衣橱
            </Text>
          )}
        </View>

        {/* Album Import — uses /wardrobe/add for AI detection flow */}
        <View style={styles.batchSection}>
          <View style={styles.batchHeader}>
            <Text style={styles.batchHeaderTitle}>相册导入</Text>
          </View>
          <TouchableOpacity style={styles.batchCard} onPress={handleAlbumImport} activeOpacity={0.7}>
            <Feather name="image" size={20} color={Colors.ink} />
            <View style={styles.batchCardText}>
              <Text style={styles.batchCardTitle}>选择衣物照片</Text>
              <Text style={styles.batchCardSub}>支持一次选择1张或多张，AI后台识别</Text>
            </View>
            <Feather name="chevron-right" size={16} color={Colors.walnut2} />
          </TouchableOpacity>
        </View>

        {/* Already added items from album import */}
        {items.length > 0 ? (
          <View style={styles.addedSection}>
            <Text style={styles.addedTitle}>已添加 {items.length} 件单品</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.addedRow}>
                {items.map(item => (
                  <View key={item.item_id} style={styles.addedThumbWrap}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.addedThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.addedThumbPlaceholder}>
                        <CategoryIcon category={item.category} size={20} color={Colors.walnut2} />
                      </View>
                    )}
                    <Text style={styles.addedThumbName} numberOfLines={1}>{item.name}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.finishBtn, loading && styles.disabled]}
            onPress={handleFinish}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.paper} />
              : <Text style={styles.finishText}>完成设置</Text>
            }
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skipText}>跳过</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.paper },
  container: { flex: 1 },
  inner: { padding: Spacing.four, paddingTop: Spacing.six, gap: Spacing.three, paddingBottom: Spacing.six },
  progress: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  progressDotActive: { backgroundColor: Colors.ink },
  title: { ...T.pageTitle },
  subtitle: { ...T.bodyText, fontSize: 14, lineHeight: 22, color: Colors.walnut },

  builtinSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  builtinHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  builtinHeaderTitle: { ...T.bodyText, fontFamily: Fonts.titleSerif, fontSize: 16, color: Colors.ink },
  builtinSelectAll: { ...T.tag, color: Colors.ink, fontFamily: Fonts.uiSemiBold },

  categoryRow: { flexDirection: 'row', gap: Spacing.one },
  catBtn: {
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one + 2,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper, alignItems: 'center', gap: 2,
  },
  catBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  catText: { ...T.tag, fontSize: 11, color: Colors.ink },
  catTextActive: { ...T.tag, fontSize: 11, color: Colors.paper },

  builtinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  builtinItem: {
    width: '47%', flexDirection: 'row', alignItems: 'center',
    gap: Spacing.one + 2, backgroundColor: Colors.paperCard,
    borderRadius: Radius.md, padding: Spacing.two,
    ...Shadow.one,
  },
  builtinItemSelected: { backgroundColor: Colors.signalSoft },
  builtinIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  builtinImage: { width: 44, height: 44, borderRadius: Radius.md },
  builtinIconSelected: { backgroundColor: Colors.signalSoft },
  builtinCheck: {
    position: 'absolute', bottom: -4, right: -4,
    width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.signal,
    alignItems: 'center', justifyContent: 'center',
  },
  builtinInfo: { flex: 1, gap: 2 },
  builtinName: { ...T.tag, color: Colors.ink, fontSize: 12, fontFamily: Fonts.uiSemiBold },
  builtinNameSelected: { color: Colors.ink },
  builtinDesc: { ...T.micro, fontSize: 10, color: Colors.walnut2 },
  selectedCount: { ...T.tag, fontSize: 12, color: Colors.ink, textAlign: 'center', fontFamily: Fonts.ui },

  batchSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  batchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  batchHeaderTitle: { ...T.bodyText, fontFamily: Fonts.titleSerif, fontSize: 16, color: Colors.ink },
  batchCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three,
    backgroundColor: Colors.paper, borderRadius: Radius.md,
    padding: Spacing.three, borderWidth: 1, borderColor: Colors.line, borderStyle: 'dashed',
  },
  batchCardText: { flex: 1, gap: 2 },
  batchCardTitle: { ...T.bodyText, fontSize: 14, color: Colors.ink },
  batchCardSub: { ...T.micro, color: Colors.walnut2 },

  addedSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    borderWidth: 1, borderColor: Colors.line,
  },
  addedTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 14, color: Colors.ink },
  addedRow: { flexDirection: 'row', gap: Spacing.two },
  addedThumbWrap: { width: 64, gap: 4, alignItems: 'center' },
  addedThumb: { width: 64, height: 64, borderRadius: Radius.md },
  addedThumbPlaceholder: {
    width: 64, height: 64, borderRadius: Radius.md,
    backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
  },
  addedThumbName: { ...T.micro, fontSize: 10, color: Colors.walnut, textAlign: 'center', maxWidth: 64 },

  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  backBtn: {
    width: 48, height: 48, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paperCard,
  },
  backText: { ...T.bodyText, color: Colors.ink, fontSize: 18 },
  finishBtn: {
    flex: 1, backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  finishText: { ...T.buttonPrimary, color: Colors.paper },
  skipText: { ...T.buttonSecondary, color: Colors.walnut, textAlign: 'center', marginTop: Spacing.two },
});
