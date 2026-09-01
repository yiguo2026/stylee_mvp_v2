import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView,
  Animated, Modal, FlatList, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useOutfitStore } from '@/stores/outfitStore';
import { aiRecommendOutfits, AIMeta } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { CategoryIcon } from '@/components/CategoryIcon';
import { AddClothingSheet } from '@/components/AddClothingSheet';
import { Toast } from '@/components/Toast';
import { AILoading } from '@/components/AILoading';
import { AIResultBanner } from '@/components/AIResultBanner';
import {
  ds,
  StyleeButton,
  StyleeGarmentMedia,
  StyleeInlineStatus,
  StyleeNavigationBar,
  StyleeOutfitCanvas,
  StyleeOutfitItemCard,
  StyleeStickyDecisionBar,
} from '@/design-system';
import { consumeQuota, getQuota } from '@/lib/dailyQuota';
import { outfitImageMetricsForWardrobeItem } from '@/lib/outfitImageMetrics';
import { buildTryOnItemBrief } from '@/lib/tryonItemPolicy';
import { Outfit, OutfitItem, WardrobeItem, RecommendedItem, ClothingCategory } from '@/types';
import type { OutfitCanvasLayoutItem } from '@/lib/outfitCanvasLayout';

const isWeb = Platform.OS === 'web';

const GEN_STEPS = ['分析天气场景...', '筛选衣橱单品...', '组合搭配方案...', '优化推荐说明...'];
const GEN_TOTAL_STEPS = GEN_STEPS.length;
const GEN_STEP_DURATION_MS = 800;

// 线上数据库的 category 约束使用旧词表，且两张表不一致：
//   wardrobe_items 允许: 上装/下装/外套/鞋/包/配饰
//   wishlist_items 允许: 上装/下装/连体装/外套/鞋/包/围巾
// AI 推荐的类别（如“衬衫/连衣裙/运动鞋”）需先归一到概念，再映射到各表允许值，否则触发 CHECK 约束导致插入失败。
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

export default function OutfitResultScreen() {
  const params = useLocalSearchParams<{
    city: string; temp: string; weather: string; query: string; tags: string; inputMode?: string;
  }>();
  const { user } = useUserStore();
  const { items, fetchItems } = useWardrobeStore();
  const { refreshCounts } = useOutfitStore();

  const [loading, setLoading] = useState(true);
  const [, setGenStep] = useState(0);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [confirmedWear, setConfirmedWear] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const [swapTarget, setSwapTarget] = useState<OutfitItem | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  // Wishlist states per recommended item
  const [wishlistedRecs, setWishlistedRecs] = useState<Set<number>>(new Set());
  const [aiMeta, setAiMeta] = useState<AIMeta | null>(null);

  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [toast, setToast] = useState('');
  const [addingRecIdx, setAddingRecIdx] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaConsumedRef = useRef(false);
  const previewStartRef = useRef<number>(Date.now());
  const exitReasonRef = useRef<'back' | 'save' | 'regenerate' | 'change_item'>('back');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  }, []);

  const dotAnim = useRef(new Animated.Value(0)).current;

  const generateOutfits = useCallback(async (options?: { keepCurrentOnFallback?: boolean }) => {
    const keepCurrentOnFallback = options?.keepCurrentOnFallback === true;
    setLoading(true);
    if (!keepCurrentOnFallback) {
      setSavedId(null);
      setIsFavorited(false);
      setCurrentIndex(0);
    }
    setErrorMessage(null);
    setWishlistedRecs(new Set());
    setGenStep(0);

    // 进度条动画 (4步)，用 Promise.all 保证动画时长与AI请求并行
    const totalSteps = GEN_TOTAL_STEPS;
    const minDurationMs = totalSteps * GEN_STEP_DURATION_MS;
    const startTime = Date.now();

    let finished = false;
    const animPromise = new Promise<void>(resolve => {
      const runStep = (i: number) => {
        if (finished) return resolve();
        setGenStep(i);
        if (i < totalSteps - 1) {
          setTimeout(() => runStep(i + 1), GEN_STEP_DURATION_MS);
        } else {
          // 最后一步
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, minDurationMs - elapsed);
          setTimeout(() => resolve(), remaining);
        }
      };
      runStep(0);
    });

    const userId = useUserStore.getState().user?.id;
    if (!userId) {
      finished = true;
      if (!keepCurrentOnFallback) setOutfits([]);
      setErrorMessage('请先登录后再生成搭配');
      setLoading(false);
      return;
    }

    // Consume quota only once per page visit, even if generateOutfits re-runs
    let quotaResult;
    if (quotaConsumedRef.current) {
      const gq = await getQuota(userId, 'recommend');
      quotaResult = { used: gq.used, limit: gq.limit, remaining: gq.remaining, ok: gq.remaining > 0 };
    } else {
      quotaResult = await consumeQuota(userId, 'recommend');
      quotaConsumedRef.current = true;
    }
    setQuota({ used: quotaResult.used, limit: quotaResult.limit, remaining: quotaResult.remaining });
    if (!quotaResult.ok) {
      finished = true;
      if (!keepCurrentOnFallback) setOutfits([]);
      setErrorMessage(`今日 AI 推荐次数已用完（${quotaResult.limit} 次），明天再来`);
      setLoading(false);
      return;
    }

    const sessionId = `session_${Date.now()}`;
    const freshItems = useWardrobeStore.getState().items;
    const freshPrefs = useUserStore.getState().stylePreferences;
    const likedStyleNames = freshPrefs
      ?.filter(p => p.preference_type === 'like')
      .map(p => p.tag?.tag_name)
      .filter((name): name is string => Boolean(name))
      .join('、') ?? '';

    const aiPromise = aiRecommendOutfits(
      freshItems,
      userId,
      sessionId,
      {
        weather: params.weather,
        temp: params.temp,
        city: params.city,
        query: params.query,
        tags: params.tags,
        stylePreferences: likedStyleNames,
      },
    );

    const aiResult = await aiPromise;
    await animPromise;

    finished = true;
    if (keepCurrentOnFallback && aiResult.meta.source === 'fallback') {
      showToast('模型服务暂时没有生成新方案，已保留当前搭配');
      setLoading(false);
      return;
    }
    setOutfits(aiResult.outfits);
    setAiMeta(aiResult.meta);
    if (aiResult.error) setErrorMessage(aiResult.error);
    setLoading(false);

    try {
      track('outfit_generate_result', {
        status: aiResult.error ? 'failed' : 'success',
        duration_ms: Date.now() - startTime,
        item_count: aiResult.outfits[0]?.items?.length ?? 0,
        error_code: aiResult.error ?? undefined,
      });
    } catch {}
  }, [params.city, params.query, params.tags, params.temp, params.weather, showToast]);

  useEffect(() => {
    const init = async () => {
      if (user?.id) {
        await fetchItems(user.id);
        setQuota(await getQuota(user.id, 'recommend'));
      }
      await generateOutfits();
    };
    void init();
  }, [user?.id, fetchItems, generateOutfits]);

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else { dotAnim.stopAnimation(); }
  }, [loading, dotAnim]);

  // 卸载时清理定时器，避免 setState after unmount
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // outfit_preview_duration: 离开时上报预览停留时长
    try {
      track('outfit_preview_duration', {
        outfit_id: savedId ?? `temp_${currentIndex}`,
        duration_ms: Date.now() - previewStartRef.current,
        exited_by: exitReasonRef.current,
      });
    } catch {}
  }, []);

  const currentOutfit = outfits[currentIndex];

  const handleWear = async (silent = false): Promise<string | null> => {
    if (!currentOutfit || !user) return null;
    if (!silent) {
      exitReasonRef.current = 'save';
      try { track('outfit_action', { outfit_id: savedId ?? `temp_${currentIndex}`, action: 'save' }); } catch {}
    }
    // 如果已经保存过（如收藏时静默保存），直接复用 savedId
    if (savedId && !silent) {
      setConfirmedWear(true);
      showToast('已保存到穿搭记录');
      return savedId;
    }
    if (!silent) setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('登录已过期，请重新登录后再保存');
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
      if (!silent) {
        setConfirmedWear(true);
        showToast('已保存到穿搭记录');
      }
      if (user?.id) refreshCounts(user.id);
      return outfitId;
    } catch (e: any) {
      showToast(`保存失败：${e.message}`);
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleFavorite = async () => {
    if (!currentOutfit || !user) return;
    try { track('outfit_action', { outfit_id: savedId ?? `temp_${currentIndex}`, action: 'like' }); } catch {}
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('登录已过期，请重新登录后再操作');
      return;
    }
    if (isFavorited) {
      await supabase.from('outfit_favorites').delete()
        .eq('user_id', user.id)
        .eq('outfit_id', savedId ?? currentOutfit.outfit_id);
      setIsFavorited(false);
      showToast('已取消收藏');
      if (user?.id) refreshCounts(user.id);
    } else {
      // Save outfit first if not saved, get real DB outfit_id (silent — don't change button or show guide)
      let outfitId = savedId;
      if (!outfitId) {
        outfitId = await handleWear(true);
        if (!outfitId) return;
      }
      const { error: favError } = await supabase.from('outfit_favorites').insert({
        user_id: user.id, outfit_id: outfitId,
      });
      if (favError) console.warn('[handleFavorite] insert error:', favError.message);
      setIsFavorited(true);
      showToast('已收藏');
      if (user?.id) refreshCounts(user.id);
    }
  };

  // 探索确认：试穿页通过 `items`(JSON) 读取搭配单品（name/category/color/image_url）。
  // 这里把已有单品 + 推荐补位单品一起传过去，试穿看完整 look。
  const handleGoTryOn = () => {
    if (!currentOutfit) return;
    try { track('outfit_action', { outfit_id: savedId ?? `temp_${currentIndex}`, action: 'try_on' }); } catch {}
    const tryOnItems = [
      ...(currentOutfit.items ?? []).map(i => buildTryOnItemBrief({
        name: i.item?.name ?? '单品',
        category: i.item?.category ?? '',
        color: i.item?.color ?? '',
        material: i.item?.material,
        sleeve_length: i.item?.sleeve_length,
        fit_type: i.item?.fit_type,
        image_url: i.item?.image_url,
        ai_recognized_attrs: i.item?.ai_recognized_attrs,
      })),
      ...(currentOutfit.recommended_items ?? []).map((r) => buildTryOnItemBrief({
        name: r.name,
        category: r.category,
        color: r.color,
        description: r.description,
        image_url: r.image_url,
      })),
    ];
    router.push({ pathname: '/outfit/try-on', params: { items: JSON.stringify(tryOnItems) } });
  };

  const handleSwap = () => {
    exitReasonRef.current = 'regenerate';
    try { track('outfit_action', { outfit_id: savedId ?? `temp_${currentIndex}`, action: 'regenerate' }); } catch {}
    if (outfits.length <= 1) {
      void generateOutfits({ keepCurrentOnFallback: true });
      return;
    }
    setCurrentIndex((currentIndex + 1) % outfits.length);
    setSavedId(null);
    setIsFavorited(false);
    setAdjustMode(false);
  };

  const handleAdjustToggle = () => {
    if (!adjustMode) {
      exitReasonRef.current = 'change_item';
      try { track('outfit_action', { outfit_id: savedId ?? `temp_${currentIndex}`, action: 'change_item' }); } catch {}
    }
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
    if (addingRecIdx !== null) return;
    if (!user?.id) { showToast('请先登录后再添加'); return; }
    setAddingRecIdx(idx);
    try {
      const { addItem } = useWardrobeStore.getState();
      const saved = await addItem({
        user_id: user.id, name: rec.name, category: WARDROBE_DB_CAT[toCatConcept(rec.category)] as ClothingCategory,
        color: rec.color || '', source_type: 'manual',
        source_label: 'AI推荐添加', status: 'active',
        image_url: rec.image_url || undefined,
      });
      if (!saved) {
        const err = useWardrobeStore.getState().error;
        console.warn('[addRecommendedToWardrobe] addItem returned null:', err);
        showToast(err ? `添加失败：${err}` : '添加失败，请稍后重试');
        return;
      }
      setOutfits(prev => prev.map((o, i) => {
        if (i !== currentIndex) return o;
        const newItems = [
          ...(o.items ?? []),
          {
            item_id: saved.item_id,
            outfit_id: o.outfit_id,
            role: rec.role,
            display_order: (o.items ?? []).length,
            item: saved,
          },
        ];
        return { ...o, items: newItems, recommended_items: o.recommended_items?.filter((_, ri) => ri !== idx) };
      }));
      await fetchItems(user.id);
      showToast(`「${rec.name}」已添加到衣橱`);
    } catch (e: any) {
      console.warn('[addRecommendedToWardrobe] error:', e?.message);
      showToast('添加失败，请稍后重试');
    } finally {
      setAddingRecIdx(null);
    }
  };

  const addRecommendedToWishlist = async (rec: RecommendedItem, idx: number) => {
    if (!user?.id) { showToast('请先登录后再添加'); return; }
    // 复用 wishlistStore 的加入心愿单逻辑（内部会归一化 category 到 DB 允许值）
    const saved = await useWishlistStore.getState().addItem({
      user_id: user.id,
      name: rec.name,
      category: rec.category,
      color: rec.color || '',
      image_url: rec.image_url,
      description: rec.description,
      source: 'ai_recommended',
    });
    if (!saved) {
      const err = useWishlistStore.getState().error;
      console.warn('[addRecommendedToWishlist] error:', err);
      showToast(err ? `加入心愿单失败：${err}` : '加入心愿单失败，请稍后重试');
      return;
    }
    setWishlistedRecs(prev => new Set(prev).add(idx));
    showToast('已加入心愿单');
  };

  const allCanvasItems: OutfitCanvasLayoutItem[] = currentOutfit
    ? [
        ...(currentOutfit.items ?? []).map(oi => {
          const metrics = outfitImageMetricsForWardrobeItem(oi.item);
          return {
            id: oi.item_id, name: oi.item?.name ?? oi.item?.category ?? '',
            category: oi.item?.category ?? '', imageUri: oi.item?.image_url, owned: true, layoutRole: oi.role,
            imageAspectRatio: metrics?.sourceAspectRatio,
            visibleBounds: metrics?.visibleBounds,
          };
        }),
        ...(currentOutfit.recommended_items ?? []).map((rec, idx) => ({
          id: `rec_${idx}`, name: rec.name, category: rec.category,
          imageUri: rec.image_url, owned: false, layoutRole: rec.role,
        })),
      ]
    : [];

  const ownedItems = currentOutfit?.items ?? [];
  const recommendedItems = currentOutfit?.recommended_items ?? [];

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <AILoading
          title="AI 正在为你搭配"
          subtitle="正在生成专属搭配方案..."
          steps={['理解你的需求', '分析衣橱单品', '匹配风格与场景', '生成专属搭配方案']}
          durationMs={9000}
          hint={quota ? `今日剩余 ${quota.remaining}/${quota.limit} 次` : undefined}
        />
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
            onPress={() => { setShowAddSheet(true); }}>
            <Text style={styles.addWardrobeBtnText}>去添加衣物</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StyleeNavigationBar
        title="推荐方案"
        onBack={() => router.back()}
        trailingLabel="收藏此搭配"
        trailingSelected={isFavorited}
        onTrailingPress={handleFavorite}
      />

      {aiMeta && <AIResultBanner {...aiMeta} />}
      <ScrollView contentContainerStyle={styles.content}>
        {/* Weather & Context */}
        <View style={styles.contextRow}>
          <Text style={styles.contextText}>{params.weather} {params.temp}°C · {params.city}</Text>
          {params.query ? <Text style={styles.queryText}>「{params.query}」</Text> : null}
        </View>

        {/* Existing transparent garment masters are composed client-side; no image generation call. */}
        <StyleeOutfitCanvas
          items={allCanvasItems}
          accessibilityLabel={`${currentOutfit.name || '推荐方案'}，${allCanvasItems.length}件单品`}
          onItemPress={adjustMode ? (canvasItem) => {
            const owned = currentOutfit.items?.find((item) => item.item_id === canvasItem.id);
            if (owned) handleItemTap(owned);
          } : undefined}
          selectedItemId={swapTarget?.item_id}
        />

        {/* ── 2. 搭配单品（已有 + 推荐合并） ── */}
        {(ownedItems.length > 0 || recommendedItems.length > 0) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>搭配单品</Text>
            <Text style={styles.comboSub}>
              {recommendedItems.length === 0
                ? `${ownedItems.length} 件全部来自你的衣橱`
                : `${ownedItems.length} 件来自你的衣橱 · ${recommendedItems.length} 件推荐补齐`}
            </Text>
            <View style={styles.grid}>
              {ownedItems.map((oi) => (
                <StyleeOutfitItemCard
                  key={oi.item_id}
                  name={oi.item?.name ?? oi.item?.category ?? '衣橱单品'}
                  ownership="owned"
                  showOwnership={recommendedItems.length > 0}
                  adjustMode={adjustMode}
                  onPress={() => handleItemTap(oi)}
                  imageUri={oi.item?.image_url}
                  mediaTone="owned"
                  media={<CategoryIcon category={oi.item?.category ?? ''} size={26} color={ds.color.semantic.text.tertiary} />}
                />
              ))}
              {recommendedItems.map((rec, idx) => {
                const isWishlisted = wishlistedRecs.has(idx);
                const recKey = `${rec.name}-${rec.category}-${rec.color}-${rec.image_url ?? ''}`;
                return (
                  <StyleeOutfitItemCard
                    key={recKey}
                    name={rec.name}
                    ownership="missing"
                    loading={addingRecIdx === idx}
                    imageUri={rec.image_url}
                    mediaTone="recommended"
                    onPress={adjustMode ? undefined : () => router.push({
                      pathname: '/wardrobe/[id]',
                      params: { id: `rec_${rec.name}`, itemData: JSON.stringify(rec) },
                    })}
                    media={<CategoryIcon category={rec.category} size={26} color={ds.color.semantic.text.tertiary} />}
                    actions={
                      <>
                        <TouchableOpacity style={styles.recAddBtn} activeOpacity={0.7}
                          disabled={addingRecIdx !== null}
                          onPress={() => addRecommendedToWardrobe(rec, idx)}>
                          <Text style={styles.recAddBtnText}>{addingRecIdx === idx ? '添加中…' : '+衣橱'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.recWishBtn, isWishlisted && styles.recWishBtnDone]}
                          activeOpacity={0.7}
                          onPress={() => !isWishlisted && addRecommendedToWishlist(rec, idx)}
                          disabled={isWishlisted}
                        >
                          <Text style={[styles.recWishBtnText, isWishlisted && styles.recWishBtnTextDone]}>
                            {isWishlisted ? '已加入' : '+心愿单'}
                          </Text>
                        </TouchableOpacity>
                      </>
                    }
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {/* All owned hint */}
        {recommendedItems.length === 0 && ownedItems.length > 0 ? (
          <StyleeInlineStatus tone="positive">
            单品已齐，可以直接试穿
          </StyleeInlineStatus>
        ) : null}

        {/* ── Try-on Button ── */}
        <StyleeButton
          label="AI 试穿看看"
          hierarchy="secondary"
          size="medium"
          onPress={handleGoTryOn}
          leadingIcon={<Ionicons name="person-outline" size={18} color={ds.color.semantic.text.primary} />}
          trailingIcon={<Feather name="chevron-right" size={16} color={ds.color.semantic.text.primary} />}
        />
      </ScrollView>

      {/* ── 5. Decision Bar ── */}
      <StyleeStickyDecisionBar
        primaryLabel={confirmedWear ? '已保存' : '就这么穿'}
        onPrimaryPress={() => { void handleWear(); }}
        state={saving ? 'saving' : confirmedWear ? 'saved' : 'default'}
        secondaryActions={[
          { label: '换一套看看', onPress: handleSwap },
          { label: adjustMode ? '完成调整' : '稍作调整', onPress: handleAdjustToggle },
        ]}
      />

      {/* Swap Modal */}
      {isWeb ? (
        swapTarget ? (
          <View style={styles.webLayer}>
            <TouchableOpacity style={styles.modalBackdrop} onPress={() => setSwapTarget(null)} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>替换{swapTarget?.item?.category ?? ''}</Text>
                <TouchableOpacity onPress={() => setSwapTarget(null)}>
                  <View style={styles.modalCloseBtn}>
                    <Feather name="x-circle" size={16} color={Colors.terracotta} />
                    <Text style={styles.modalClose}>取消</Text>
                  </View>
                </TouchableOpacity>
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
                        <View style={[styles.swapOptionImage, styles.garmentMediaClip]}>
                          <StyleeGarmentMedia imageUri={item.image_url} tone="owned" />
                        </View>
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
          </View>
        ) : null
      ) : (
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
                      <View style={[styles.swapOptionImage, styles.garmentMediaClip]}>
                        <StyleeGarmentMedia imageUri={item.image_url} tone="owned" />
                      </View>
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
      )}

      <Toast message={toast} visible={!!toast} />

      <AddClothingSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper, position: 'relative' },
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
  },

  loadingOverlay: { flex: 1, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  loadingCard: { width: '100%', maxWidth: 340, backgroundColor: Colors.paperCard, borderRadius: Radius.xl, padding: Spacing.five, alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderColor: Colors.line },
  loadingIconView: { marginBottom: Spacing.one },
  loadingTitle: { ...T.storyTitle, fontSize: 22 },
  loadingStep: { ...T.bodyText, textAlign: 'center', color: Colors.walnut2 },
  progressBarBg: { width: '100%', height: 6, backgroundColor: Colors.line, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.one },
  progressBarFill: { height: '100%', backgroundColor: Colors.terracotta, borderRadius: 3 },
  quotaHint: { ...T.micro, color: Colors.walnut2, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: 1, borderBottomColor: Colors.line, backgroundColor: Colors.paperRaised },
  back: { ...T.buttonSecondary, color: Colors.ink, fontFamily: Fonts.uiSemiBold },
  headerTitle: { fontSize: 17, fontFamily: Fonts.titleSerif, color: Colors.ink },
  headerIdx: { color: Colors.terracotta },
  headerTotal: { color: Colors.walnut2 },
  favBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  favIcon: { fontSize: 18, color: Colors.walnut2 },
  favIconActive: { color: Colors.accent },
  favLabel: { fontSize: 12, color: Colors.walnut2, fontFamily: Fonts.ui },
  favLabelActive: { color: Colors.accent },

  content: {
    padding: ds.layout.screenPaddingCompact,
    gap: ds.space[3],
    paddingBottom: ds.space[6],
  },
  contextRow: { gap: 2 },
  contextText: { ...T.caption, fontSize: 13, letterSpacing: 0.78 },
  queryText: { ...T.itemDesc, color: Colors.walnut },

  dotIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.line },
  dotActive: { width: 20, borderRadius: 4, backgroundColor: Colors.terracotta },

  section: { gap: ds.space[2], marginTop: ds.space[3] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 13, color: Colors.ink },
  sectionSubOwned: { ...T.micro, color: Colors.sage },
  sectionSubRec: { ...T.micro, color: Colors.terracotta },

  itemsRow: { flexDirection: 'row', gap: 10, paddingVertical: Spacing.one },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, backgroundColor: Colors.paperCard, borderRadius: Radius.md, minWidth: 140, ...Shadow.one, position: 'relative' },
  itemCardAdjust: { opacity: 0.85 },
  itemCardRecommended: { backgroundColor: Colors.accentSoft },
  itemThumbSmall: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  itemThumbImg: { width: '100%', height: '100%', borderRadius: 10 },
  itemThumbPlaceholder: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center' },
  itemCardInfo: { flexDirection: 'column', flex: 1 },
  itemCardName: { fontFamily: Fonts.ui, fontSize: 12, color: Colors.ink },
  itemCardOwned: { fontSize: 10, color: Colors.sage, marginTop: 1 },
  addToWardrobeBtn: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.ink, alignSelf: 'flex-start' },
  addToWardrobeBtnText: { color: '#fff', fontSize: 11, fontFamily: Fonts.uiSemiBold },
  wishlistBtn: { marginTop: 2, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.terracotta, alignSelf: 'flex-start' },
  wishlistBtnDone: { borderColor: Colors.line, backgroundColor: Colors.paperCard },
  wishlistBtnText: { fontSize: 10, color: Colors.terracotta, fontFamily: Fonts.ui },
  wishlistBtnTextDone: { fontSize: 10, color: Colors.walnut2 },
  swapBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: Colors.terracotta, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  recBadge: { position: 'absolute', top: -6, right: -4, backgroundColor: Colors.terracotta, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  recBadgeText: { color: '#fff', fontSize: 9, fontFamily: Fonts.uiSemiBold },

  // 合并后的搭配单品网格
  comboSub: { ...T.micro, color: Colors.walnut, marginBottom: Spacing.one },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: ds.component.outfitItemCard.gap,
  },
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
  gridName: { fontFamily: Fonts.ui, fontSize: 12, color: Colors.ink, textAlign: 'center', marginTop: 4 },
  badgeOwned: { position: 'absolute', top: 6, right: 8, zIndex: 2, fontSize: 10, color: Colors.walnut2 },
  badgeRec: { position: 'absolute', top: 6, right: 8, zIndex: 2, fontSize: 10, color: Colors.terracotta, fontFamily: Fonts.uiSemiBold },
  recBtnCol: { flexDirection: 'row', marginTop: 4, gap: 4 },
  recAddBtn: { flex: 1, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.ink, alignItems: 'center' },
  recAddBtnText: { color: '#fff', fontSize: 10, fontFamily: Fonts.uiSemiBold },
  recWishBtn: { flex: 1, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.paper, alignItems: 'center' },
  recWishBtnDone: { borderColor: Colors.line, backgroundColor: Colors.paperCard },
  recWishBtnText: { fontSize: 10, color: Colors.ink, fontFamily: Fonts.ui },
  recWishBtnTextDone: { fontSize: 10, color: Colors.walnut2 },

  allOwnedHint: { backgroundColor: Colors.signalSoft, borderRadius: Radius.md, padding: Spacing.three, alignItems: 'center' },
  allOwnedText: { ...T.bodyText, color: Colors.sage, fontSize: 13 },

  aiCommentCard: { marginHorizontal: Spacing.two, padding: Spacing.three, backgroundColor: Colors.paperRaised, borderRadius: 14, ...Shadow.two, position: 'relative', marginTop: Spacing.one },
  tryOnEntry: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.two, paddingVertical: Spacing.two + 4,
    backgroundColor: Colors.signalSoft, borderRadius: Radius.md, gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.lineStrong,
  },
  tryOnEntryText: { ...T.bodyText, fontSize: 14, color: Colors.ink, fontFamily: Fonts.uiSemiBold },
  aiBadge: { position: 'absolute', top: -8, left: 14, backgroundColor: Colors.ink, paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 6 },
  aiBadgeText: { color: '#fff', fontSize: 10, fontFamily: Fonts.uiSemiBold },
  aiCommentText: { fontSize: 13, lineHeight: 22, color: Colors.gray1, marginTop: Spacing.one },

  decisionBar: { gap: 8, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, backgroundColor: Colors.paperRaised, borderTopWidth: 1, borderTopColor: Colors.line },
  decisionBtnRow: { flexDirection: 'row', gap: 8 },
  decisionBtnSecondary: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.paperCard },
  decisionBtnAdjustText: { fontSize: 13, fontFamily: Fonts.uiSemiBold, color: Colors.walnut },
  decisionBtnSwapText: { fontSize: 13, fontFamily: Fonts.uiSemiBold, color: Colors.ink },
  decisionBtnConfirm: { paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.ink, ...Shadow.two },
  decisionBtnSaved: { backgroundColor: Colors.sage },
  decisionBtnConfirmText: { fontSize: 14, fontFamily: Fonts.uiSemiBold, color: Colors.paper },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: { backgroundColor: Colors.paper, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '60%', ...Shadow.three },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.line },
  modalTitle: { ...T.subTitle },
  modalCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalClose: { ...T.buttonSecondary, color: Colors.terracotta },
  modalEmpty: { padding: Spacing.five, alignItems: 'center' },
  modalEmptyText: { ...T.emptyTitle, fontSize: 14, textAlign: 'center', lineHeight: 24 },
  swapGrid: { padding: Spacing.three, gap: Spacing.two },
  swapOption: { flex: 1, margin: Spacing.one, alignItems: 'center', gap: 4 },
  swapOptionImage: { width: '100%', aspectRatio: 1, borderRadius: Radius.md },
  garmentMediaClip: { overflow: 'hidden' },
  swapOptionPlaceholder: { width: '100%', aspectRatio: 1, borderRadius: Radius.md, backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center' },
  swapOptionName: { ...T.micro, textAlign: 'center' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  emptyTitle: { ...T.emptyTitle, fontSize: 20 },
  emptySubtitle: { ...T.itemDesc, textAlign: 'center', lineHeight: 22 },
  addWardrobeBtn: { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 4, marginTop: Spacing.two },
  addWardrobeBtnText: { ...T.buttonPrimary, color: Colors.paper },
});
