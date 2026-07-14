import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Colors, Spacing, Radius, Shadow, Fonts, T } from '@/constants/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Toast } from '@/components/Toast';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useUserStore } from '@/stores/userStore';
import { InspirationItem, ClothingCategory, CLOTHING_CATEGORIES } from '@/types';

const normalizeCategory = (raw: string): string => {
  const s = raw.trim();
  if (['上装', '衬衫', 'T恤', '毛衣', '卫衣', '上衣', '针织衫', '吊带', '背心', '打底衫', '马甲', 'Polo衫'].some(k => s.includes(k))) return '上装';
  if (['下装', '裤子', '牛仔裤', '阔腿裤', '短裤', '长裤', '半裙', '西裤', '运动裤', '休闲裤', '哈伦裤', '工装裤', '直筒裤', '喇叭裤'].some(k => s.includes(k))) return '下装';
  if (['连衣裙', '裙子', '长裙', '短裙', '裙装', 'onepiece', '连体装'].some(k => s.includes(k))) return '连体装';
  if (['外套', '夹克', '大衣', '风衣', '羽绒服', '棉服', '西装', '开衫', '皮衣', '冲锋衣', '棒球服', '皮草'].some(k => s.includes(k))) return '外套';
  if (['鞋', '鞋子', '高跟鞋', '运动鞋', '靴子', '凉鞋', '皮鞋', '单鞋', '帆布鞋', '板鞋', '拖鞋', '乐福鞋', '短靴', '长靴', '老爹鞋', '马丁靴'].some(k => s.includes(k))) return '鞋履';
  if (['包', '包包', '手提包', '双肩包', '斜挎包', '手袋', '挎包', '托特包', '链条包', '腰包', '背包'].some(k => s.includes(k))) return '包袋';
  if (['帽子', '帽', '棒球帽', '渔夫帽', '冷帽', '贝雷帽', '针织帽', '遮阳帽', '草帽', '围巾', '丝巾', '领巾', '披肩', '脖套'].some(k => s.includes(k))) return '帽巾';
  if (['配饰', '腰带', '领带', '胸针', '耳饰', '项链', '手链', '戒指', '手表', '眼镜', '墨镜'].some(k => s.includes(k))) return '配饰';
  if (CLOTHING_CATEGORIES.includes(s as ClothingCategory)) return s;
  return '配饰';
};

// wardrobe_items DB category constraint values
type CatConcept = 'top' | 'bottom' | 'dress' | 'outer' | 'shoes' | 'bag' | 'hat' | 'acc';
const toCatConcept = (raw: string): CatConcept => {
  const s = (raw || '').trim();
  if (['连衣裙', '连体', '裙装', '长裙', '短裙', '半身裙', 'onepiece'].some(k => s.includes(k))) return 'dress';
  if (['外套', '夹克', '大衣', '风衣', '羽绒', '棉服', '西装', '开衫', '皮衣', '冲锋衣', '棒球服', '皮草'].some(k => s.includes(k))) return 'outer';
  if (['上装', '衬衫', 'T恤', '恤', '毛衣', '卫衣', '上衣', '针织', '吊带', '背心', '打底', '马甲', 'Polo'].some(k => s.includes(k))) return 'top';
  if (['下装', '裤', '牛仔', '阔腿', '短裤', '长裤', '半裙', '西裤', '运动裤', '休闲裤', '裙'].some(k => s.includes(k))) return 'bottom';
  if (['鞋', '靴', '凉鞋', '拖鞋', '乐福'].some(k => s.includes(k))) return 'shoes';
  if (['包', '手袋', '挎', '托特', '链条'].some(k => s.includes(k))) return 'bag';
  if (['帽', '围巾', '丝巾', '领巾', '披肩', '脖套', '头巾'].some(k => s.includes(k))) return 'hat';
  return 'acc';
};
const WARDROBE_DB_CAT: Record<CatConcept, string> = {
  top: '上装', bottom: '下装', dress: '连体装', outer: '外套', shoes: '鞋履', bag: '包袋', hat: '帽巾', acc: '配饰',
};

export default function InspirationDetailScreen() {
  const params = useLocalSearchParams<{
    title: string; tag: string; desc: string;
    image_url: string; style_tags: string; occasion_tags: string;
    items: string;
  }>();

  const { items: wardrobeItems, fetchItems, addItem } = useWardrobeStore();
  const { user } = useUserStore();
  const [toast, setToast] = useState('');
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [wishlistedIdxs, setWishlistedIdxs] = useState<Set<number>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const title = decodeURIComponent(params.title ?? '');
  const tag = decodeURIComponent(params.tag ?? '');
  const desc = decodeURIComponent(params.desc ?? '');
  const imageUrl = decodeURIComponent(params.image_url ?? '');
  const styleTags = params.style_tags ? decodeURIComponent(params.style_tags).split(',') : [];
  const occasionTags = params.occasion_tags ? decodeURIComponent(params.occasion_tags).split(',') : [];

  let breakdownItems: InspirationItem[] = [];
  try {
    if (params.items) breakdownItems = JSON.parse(decodeURIComponent(params.items));
  } catch {}

  // Match each inspiration item against user's wardrobe
  // Same category = owned (user has something that can serve the same role)
  // Same category + same color = exact match (click navigates to that wardrobe item)
  const matchedItems = breakdownItems.map((bi) => {
    const normalizedCat = normalizeCategory(bi.category);
    const sameCatItems = wardrobeItems.filter(wi => normalizeCategory(wi.category) === normalizedCat);
    const colorMatch = sameCatItems.find(wi => wi.color === bi.color);
    const anyMatch = colorMatch ?? sameCatItems[0];
    return {
      ...bi,
      normalizedCategory: normalizedCat,
      owned: sameCatItems.length > 0,
      wardrobeItemId: anyMatch?.item_id ?? null,
      wardrobeImageUrl: anyMatch?.image_url ?? null,
      wardrobeName: anyMatch?.name ?? null,
    };
  });

  const ownedCount = matchedItems.filter(m => m.owned).length;
  const recCount = matchedItems.filter(m => !m.owned).length;

  const handleItemPress = (item: typeof matchedItems[number]) => {
    if (item.owned && item.wardrobeItemId) {
      router.push({ pathname: '/wardrobe/[id]', params: { id: item.wardrobeItemId } });
    } else {
      // Navigate to detail page as recommended item
      router.push({
        pathname: '/wardrobe/[id]',
        params: { id: `rec_${item.name}`, itemData: JSON.stringify({ ...item, category: item.normalizedCategory }) },
      });
    }
  };

  const handleAddToWardrobe = async (item: typeof matchedItems[number], idx: number) => {
    if (addingIdx !== null || !user?.id) { showToast('请先登录后再添加'); return; }
    setAddingIdx(idx);
    try {
      const saved = await addItem({
        user_id: user.id,
        name: item.name,
        category: WARDROBE_DB_CAT[toCatConcept(item.category)] as ClothingCategory,
        color: item.color || '',
        source_type: 'manual',
        source_label: '灵感推荐添加',
        status: 'active',
        image_url: item.image_url || undefined,
      });
      if (!saved) {
        const err = useWardrobeStore.getState().error;
        showToast(err ? `添加失败：${err}` : '添加失败，请稍后重试');
        return;
      }
      await fetchItems(user.id);
      showToast(`「${item.name}」已添加到衣橱`);
    } catch (e: any) {
      showToast('添加失败，请稍后重试');
    } finally {
      setAddingIdx(null);
    }
  };

  const handleAddToWishlist = async (item: typeof matchedItems[number], idx: number) => {
    if (!user?.id) { showToast('请先登录后再添加'); return; }
    const saved = await useWishlistStore.getState().addItem({
      user_id: user.id,
      name: item.name,
      category: item.normalizedCategory as ClothingCategory,
      color: item.color || '',
      image_url: item.image_url,
      source: 'ai_recommended',
    });
    if (!saved) {
      const err = useWishlistStore.getState().error;
      showToast(err ? `加入心愿单失败：${err}` : '加入心愿单失败，请稍后重试');
      return;
    }
    setWishlistedIdxs(prev => new Set(prev).add(idx));
    showToast('已加入心愿单');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero Image */}
        <View style={styles.heroWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroPlaceholder} />
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} hitSlop={12}>
            <Feather name="x" size={18} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        {/* Title & Description */}
        <View style={styles.titleSection}>
          <Text style={styles.heroTag}># {tag}</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroDesc}>{desc}</Text>
        </View>

        {/* Style Tags */}
        {(styleTags.length > 0 || occasionTags.length > 0) && (
          <View style={styles.tagSection}>
            <View style={styles.tagRow}>
              {styleTags.map(t => (
                <View key={t} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{t}</Text>
                </View>
              ))}
              {occasionTags.map(t => (
                <View key={t} style={[styles.tagPill, styles.tagPillOccasion]}>
                  <Text style={[styles.tagPillText, styles.tagPillTextOccasion]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Item Breakdown — aligned with outfit result page */}
        {matchedItems.length > 0 && (
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownTitle}>单品拆解</Text>
            <Text style={styles.comboSub}>
              已有 {ownedCount} 件 · 推荐 {recCount} 件
            </Text>
            <View style={styles.grid}>
              {matchedItems.map((item, idx) => {
                if (item.owned) {
                  return (
                    <TouchableOpacity key={`own_${idx}`}
                      style={styles.gridCard}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.badgeOwned}>已拥有</Text>
                      <View style={styles.gridThumb}>
                        {item.wardrobeImageUrl ? (
                          <Image source={{ uri: item.wardrobeImageUrl }} style={styles.gridThumbImg} resizeMode="cover" />
                        ) : item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.gridThumbImg} resizeMode="cover" />
                        ) : (
                          <CategoryIcon category={item.normalizedCategory} size={26} color={Colors.walnut2} />
                        )}
                      </View>
                      <Text style={styles.gridName} numberOfLines={1}>{item.wardrobeName || item.name}</Text>
                      <Text style={styles.gridMeta} numberOfLines={1}>{item.normalizedCategory} · {item.color}</Text>
                    </TouchableOpacity>
                  );
                }
                const isWishlisted = wishlistedIdxs.has(idx);
                return (
                  <View key={`rec_${idx}`} style={[styles.gridCard, styles.gridCardRec]}>
                    <Text style={styles.badgeRec}>你还没有</Text>
                    <TouchableOpacity onPress={() => handleItemPress(item)} activeOpacity={0.7}>
                      <View style={[styles.gridThumb, { backgroundColor: Colors.signalSoft }]}>
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.gridThumbImg} resizeMode="cover" />
                        ) : (
                          <CategoryIcon category={item.normalizedCategory} size={26} color={Colors.walnut2} />
                        )}
                      </View>
                    </TouchableOpacity>
                    <Text style={styles.gridName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.gridMeta} numberOfLines={1}>{item.normalizedCategory} · {item.color}</Text>
                    <View style={styles.recBtnCol}>
                      <TouchableOpacity style={styles.recAddBtn} activeOpacity={0.7}
                        disabled={addingIdx !== null}
                        onPress={() => handleAddToWardrobe(item, idx)}>
                        <Text style={styles.recAddBtnText}>{addingIdx === idx ? '添加中…' : '+衣橱'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.recWishBtn, isWishlisted && styles.recWishBtnDone]}
                        activeOpacity={0.7}
                        onPress={() => !isWishlisted && handleAddToWishlist(item, idx)}
                        disabled={isWishlisted}
                      >
                        <Text style={[styles.recWishBtnText, isWishlisted && styles.recWishBtnTextDone]}>
                          {isWishlisted ? '已加入' : '+心愿单'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <Toast message={toast} visible={!!toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  content: { paddingBottom: Spacing.six },

  heroWrap: {
    width: '100%', aspectRatio: 3 / 4, position: 'relative',
    backgroundColor: Colors.ink,
  },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { width: '100%', height: '100%', backgroundColor: Colors.paperCard },

  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Title section below image
  titleSection: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: 4 },
  heroTag: {
    fontSize: 11, color: Colors.terracotta, fontFamily: Fonts.uiSemiBold,
  },
  heroTitle: { fontSize: 22, fontFamily: Fonts.pageTitleSerif, color: Colors.ink },
  heroDesc: { fontSize: 14, color: Colors.walnut, lineHeight: 22 },

  // Tags
  tagSection: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9,
    backgroundColor: Colors.signal,
  },
  tagPillOccasion: { borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  tagPillText: { fontSize: 12, fontFamily: Fonts.ui, color: Colors.paper },
  tagPillTextOccasion: { color: Colors.accent },

  // Item Breakdown — aligned with result page grid
  breakdownSection: {
    marginHorizontal: Spacing.four, marginTop: Spacing.three,
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two,
    ...Shadow.one,
  },
  breakdownTitle: { fontSize: 15, fontFamily: Fonts.uiSemiBold, color: Colors.ink, marginBottom: Spacing.one },
  comboSub: { ...T.micro, color: Colors.walnut, marginBottom: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: '31.5%', backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two, position: 'relative', ...Shadow.one,
  },
  gridCardRec: {
    backgroundColor: Colors.accentSoft,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.terracotta,
  },
  gridThumb: {
    width: '100%', aspectRatio: 1.25, borderRadius: 10, overflow: 'hidden',
    backgroundColor: Colors.signalSoft, alignItems: 'center', justifyContent: 'center',
  },
  gridThumbImg: { width: '100%', height: '100%' },
  gridName: { fontFamily: Fonts.ui, fontSize: 12, color: Colors.ink, textAlign: 'center', marginTop: 4 },
  gridMeta: { fontFamily: Fonts.ui, fontSize: 10, color: Colors.walnut2, textAlign: 'center', marginTop: 1 },
  badgeOwned: { position: 'absolute', top: 6, right: 8, zIndex: 2, fontSize: 10, color: Colors.walnut2 },
  badgeRec: { position: 'absolute', top: 6, right: 8, zIndex: 2, fontSize: 10, color: Colors.terracotta, fontFamily: Fonts.uiSemiBold },
  recBtnCol: { flexDirection: 'row', marginTop: 4, gap: 4 },
  recAddBtn: { flex: 1, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.ink, alignItems: 'center' },
  recAddBtnText: { color: '#fff', fontSize: 10, fontFamily: Fonts.uiSemiBold },
  recWishBtn: { flex: 1, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.paper, alignItems: 'center' },
  recWishBtnDone: { borderColor: Colors.line, backgroundColor: Colors.paperCard },
  recWishBtnText: { fontSize: 10, color: Colors.ink, fontFamily: Fonts.ui },
  recWishBtnTextDone: { fontSize: 10, color: Colors.walnut2 },
});
