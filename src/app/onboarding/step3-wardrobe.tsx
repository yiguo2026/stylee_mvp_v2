import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, ActivityIndicator, SafeAreaView, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { supabase } from '@/lib/supabase';
import { ClothingCategory } from '@/types';

const isWeb = Platform.OS === 'web';

interface RecommendedItem {
  name: string;
  desc: string;
  category: ClothingCategory;
  color: string;
  defaultSelected: boolean;
  imageUrl: string;
}

const AI_ITEMS: RecommendedItem[] = [
  { name: '白色基础T恤', desc: '极简必备 · 四季', category: '上装', color: '白色', defaultSelected: true, imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&h=200&fit=crop' },
  { name: '黑色修身打底衫', desc: '百搭内搭 · 四季', category: '上装', color: '黑色', defaultSelected: true, imageUrl: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=200&h=200&fit=crop' },
  { name: '条纹针织衫', desc: '温柔知性 · 秋冬', category: '上装', color: '条纹', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cda3a00?w=200&h=200&fit=crop' },
  { name: '基础款衬衫', desc: '通勤百搭 · 四季', category: '上装', color: '白色', defaultSelected: true, imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200&h=200&fit=crop' },
  { name: '简约针织开衫', desc: '温柔外搭 · 春秋', category: '上装', color: '米色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1614975059251-992f11792571?w=200&h=200&fit=crop' },
  { name: '直筒牛仔裤', desc: '经典百搭 · 四季', category: '下装', color: '深蓝', defaultSelected: true, imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=200&fit=crop' },
  { name: '休闲阔腿裤', desc: '松弛随性 · 四季', category: '下装', color: '卡其', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=200&h=200&fit=crop' },
  { name: '西装直筒裤', desc: '干练通勤 · 四季', category: '下装', color: '黑色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=200&h=200&fit=crop' },
  { name: '牛仔外套', desc: '休闲利器 · 春秋', category: '外套', color: '深蓝', defaultSelected: true, imageUrl: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=200&h=200&fit=crop' },
  { name: '基础款大衣', desc: '秋冬必备 · 秋冬', category: '外套', color: '驼色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=200&h=200&fit=crop' },
  { name: '小白鞋', desc: '休闲万能 · 四季', category: '鞋', color: '白色', defaultSelected: true, imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=200&h=200&fit=crop' },
  { name: '乐福鞋', desc: '通勤休闲 · 四季', category: '鞋', color: '棕色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=200&h=200&fit=crop' },
  { name: '运动鞋', desc: '活力百搭 · 四季', category: '鞋', color: '白色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&h=200&fit=crop' },
  { name: '丝巾', desc: '点睛配饰 · 四季', category: '配饰', color: '花色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=200&h=200&fit=crop' },
  { name: '黑色包包', desc: '通勤必备 · 四季', category: '包', color: '黑色', defaultSelected: false, imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&h=200&fit=crop' },
];

export default function OnboardingStep3() {
  const { user } = useUserStore();
  const { addItem } = useWardrobeStore();
  const [selected, setSelected] = useState<Set<number>>(
    new Set(AI_ITEMS.map((item, i) => item.defaultSelected ? i : -1).filter(i => i >= 0))
  );
  const [albumImages, setAlbumImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleItem = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === AI_ITEMS.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(AI_ITEMS.map((_, i) => i)));
    }
  };

  const handleBatchImport = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled) return;
    const uris = result.assets.map(a => a.uri);
    setAlbumImages(prev => [...new Set([...prev, ...uris])]);
  };

  const removeAlbumImage = (uri: string) => {
    setAlbumImages(prev => prev.filter(u => u !== uri));
  };

  const handleFinish = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Add AI-selected items
      for (const index of selected) {
        const item = AI_ITEMS[index];
        await addItem({
          user_id: user.id,
          name: item.name,
          category: item.category,
          color: item.color,
          source_type: 'manual',
          status: 'active',
          image_url: item.imageUrl,
        });
      }
      // Add album-imported items
      for (const uri of albumImages) {
        await addItem({
          user_id: user.id,
          name: '相册导入',
          category: '上装',
          color: '未知',
          source_type: 'album_ai',
          status: 'active',
          image_url: uri,
        });
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('添加失败', e.message || '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = selected.size;
  const totalCount = selectedCount + albumImages.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        {/* Progress dots */}
        <View style={styles.progress}>
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={[styles.progressDot, styles.progressDotActive]} />
        </View>

        <Text style={styles.title}>初始化你的衣橱</Text>
        <Text style={styles.subtitle}>
          根据你的风格，AI 为你匹配基础款{'\n'}一键添加，快速拥有完整衣橱
        </Text>

        {/* AI Recommended Section */}
        <View style={styles.builtinSection}>
          <View style={styles.builtinHeader}>
            <Text style={styles.builtinHeaderTitle}>🧠 AI 为你推荐</Text>
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.builtinSelectAll}>
                {selectedCount === AI_ITEMS.length ? '取消全选' : '全选添加'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.builtinGrid}>
            {AI_ITEMS.map((item, index) => {
              const isSelected = selected.has(index);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.builtinItem, isSelected && styles.builtinItemSelected]}
                  onPress={() => toggleItem(index)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.builtinIcon, isSelected && styles.builtinIconSelected]}>
                    <Image source={{ uri: item.imageUrl }} style={styles.builtinImage} resizeMode="cover" />
                    {isSelected && (
                      <View style={styles.builtinCheck}>
                        <Text style={styles.builtinCheckText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.builtinInfo}>
                    <Text style={[styles.builtinName, isSelected && styles.builtinNameSelected]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.builtinDesc} numberOfLines={1}>{item.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.selectedCount}>
            已选 {totalCount} 件 → 完成后自动加入衣橱
          </Text>
        </View>

        {/* Batch Import Card */}
        <View style={styles.batchSection}>
          <View style={styles.batchHeader}>
            <Text style={styles.batchHeaderTitle}>📦 相册批量导入</Text>
            <TouchableOpacity onPress={handleBatchImport}>
              <Text style={styles.batchAddBtn}>+ 选择图片</Text>
            </TouchableOpacity>
          </View>
          {albumImages.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.albumRow}>
                {albumImages.map((uri, i) => (
                  <View key={i} style={styles.albumThumbWrap}>
                    <Image source={{ uri }} style={styles.albumThumb} resizeMode="cover" />
                    <TouchableOpacity style={styles.albumRemove} onPress={() => removeAlbumImage(uri)}>
                      <Text style={styles.albumRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <TouchableOpacity style={styles.batchCardEmpty} onPress={handleBatchImport}>
              <Text style={styles.batchEmptyText}>从相册选择衣物图片，一起加入衣橱</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bottom Actions */}
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
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  builtinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  builtinHeaderTitle: { ...T.bodyText, fontWeight: '700', fontSize: 16, color: Colors.ink },
  builtinSelectAll: { ...T.tag, color: '#6C5CE7', fontWeight: '600' },
  builtinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  builtinItem: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  builtinItemSelected: {
    borderColor: '#6C5CE7',
    backgroundColor: '#F0EDFF',
  },
  builtinIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.vintageCream,
    overflow: 'hidden',
  },
  builtinIconSelected: {
    backgroundColor: '#F0EDFF',
  },
  builtinImage: {
    width: 44, height: 44, borderRadius: Radius.md,
  },
  builtinCheck: {
    position: 'absolute', bottom: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#34C759',
    alignItems: 'center', justifyContent: 'center',
  },
  builtinCheckText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  builtinInfo: { flex: 1, gap: 2 },
  builtinName: { ...T.tag, color: Colors.ink, fontSize: 12, fontWeight: '600' },
  builtinNameSelected: { color: '#6C5CE7' },
  builtinDesc: { ...T.micro, fontSize: 10, color: Colors.walnut2 },
  selectedCount: {
    ...T.tag,
    fontSize: 12,
    color: '#6C5CE7',
    textAlign: 'center',
    fontWeight: '500',
  },

  batchSection: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchHeaderTitle: { ...T.bodyText, fontWeight: '700', fontSize: 16, color: Colors.ink },
  batchAddBtn: { ...T.tag, color: '#6C5CE7', fontWeight: '600' },
  albumRow: { flexDirection: 'row', gap: Spacing.two },
  albumThumbWrap: { position: 'relative' },
  albumThumb: {
    width: 64, height: 64, borderRadius: Radius.md,
    backgroundColor: Colors.vintageCream,
  },
  albumRemove: {
    position: 'absolute', top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
  },
  albumRemoveText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  batchCardEmpty: {
    alignItems: 'center',
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.line,
    borderStyle: 'dashed',
  },
  batchEmptyText: { ...T.tag, fontSize: 12, color: Colors.walnut2 },

  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paperCard,
  },
  backText: { ...T.bodyText, color: Colors.ink, fontSize: 18 },
  finishBtn: {
    flex: 1,
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  finishText: { ...T.buttonPrimary, color: Colors.paper },
  skipText: { ...T.buttonSecondary, color: Colors.walnut, textAlign: 'center', marginTop: Spacing.two },
});
