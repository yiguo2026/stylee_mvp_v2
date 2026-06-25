import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, ScrollView, ActivityIndicator, SafeAreaView, Alert,
  Animated, Modal, FlatList, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { aiRecommendOutfits } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Outfit, OutfitItem, WardrobeItem, RecommendedItem, ClothingCategory, CLOTHING_CATEGORIES } from '@/types';

const CATEGORY_EMOJI: Record<string, string> = {
  '上装': '👔', '下装': '👖', '连体装': '👗', '外套': '🧥', '鞋': '👟', '包': '👜', '帽子': '🧢', '围巾': '🧣',
};

export default function OutfitResultScreen() {
  const params = useLocalSearchParams<{
    city: string; temp: string; weather: string; query: string; tags: string; inputMode?: string;
  }>();
  const { user, stylePreferences } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();

  const [loading, setLoading] = useState(true);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showSavedConfirm, setShowSavedConfirm] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const [swapTarget, setSwapTarget] = useState<OutfitItem | null>(null);
  // Wishlist states per recommended item
  const [wishlistedRecs, setWishlistedRecs] = useState<Set<number>>(new Set());

  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const init = async () => {
      if (user?.id) await fetchItems(user.id);
      generateOutfits();
    };
    init();
  }, []);

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else { dotAnim.stopAnimation(); }
  }, [loading]);

  const generateOutfits = async () => {
    setLoading(true);
    setSavedId(null);
    setIsFavorited(false);
    setCurrentIndex(0);
    setErrorMessage(null);
    setWishlistedRecs(new Set());
    const sessionId = `session_${Date.now()}`;
    const freshItems = useWardrobeStore.getState().items;
    const freshPrefs = useUserStore.getState().stylePreferences;
    const likedStyleNames = freshPrefs
      ?.filter(p => p.preference_type === 'like' && p.tag?.tag_name)
      .map(p => p.tag!.tag_name)
      .join('、') ?? '';
    const { outfits: results, error } = await aiRecommendOutfits(
      freshItems, user?.id ?? '', sessionId,
      { weather: params.weather, temp: params.temp, city: params.city, query: params.query, tags: params.tags, stylePreferences: likedStyleNames },
    );
    setOutfits(results);
    if (error) setErrorMessage(error);
    setLoading(false);
  };

  const currentOutfit = outfits[currentIndex];

  const handleWear = async (): Promise<string | null> => {
    if (!currentOutfit || !user) return null;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('登录已过期', '请重新登录后再保存');
        return null;
      }
      const { data, error } = await supabase
        .from('outfits')
        .insert({
          user_id: user.id,
          name: currentOutfit.name || `搭配 ${new Date().toLocaleDateString('zh-CN')}`,
          ai_comment: currentOutfit.ai_comment,
          source: 'ai_generated',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        console.warn('[handleWear] insert error:', error.code, error.message);
        throw error;
      }
      const outfitId = data.outfit_id;
      const itemRows = (currentOutfit.items ?? []).map((oi, idx) => ({
        outfit_id: outfitId, item_id: oi.item_id, display_order: idx,
      }));
      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase.from('outfit_items').insert(itemRows);
        if (itemsError) console.warn('[handleWear] outfit_items insert error:', itemsError.message);
      }
      setSavedId(outfitId);
      setShowSavedConfirm(true);
      return outfitId;
    } catch (e: any) {
      Alert.alert('保存失败', e.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleFavorite = async () => {
    if (!currentOutfit || !user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert('登录已过期', '请重新登录后再操作');
      return;
    }
    if (isFavorited) {
      await supabase.from('outfit_favorites').delete()
        .eq('user_id', user.id)
        .eq('outfit_id', currentOutfit.outfit_id);
      setIsFavorited(false);
    } else {
      // Save outfit first if not saved, get real DB outfit_id
      let outfitId = savedId;
      if (!outfitId) {
        outfitId = await handleWear();
        if (!outfitId) return;
      }
      const { error: favError } = await supabase.from('outfit_favorites').insert({
        user_id: user.id, outfit_id: outfitId,
      });
      if (favError) console.warn('[handleFavorite] insert error:', favError.message);
      setIsFavorited(true);
    }
  };

  const handleSwap = () => {
    if (outfits.length <= 1) { generateOutfits(); return; }
    setCurrentIndex((currentIndex + 1) % outfits.length);
    setSavedId(null);
    setIsFavorited(false);
    setAdjustMode(false);
  };

  const handleAdjustToggle = () => {
    setAdjustMode(prev => !prev);
    setSwapTarget(null);
  };

  const handleItemTap = (oi: OutfitItem) => {
    if (!adjustMode) {
      router.push({ pathname: '/wardrobe/[id]', params: { id: oi.item_id } });
      return;
    }
    setSwapTarget(oi);
  };

  const confirmSwap = (newItem: WardrobeItem) => {
    if (!swapTarget) return;
    setOutfits(prev => prev.map((o, i) => {
      if (i !== currentIndex) return o;
      return {
        ...o,
        items: o.items?.map(oi =>
          oi.item_id === swapTarget.item_id ? { ...oi, item_id: newItem.item_id, item: newItem } : oi
        ),
      };
    }));
    setSavedId(null);
    setSwapTarget(null);
  };

  const outfitItemIds = new Set(currentOutfit?.items?.map(oi => oi.item_id) ?? []);
  const swapAlternatives = swapTarget
    ? items.filter(i => i.category === swapTarget.item?.category && !outfitItemIds.has(i.item_id))
    : [];

  const addRecommendedToWardrobe = async (rec: RecommendedItem, idx: number) => {
    if (!user?.id) return;
    const { addItem } = useWardrobeStore.getState();
    const saved = await addItem({
      user_id: user.id, name: rec.name, category: rec.category,
      color: rec.color, source_type: 'ai_recommended',
      source_label: 'AI推荐添加', status: 'active',
      image_url: rec.image_url || undefined,
    });
    if (saved) {
      setOutfits(prev => prev.map((o, i) => {
        if (i !== currentIndex) return o;
        const newItems = [
          ...(o.items ?? []),
          { item_id: saved.item_id, outfit_id: o.outfit_id, display_order: (o.items ?? []).length, item: saved },
        ];
        return { ...o, items: newItems, recommended_items: o.recommended_items?.filter((_, ri) => ri !== idx) };
      }));
      await fetchItems(user.id);
      Alert.alert('提示', '已添加到衣橱');
    }
  };

  const addRecommendedToWishlist = async (rec: RecommendedItem, idx: number) => {
    if (!user?.id) return;
    await supabase.from('wishlist_items').insert({
      user_id: user.id, name: rec.name, category: rec.category,
      color: rec.color, source: 'ai_recommended',
    });
    setWishlistedRecs(prev => new Set(prev).add(idx));
  };

  const normalizeCategory = (raw: string): string => {
    const s = raw.trim();
    if (['上装', '衬衫', 'T恤', '毛衣', '卫衣', '上衣', '针织衫', '吊带', '背心', '打底衫', '马甲', 'Polo衫'].some(k => s.includes(k))) return '上装';
    if (['下装', '裤子', '牛仔裤', '阔腿裤', '短裤', '长裤', '半裙', '西裤', '运动裤', '休闲裤', '哈伦裤', '工装裤', '直筒裤', '喇叭裤'].some(k => s.includes(k))) return '下装';
    if (['连衣裙', '裙子', '长裙', '短裙', '裙装', 'onepiece', '连体装'].some(k => s.includes(k))) return '连体装';
    if (['外套', '夹克', '大衣', '风衣', '羽绒服', '棉服', '西装', '开衫', '皮衣', '冲锋衣', '棒球服', '皮草'].some(k => s.includes(k))) return '外套';
    if (['鞋', '鞋子', '高跟鞋', '运动鞋', '靴子', '凉鞋', '皮鞋', '单鞋', '帆布鞋', '板鞋', '拖鞋', '乐福鞋', '短靴', '长靴', '老爹鞋', '马丁靴'].some(k => s.includes(k))) return '鞋';
    if (['包', '包包', '手提包', '双肩包', '斜挎包', '手袋', '挎包', '托特包', '链条包', '腰包', '背包'].some(k => s.includes(k))) return '包';
    if (['帽子', '帽', '棒球帽', '渔夫帽', '冷帽', '贝雷帽', '针织帽', '遮阳帽', '草帽'].some(k => s.includes(k))) return '帽子';
    if (['围巾', '丝巾', '领巾', '披肩', '脖套'].some(k => s.includes(k))) return '围巾';
    if (CLOTHING_CATEGORIES.includes(s as ClothingCategory)) return s;
    return s;
  };

  // Build flatlay items
  const allFlatlayItems = currentOutfit
    ? [
        ...(currentOutfit.items ?? []).map(oi => ({
          id: oi.item_id, name: oi.item?.name ?? oi.item?.category ?? '',
          category: normalizeCategory(oi.item?.category ?? ''), color: oi.item?.color ?? '',
          image_url: oi.item?.image_url, owned: true,
        })),
        ...(currentOutfit.recommended_items ?? []).map((rec, idx) => ({
          id: `rec_${idx}`, name: rec.name, category: normalizeCategory(rec.category),
          color: rec.color, image_url: rec.image_url, owned: false,
        })),
      ]
    : [];

  const MAIN_ORDER: Record<string, number> = { '外套': 0, '上装': 1, '下装': 2, '连体装': 2, '鞋': 3 };
  const mainItems = allFlatlayItems
    .filter(fi => fi.category in MAIN_ORDER)
    .sort((a, b) => (MAIN_ORDER[a.category] ?? 9) - (MAIN_ORDER[b.category] ?? 9));
  const sideItems = allFlatlayItems.filter(fi => fi.category === '围巾' || fi.category === '帽子' || fi.category === '包');
  const topItems = mainItems.filter(fi => fi.category === '上装' || fi.category === '外套');
  const bottomItems = mainItems.filter(fi => fi.category === '下装' || fi.category === '连体装');
  const shoeItems = mainItems.filter(fi => fi.category === '鞋');

  const ownedItems = currentOutfit?.items ?? [];
  const recommendedItems = currentOutfit?.recommended_items ?? [];

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Ionicons name="sparkles-outline" size={52} color={Colors.walnut2} style={styles.loadingIconView} />
          <Text style={styles.loadingTitle}>AI 正在为你搭配…</Text>
          <Text style={styles.loadingSubtitle}>从你的衣橱里挑选最合适的单品</Text>
          <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.three }} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty ──
  if (outfits.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ 返回</Text></TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="hanger" size={52} color={Colors.walnut2} />
          <Text style={styles.emptyTitle}>无法生成推荐</Text>
          <Text style={styles.emptySubtitle}>
            {errorMessage || '需要衣橱里有上装和下装才能生成搭配'}{'\n'}快去添加几件衣服吧！
          </Text>
          <TouchableOpacity style={styles.addWardrobeBtn}
            onPress={() => { router.back(); router.push('/wardrobe/add'); }}>
            <Text style={styles.addWardrobeBtnText}>去添加衣物</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderGarment = (fi: { id: string; name: string; category: string; image_url?: string }) => (
    <View key={fi.id} style={styles.flatlayTopWrap}>
      <View style={[styles.flatlayTopShape, !fi.image_url && { backgroundColor: '#D4A574' }]}>
        {fi.image_url ? (
          <Image source={{ uri: fi.image_url }} style={styles.flatlayGarmentImg} resizeMode="cover" />
        ) : (
          <View style={styles.flatlayGarmentInner}>
            <Text style={styles.flatlayEmoji}>{CATEGORY_EMOJI[fi.category] || '👔'}</Text>
            <Text style={styles.flatlayGarmentLabel} numberOfLines={1}>{fi.name}</Text>
          </View>
        )}
      </View>
      <Text style={styles.flatlayItemName} numberOfLines={1}>{fi.name}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>推荐方案</Text>
        <TouchableOpacity style={styles.favBtn} onPress={handleFavorite}>
          <Text style={[styles.favIcon, isFavorited && styles.favIconActive]}>
            {isFavorited ? '♥' : '♡'}
          </Text>
          <Text style={[styles.favLabel, isFavorited && styles.favLabelActive]}>
            {isFavorited ? '已收藏' : '收藏此搭配'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Weather & Context */}
        <View style={styles.contextRow}>
          <Text style={styles.contextText}>{params.weather} {params.temp}°C · {params.city}</Text>
          {params.query ? <Text style={styles.queryText}>「{params.query}」</Text> : null}
        </View>

        {/* ── 1. Flatlay ── */}
        <View style={styles.flatlayArea}>
          {allFlatlayItems.length > 0 ? (
            <View style={styles.flatlayRow}>
              <View style={styles.flatlayMain}>
                {topItems.length > 0 && <View style={styles.flatlayTopsRow}>{topItems.map(renderGarment)}</View>}
                {bottomItems.map((fi) => (
                  <View key={fi.id} style={styles.flatlayBottomWrap}>
                    <View style={[styles.flatlayBottomShape, !fi.image_url && { backgroundColor: '#5C6B73' }]}>
                      {fi.image_url ? (
                        <Image source={{ uri: fi.image_url }} style={styles.flatlayGarmentImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.flatlayGarmentInner}>
                          <Text style={styles.flatlayEmoji}>{CATEGORY_EMOJI[fi.category] || '👖'}</Text>
                          <Text style={styles.flatlayGarmentLabel} numberOfLines={1}>{fi.name}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.flatlayItemName} numberOfLines={1}>{fi.name}</Text>
                  </View>
                ))}
                {shoeItems.length > 0 && (
                  <View style={styles.flatlayShoesRow}>
                    {shoeItems.map((fi) => (
                      <View key={fi.id} style={styles.flatlayShoeWrap}>
                        <View style={styles.flatlayShoeShape}>
                          {fi.image_url ? (
                            <Image source={{ uri: fi.image_url }} style={styles.flatlayShoeImg} resizeMode="cover" />
                          ) : (
                            <Text style={styles.flatlayEmoji}>{CATEGORY_EMOJI[fi.category] || '👟'}</Text>
                          )}
                        </View>
                        <Text style={styles.flatlayItemName} numberOfLines={1}>{fi.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              {sideItems.length > 0 && (
                <View style={styles.flatlaySide}>
                  {sideItems.map((fi) => (
                    <View key={fi.id} style={styles.flatlaySideItem}>
                      <View style={styles.flatlaySideCircle}>
                        {fi.image_url ? (
                          <Image source={{ uri: fi.image_url }} style={styles.flatlaySideImg} resizeMode="cover" />
                        ) : (
                          <Text style={styles.flatlaySideEmoji}>{CATEGORY_EMOJI[fi.category] || '✨'}</Text>
                        )}
                      </View>
                      <Text style={styles.flatlaySideName} numberOfLines={1}>{fi.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.flatlayEmpty}><Text style={styles.flatlayEmptyText}>暂无搭配单品</Text></View>
          )}
        </View>

        {/* ── 2. Owned Items ── */}
        {ownedItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>👕 已有单品</Text>
              <Text style={styles.sectionSubOwned}>来自你的衣橱</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.itemsRow}>
                {ownedItems.map((oi) => (
                  <TouchableOpacity key={oi.item_id}
                    style={[styles.itemCard, adjustMode && styles.itemCardAdjust]}
                    onPress={() => handleItemTap(oi)} activeOpacity={adjustMode ? 0.6 : 1}
                  >
                    <View style={styles.itemThumbSmall}>
                      {oi.item?.image_url ? (
                        <Image source={{ uri: oi.item.image_url }} style={styles.itemThumbImg} resizeMode="cover" />
                      ) : (
                        <View style={styles.itemThumbPlaceholder}>
                          <CategoryIcon category={oi.item?.category ?? ''} size={22} color={Colors.walnut2} />
                        </View>
                      )}
                    </View>
                    <View style={styles.itemCardInfo}>
                      <Text style={styles.itemCardName} numberOfLines={1}>{oi.item?.name ?? oi.item?.category}</Text>
                      <Text style={styles.itemCardOwned}>✓ 已有</Text>
                    </View>
                    {adjustMode && (
                      <View style={styles.swapBadge}><Feather name="refresh-cw" size={10} color={Colors.paper} /></View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ── 3. Recommended Items ── */}
        {recommendedItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>✨ 推荐单品</Text>
              <Text style={styles.sectionSubRec}>建议添加</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.itemsRow}>
                {recommendedItems.map((rec, idx) => {
                  const isWishlisted = wishlistedRecs.has(idx);
                  return (
                    <TouchableOpacity key={`rec_${idx}`}
                      style={[styles.itemCard, styles.itemCardRecommended]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.itemThumbSmall, { backgroundColor: '#F0EDFF' }]}>
                        {rec.image_url ? (
                          <Image source={{ uri: rec.image_url }} style={styles.itemThumbImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.itemThumbPlaceholder}>
                            <CategoryIcon category={rec.category} size={22} color={Colors.walnut2} />
                          </View>
                        )}
                      </View>
                      <View style={styles.itemCardInfo}>
                        <Text style={styles.itemCardName} numberOfLines={1}>{rec.name}</Text>
                        <TouchableOpacity style={styles.addToWardrobeBtn}
                          onPress={() => addRecommendedToWardrobe(rec, idx)}>
                          <Text style={styles.addToWardrobeBtnText}>+ 加入衣橱</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.wishlistBtn, isWishlisted && styles.wishlistBtnDone]}
                          onPress={() => !isWishlisted && addRecommendedToWishlist(rec, idx)}
                          disabled={isWishlisted}
                        >
                          <Text style={[styles.wishlistBtnText, isWishlisted && styles.wishlistBtnTextDone]}>
                            {isWishlisted ? '已收藏' : '♡ 收藏'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.recBadge}><Text style={styles.recBadgeText}>推荐</Text></View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* All owned hint */}
        {recommendedItems.length === 0 && ownedItems.length > 0 && (
          <View style={styles.allOwnedHint}>
            <Text style={styles.allOwnedText}>🎉 太棒了！这套搭配所需单品你都有</Text>
          </View>
        )}

        {/* ── Try-on Button ── */}
        <TouchableOpacity
          style={styles.tryOnEntry}
          onPress={() => {
            const items = (currentOutfit.items ?? []).map(i => ({
              item_id: i.item_id,
              name: i.item?.name ?? '单品',
              category: i.item?.category ?? '',
              color: i.item?.color ?? '',
              image_url: i.item?.image_url,
            }));
            router.push({ pathname: '/outfit/try-on', params: { items: JSON.stringify(items) } });
          }}
        >
          <Ionicons name="person-outline" size={18} color="#6C5CE7" />
          <Text style={styles.tryOnEntryText}>AI 试穿看看</Text>
          <Feather name="chevron-right" size={14} color="#6C5CE7" />
        </TouchableOpacity>
      </ScrollView>

      {/* ── 5. Decision Bar ── */}
      <View style={styles.decisionBar}>
        <TouchableOpacity
          style={[styles.decisionBtnConfirm, !!savedId && styles.decisionBtnSaved]}
          onPress={handleWear} disabled={saving || !!savedId}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.decisionBtnConfirmText}>{savedId ? '✓ 已保存' : '就这么穿'}</Text>}
        </TouchableOpacity>
        <View style={styles.decisionBtnRow}>
          <TouchableOpacity style={styles.decisionBtnSecondary} onPress={handleSwap}>
            <Text style={styles.decisionBtnSwapText}>换一套看看</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.decisionBtnSecondary} onPress={handleAdjustToggle}>
            <Text style={[styles.decisionBtnAdjustText, adjustMode && { color: Colors.terracotta }]}>
              {adjustMode ? '完成调整' : '稍作调整'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Swap Modal */}
      <Modal visible={swapTarget !== null} transparent animationType="slide" onRequestClose={() => setSwapTarget(null)}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSwapTarget(null)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>替换{swapTarget?.item?.category ?? ''}</Text>
            <TouchableOpacity onPress={() => setSwapTarget(null)}><Text style={styles.modalClose}>取消</Text></TouchableOpacity>
          </View>
          {swapAlternatives.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Text style={styles.modalEmptyText}>衣橱里没有其他{swapTarget?.item?.category}可以替换{'\n'}去衣橱添加更多单品吧</Text>
            </View>
          ) : (
            <FlatList data={swapAlternatives} keyExtractor={i => i.item_id} numColumns={3}
              contentContainerStyle={styles.swapGrid}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.swapOption} onPress={() => confirmSwap(item)}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.swapOptionImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.swapOptionPlaceholder}>
                      <CategoryIcon category={item.category} size={28} color={Colors.walnut2} />
                    </View>
                  )}
                  <Text style={styles.swapOptionName} numberOfLines={2}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <ConfirmModal visible={showSavedConfirm && !!savedId} title="已保存"
        message="这套搭配已保存到你的穿搭记录 🎉" confirmText="好的" singleButton
        onConfirm={() => { setShowSavedConfirm(false); router.back(); }}
        onCancel={() => setShowSavedConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  loadingIconView: { marginBottom: Spacing.one },
  loadingTitle: { ...T.storyTitle, fontSize: 22 },
  loadingSubtitle: { ...T.bodyText, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: Colors.line, backgroundColor: Colors.paperRaised },
  back: { ...T.buttonSecondary, color: Colors.ink, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  headerIdx: { color: Colors.terracotta },
  headerTotal: { color: Colors.walnut2 },
  favBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  favIcon: { fontSize: 18, color: Colors.walnut2 },
  favIconActive: { color: '#FF3B30' },
  favLabel: { fontSize: 12, color: Colors.walnut2, fontWeight: '500' },
  favLabelActive: { color: '#FF3B30' },

  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: 100 },
  contextRow: { gap: 2 },
  contextText: { ...T.caption, fontSize: 13, letterSpacing: 0.78 },
  queryText: { ...T.itemDesc, color: Colors.walnut },

  flatlayArea: { marginHorizontal: Spacing.two, minHeight: 280, borderRadius: Radius.xl, backgroundColor: '#FAFAFA', position: 'relative', overflow: 'hidden', padding: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  flatlayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, width: '100%' },
  flatlayMain: { flex: 1, alignItems: 'center', gap: Spacing.two },
  flatlayTopsRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  flatlayTopWrap: { alignItems: 'center', gap: 4 },
  flatlayTopShape: { width: 140, height: 80, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  flatlayBottomWrap: { alignItems: 'center', gap: 4 },
  flatlayBottomShape: { width: 160, height: 120, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  flatlayGarmentImg: { width: '100%', height: '100%' },
  flatlayGarmentInner: { alignItems: 'center', gap: 2 },
  flatlayGarmentLabel: { fontSize: 10, opacity: 0.7, color: '#fff', textAlign: 'center' },
  flatlayEmoji: { fontSize: 24, textAlign: 'center' },
  flatlayItemName: { fontSize: 11, color: Colors.walnut2, textAlign: 'center', maxWidth: 160 },
  flatlayShoesRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three },
  flatlayShoeWrap: { alignItems: 'center', gap: 4 },
  flatlayShoeShape: { width: 60, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  flatlayShoeImg: { width: '100%', height: '100%' },
  flatlaySide: { width: 64, alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.two },
  flatlaySideItem: { alignItems: 'center', gap: 4 },
  flatlaySideCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF8E1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  flatlaySideImg: { width: '100%', height: '100%', borderRadius: 26 },
  flatlaySideEmoji: { fontSize: 20, textAlign: 'center' },
  flatlaySideName: { fontSize: 10, color: Colors.walnut2, textAlign: 'center', maxWidth: 60 },
  flatlayEmpty: { padding: Spacing.five, alignItems: 'center' },
  flatlayEmptyText: { ...T.bodyText, color: Colors.walnut2, fontSize: 13 },

  dotIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DFE6E9' },
  dotActive: { width: 20, borderRadius: 4, backgroundColor: Colors.terracotta },

  section: { gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...T.bodyText, fontWeight: '600', fontSize: 13, color: Colors.ink },
  sectionSubOwned: { ...T.micro, color: Colors.sage },
  sectionSubRec: { ...T.micro, color: Colors.terracotta },

  itemsRow: { flexDirection: 'row', gap: 10, paddingVertical: Spacing.one },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, backgroundColor: Colors.paperRaised, borderRadius: Radius.md, minWidth: 140, ...Shadow.one, position: 'relative' },
  itemCardAdjust: { opacity: 0.85 },
  itemCardRecommended: { borderWidth: 2, borderColor: Colors.terracotta, borderStyle: 'dashed', backgroundColor: '#FFFAF5' },
  itemThumbSmall: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  itemThumbImg: { width: '100%', height: '100%', borderRadius: 10 },
  itemThumbPlaceholder: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: Colors.vintageCream, alignItems: 'center', justifyContent: 'center' },
  itemCardInfo: { flexDirection: 'column', flex: 1 },
  itemCardName: { fontWeight: '500', fontSize: 12, color: Colors.ink },
  itemCardOwned: { fontSize: 10, color: Colors.sage, marginTop: 1 },
  addToWardrobeBtn: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.ink, alignSelf: 'flex-start' },
  addToWardrobeBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  wishlistBtn: { marginTop: 2, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.terracotta, alignSelf: 'flex-start' },
  wishlistBtnDone: { borderColor: Colors.line, backgroundColor: Colors.paperCard },
  wishlistBtnText: { fontSize: 10, color: Colors.terracotta, fontWeight: '500' },
  wishlistBtnTextDone: { fontSize: 10, color: Colors.walnut2 },
  swapBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: Colors.terracotta, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  recBadge: { position: 'absolute', top: -6, right: -4, backgroundColor: Colors.terracotta, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  recBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  allOwnedHint: { backgroundColor: '#E8F5E9', borderRadius: Radius.md, padding: Spacing.three, alignItems: 'center' },
  allOwnedText: { ...T.bodyText, color: Colors.sage, fontSize: 13 },

  aiCommentCard: { marginHorizontal: Spacing.two, padding: Spacing.three, backgroundColor: Colors.paperRaised, borderRadius: 14, ...Shadow.two, position: 'relative', marginTop: Spacing.one },
  tryOnEntry: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.two, paddingVertical: Spacing.two + 4,
    backgroundColor: '#F0EDFF', borderRadius: Radius.md, gap: Spacing.one,
    borderWidth: 1, borderColor: '#E0D8FF',
  },
  tryOnEntryText: { ...T.bodyText, fontSize: 14, color: '#6C5CE7', fontWeight: '600' },
  aiBadge: { position: 'absolute', top: -8, left: 14, backgroundColor: Colors.ink, paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 6 },
  aiBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  aiCommentText: { fontSize: 13, lineHeight: 22, color: '#636E72', marginTop: Spacing.one },

  decisionBar: { gap: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, backgroundColor: Colors.paperRaised, borderTopWidth: 1, borderTopColor: Colors.line },
  decisionBtnRow: { flexDirection: 'row', gap: 8 },
  decisionBtnSecondary: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.paperCard },
  decisionBtnAdjustText: { fontSize: 13, fontWeight: '600', color: Colors.walnut },
  decisionBtnSwapText: { fontSize: 13, fontWeight: '600', color: Colors.ink },
  decisionBtnConfirm: { paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.ink, ...Shadow.two },
  decisionBtnSaved: { backgroundColor: Colors.sage },
  decisionBtnConfirmText: { fontSize: 14, fontWeight: '600', color: Colors.paper },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: { backgroundColor: Colors.paperRaised, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.line },
  modalTitle: { ...T.subTitle },
  modalClose: { ...T.buttonSecondary, color: Colors.terracotta },
  modalEmpty: { padding: Spacing.five, alignItems: 'center' },
  modalEmptyText: { ...T.emptyTitle, fontSize: 14, textAlign: 'center', lineHeight: 24 },
  swapGrid: { padding: Spacing.three, gap: Spacing.two },
  swapOption: { flex: 1, margin: Spacing.one, alignItems: 'center', gap: 4 },
  swapOptionImage: { width: '100%', aspectRatio: 1, borderRadius: Radius.md },
  swapOptionPlaceholder: { width: '100%', aspectRatio: 1, borderRadius: Radius.md, backgroundColor: Colors.vintageCream, alignItems: 'center', justifyContent: 'center' },
  swapOptionName: { ...T.micro, textAlign: 'center' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  emptyTitle: { ...T.emptyTitle, fontSize: 20 },
  emptySubtitle: { ...T.itemDesc, textAlign: 'center', lineHeight: 22 },
  addWardrobeBtn: { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 4, marginTop: Spacing.two },
  addWardrobeBtnText: { ...T.buttonPrimary, color: Colors.paper },
});
