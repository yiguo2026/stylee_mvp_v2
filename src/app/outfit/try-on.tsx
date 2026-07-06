import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, ActivityIndicator, Alert, Image, Platform, useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, Shadow, T, Fonts } from '@/constants/theme';
import { CategoryIcon } from '@/components/CategoryIcon';
import { AIResultBanner } from '@/components/AIResultBanner';
import { AILoading } from '@/components/AILoading';
import { AIMeta, aiGenerateTryOnImage, aiGenerateTryOnSuggestion, TryOnSuggestion } from '@/lib/ai';
import { useTryOnStore } from '@/stores/tryonStore';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { consumeQuota, getQuota } from '@/lib/dailyQuota';

const isWeb = Platform.OS === 'web';

const TRYON_SCENES = [
  { id: 'cafe', label: '咖啡馆' },
  { id: 'street', label: '街道' },
  { id: 'office', label: '办公室' },
  { id: 'park', label: '公园' },
  { id: 'home', label: '居家' },
];

const SCENE_IMAGES: Record<string, any> = {
  casual: require('../../../assets/tryon/casual.png'),
  street: require('../../../assets/tryon/street.png'),
  office: require('../../../assets/tryon/office.png'),
  layered: require('../../../assets/tryon/layered.png'),
  home: require('../../../assets/tryon/home.png'),
};

const SCENE_ASSET_MAP: Record<string, string> = {
  cafe: 'casual', street: 'street', office: 'office', park: 'layered', home: 'home',
};

type OutfitSummary = {
  outfit_id: string;
  name: string;
  created_at: string;
  items: { name: string; category: string; image_url?: string }[];
};

export default function TryOnScreen() {
  const { width: winW, height: winH } = useWindowDimensions();

  const { items: itemsParam } = useLocalSearchParams<{ items?: string; outfitId?: string }>();
  const isFromResult = !!itemsParam;

  const { selfieUri, selectedScene, setSelectedScene, addRecord, loadSelfieFromServer, loaded } = useTryOnStore();
  const { user } = useUserStore();

  // Outfit selection (for home entry)
  const [activeTab, setActiveTab] = useState<'worn' | 'fav'>('worn');
  const [wornOutfits, setWornOutfits] = useState<OutfitSummary[]>([]);
  const [favOutfits, setFavOutfits] = useState<OutfitSummary[]>([]);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [loadingOutfits, setLoadingOutfits] = useState(false);

  // Items from result entry
  const [resultItems, setResultItems] = useState<any[]>([]);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [, setGenStep] = useState(0);
  const [tryOnImage, setTryOnImage] = useState<string | number | null>(null);
  const [tryOnMeta, setTryOnMeta] = useState<AIMeta | null>(null);
  const [tryOnSuggestion, setTryOnSuggestion] = useState<TryOnSuggestion | null>(null);

  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  // Load outfit items from result
  useEffect(() => {
    if (itemsParam) {
      try { setResultItems(JSON.parse(itemsParam)); } catch {}
    }
  }, [itemsParam]);

  useEffect(() => {
    if (!user?.id) return;
    getQuota(user.id, 'tryon').then(q => setQuota({ used: q.used, limit: q.limit, remaining: q.remaining }));
    if (!loaded) loadSelfieFromServer(user.id);
  }, [user?.id]);

  const loadOutfits = useCallback(async () => {
    if (!user?.id) return;
    setLoadingOutfits(true);
    try {
      // Worn outfits
      const { data: worn } = await supabase
        .from('outfits')
        .select(`outfit_id, name, created_at, outfit_items(item_id, display_order, wardrobe_items(name, category, image_url))`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (worn) {
        setWornOutfits(worn.map((o: any) => ({
          outfit_id: o.outfit_id,
          name: o.name || '未命名搭配',
          created_at: o.created_at,
          items: (o.outfit_items ?? []).map((oi: any) => ({
            name: oi.wardrobe_items?.name ?? '单品',
            category: oi.wardrobe_items?.category ?? '',
            image_url: oi.wardrobe_items?.image_url,
          })),
        })));
      }

      // Favorited outfits
      const { data: favs } = await supabase
        .from('outfit_favorites')
        .select(`outfit_id, outfits(name, created_at, outfit_items(item_id, display_order, wardrobe_items(name, category, image_url)))`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (favs) {
        setFavOutfits(favs.filter((f: any) => f.outfits).map((f: any) => ({
          outfit_id: f.outfit_id,
          name: f.outfits?.name || '未命名搭配',
          created_at: f.outfits?.created_at ?? '',
          items: (f.outfits?.outfit_items ?? []).map((oi: any) => ({
            name: oi.wardrobe_items?.name ?? '单品',
            category: oi.wardrobe_items?.category ?? '',
            image_url: oi.wardrobe_items?.image_url,
          })),
        })));
      }
    } catch (e) {
      console.warn('[TryOn] load outfits failed:', e);
    }
    setLoadingOutfits(false);
  }, [user?.id]);

  // Load outfits from Supabase (for home entry)
  useEffect(() => {
    if (!isFromResult && user?.id) void loadOutfits();
  }, [isFromResult, user?.id, loadOutfits]);

  const currentOutfits = activeTab === 'worn' ? wornOutfits : favOutfits;

  const canGenerate = selfieUri && (isFromResult ? resultItems.length > 0 : !!selectedOutfitId);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (!user?.id) {
      Alert.alert('提示', '请先登录后再使用 AI 试穿');
      return;
    }

    const q = await consumeQuota(user.id, 'tryon');
    setQuota({ used: q.used, limit: q.limit, remaining: q.remaining });
    if (!q.ok) {
      Alert.alert('今日试穿次数已用完', `AI 试穿每日 ${q.limit} 次，明天再来`);
      return;
    }

    setGenerating(true);
    setTryOnImage(null);
    setTryOnMeta(null);
    setTryOnSuggestion(null);
    setGenStep(0);

    // Collect outfit items as ItemBrief[]
    const items = isFromResult
      ? resultItems.map(i => ({ name: i.name ?? '', category: i.category ?? '上装' as const, color: i.color ?? '' }))
      : (currentOutfits.find(o => o.outfit_id === selectedOutfitId)?.items ?? []).map(i => ({ name: i.name ?? '', category: i.category ?? '上装' as const, color: '' }));

    const bodyShape = undefined; // TODO: extract from selfieUri / user profile

    setGenStep(0); // "分析搭配单品..."
    await new Promise(r => setTimeout(r, 300));

    setGenStep(1); // "生成试穿效果图..."

    // Call both AI functions in parallel, pass selfie for face reference
    const [imageResult, suggestionResult] = await Promise.all([
      aiGenerateTryOnImage(items, bodyShape, selectedScene, selfieUri),
      aiGenerateTryOnSuggestion(items, bodyShape),
    ]);

    setGenStep(2); // "优化画面细节..."
    await new Promise(r => setTimeout(r, 200));

    setGenStep(3); // "完成"

    // Image: use AI URL if available, otherwise fall back to local asset
    if (imageResult.url) {
      setTryOnImage(imageResult.url);
    } else {
      const assetKey = SCENE_ASSET_MAP[selectedScene] ?? 'casual';
      setTryOnImage(SCENE_IMAGES[assetKey] || SCENE_IMAGES.casual);
    }

    // Suggestion
    setTryOnSuggestion(suggestionResult.suggestion);

    // Meta: combine image + suggestion results
    const anyOk = imageResult.meta.ok || suggestionResult.meta.ok;
    const sources: string[] = [];
    if (imageResult.meta.source !== 'mock') sources.push(imageResult.meta.source);
    if (suggestionResult.meta.source !== 'mock' && !sources.includes(suggestionResult.meta.source)) sources.push(suggestionResult.meta.source);
    setTryOnMeta({
      source: sources.length > 0 ? sources.join(' + ') : 'mock',
      durationMs: Math.max(imageResult.meta.durationMs, suggestionResult.meta.durationMs),
      ok: anyOk,
    });

    setGenerating(false);

    // Save try-on record
    const sceneObj = TRYON_SCENES.find(s => s.id === selectedScene);
    const outfitName = isFromResult
      ? resultItems.map(i => i.name).join(' + ')
      : (currentOutfits.find(o => o.outfit_id === selectedOutfitId)?.name ?? '自定义搭配');
    const recordItems = isFromResult
      ? resultItems.map(i => ({ name: i.name, category: i.category ?? '', color: i.color, image_url: i.image_url }))
      : (currentOutfits.find(o => o.outfit_id === selectedOutfitId)?.items ?? []);
    const resultImageUrl = typeof tryOnImage === 'string' ? tryOnImage : null;
    if (user?.id) {
      addRecord({
        scene: selectedScene,
        sceneLabel: sceneObj?.label ?? selectedScene,
        outfitName,
        items: recordItems,
        selfieUri,
        resultImageUrl,
        suggestion: tryOnSuggestion,
      }, user.id);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI 试穿</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Section 1: Body Info ── */}
        <TouchableOpacity style={styles.bodyInfoCard} onPress={() => router.push('/outfit/try-on-body')} activeOpacity={0.7}>
          <View style={styles.bodyInfoThumb}>
            {selfieUri ? (
              <Image source={{ uri: selfieUri }} style={styles.bodyInfoThumbImg} resizeMode="cover" />
            ) : (
              <Text style={styles.bodyInfoEmoji}>🧍</Text>
            )}
          </View>
          <View style={styles.bodyInfoText}>
            <Text style={styles.bodyInfoTitle}>
              {selfieUri ? '身体信息已录入' : '身体信息'}
            </Text>
            <Text style={styles.bodyInfoSub}>
              {selfieUri ? '点击修改自拍照片' : '点击录入（首次需要）'}
            </Text>
          </View>
          <Text style={styles.bodyInfoArrow}>编辑 ›</Text>
        </TouchableOpacity>

        {/* ── Section 2: Outfit Selection ── */}
        {isFromResult ? (
          // From result: show items list
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>搭配单品</Text>
            {resultItems.length === 0 ? (
              <Text style={styles.emptyText}>暂无搭配单品</Text>
            ) : (
              <View style={styles.itemsList}>
                {resultItems.map((item) => (
                  <View key={item.item_id ?? `${item.name}-${item.category}-${item.color}-${item.image_url ?? ''}`} style={styles.itemRow}>
                    <View style={styles.itemIcon}>
                      {item.image_url
                        ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
                        : <CategoryIcon category={item.category} size={24} color={Colors.walnut2} />
                      }
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>{item.color} · {item.category}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          // From home: outfit tabs + grid
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>选择搭配方案</Text>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'worn' && styles.tabActive]}
                onPress={() => { setActiveTab('worn'); setSelectedOutfitId(null); }}
              >
                <Text style={[styles.tabText, activeTab === 'worn' && styles.tabTextActive]}>已穿搭配</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'fav' && styles.tabActive]}
                onPress={() => { setActiveTab('fav'); setSelectedOutfitId(null); }}
              >
                <Text style={[styles.tabText, activeTab === 'fav' && styles.tabTextActive]}>收藏搭配</Text>
              </TouchableOpacity>
            </View>

            {loadingOutfits ? (
              <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.three }} />
            ) : currentOutfits.length === 0 ? (
              <View style={styles.emptyOutfits}>
                <Text style={styles.emptyOutfitText}>
                  {activeTab === 'worn' ? '还没有穿搭记录，先去首页生成搭配吧' : '还没有收藏搭配'}
                </Text>
              </View>
            ) : (
              <View style={styles.outfitGrid}>
                {currentOutfits.map(outfit => {
                  const isSelected = selectedOutfitId === outfit.outfit_id;
                  return (
                    <TouchableOpacity
                      key={outfit.outfit_id}
                      style={[styles.outfitCard, isSelected && styles.outfitCardSelected]}
                      onPress={() => setSelectedOutfitId(isSelected ? null : outfit.outfit_id)}
                      activeOpacity={0.7}
                    >
                      {/* Thumbnail: first item image or collage */}
                      <View style={styles.outfitThumb}>
                        {outfit.items[0]?.image_url ? (
                          <Image source={{ uri: outfit.items[0].image_url }} style={styles.outfitThumbImg} resizeMode="cover" />
                        ) : (
                          <View style={styles.outfitThumbPlaceholder}>
                            <CategoryIcon category={outfit.items[0]?.category ?? ''} size={28} color={Colors.walnut2} />
                          </View>
                        )}
                        {outfit.items.length > 1 ? (
                          <View style={styles.outfitCount}>
                            <Text style={styles.outfitCountText}>{outfit.items.length}件</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.outfitName} numberOfLines={1}>{outfit.name}</Text>
                      <Text style={styles.outfitItems} numberOfLines={1}>
                        {outfit.items.map(i => i.name).join(' · ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Section 3: Scene Selection ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>选择场景风格</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneScroll}>
            {TRYON_SCENES.map(scene => {
              const isSelected = selectedScene === scene.id;
              return (
                <TouchableOpacity
                  key={scene.id}
                  style={[styles.sceneOpt, isSelected && styles.sceneOptSelected]}
                  onPress={() => setSelectedScene(scene.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sceneLabel, isSelected && styles.sceneLabelSelected]}>{scene.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Generate Button ── */}
        <TouchableOpacity
          style={[styles.generateBtn, (!canGenerate || generating) && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={!canGenerate || generating}
        >
          {generating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator color={Colors.paper} size="small" />
              <Text style={styles.generateBtnText}>生成中…</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>生成试穿效果图</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.generateHint}>AI 将结合身体信息 + 搭配方案 + 场景氛围生成效果图</Text>
        {quota ? (
          <Text style={styles.quotaHint}>今日剩余 {quota.remaining}/{quota.limit} 次</Text>
        ) : null}

        {/* ── Result ── */}
        {tryOnMeta && <AIResultBanner {...tryOnMeta} />}
        {tryOnImage !== null && !generating ? (
          <View style={styles.resultCard}>
            <Image
              source={typeof tryOnImage === 'string' ? { uri: tryOnImage } : tryOnImage}
              style={[styles.resultImage, { height: Math.min(winH * 0.62, winW * 1.2) }]}
              resizeMode="contain"
            />
            <View style={styles.resultFooter}>
              <Text style={styles.resultCaption}>AI 试穿效果预览</Text>
              <TouchableOpacity style={styles.resultSaveBtn} onPress={() => {
                if (isWeb) { window.alert('图片已保存'); } else { Alert.alert('提示', '图片已保存到相册'); }
              }}>
                <Text style={styles.resultSaveBtnText}>保存图片</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {tryOnSuggestion && !generating ? (
          <View style={styles.suggestionCard}>
            <View style={styles.scoreRow}>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreNum}>{tryOnSuggestion.compatibility_score}</Text>
              </View>
              <Text style={styles.scoreLabel}>搭配契合度</Text>
            </View>
            <Text style={styles.suggestionText}>{tryOnSuggestion.suggestion}</Text>
            {tryOnSuggestion.tips.length > 0 ? (
              <View style={styles.tipsList}>
                {tryOnSuggestion.tips.map((tip, idx) => (
                  <View key={idx} style={styles.tipRow}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Generating Full Screen Overlay ── */}
      {generating ? (
        <View style={styles.generatingOverlay}>
          <AILoading
            title="AI 正在生成试穿效果"
            subtitle="正在合成你的专属试穿图..."
            steps={['分析身体数据', '匹配穿搭单品', '合成试穿效果', '优化画面细节']}
            durationMs={14000}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back: { ...T.bodyText, color: Colors.ink, width: 60 },
  title: { ...T.sectionTitle },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  // ── Body Info Card ──
  bodyInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three,
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  bodyInfoThumb: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  bodyInfoThumbImg: { width: 48, height: 48, borderRadius: 24 },
  bodyInfoEmoji: { fontSize: 24 },
  bodyInfoText: { flex: 1, gap: 2 },
  bodyInfoTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, color: Colors.ink, fontSize: 15 },
  bodyInfoSub: { ...T.micro, color: Colors.walnut2 },
  bodyInfoArrow: { ...T.tag, color: Colors.walnut2 },

  // ── Section ──
  section: { gap: Spacing.two },
  sectionTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 15, color: Colors.ink },
  emptyText: { ...T.bodyText, color: Colors.walnut2, textAlign: 'center', paddingVertical: Spacing.three },

  // ── Items List (from result) ──
  itemsList: { gap: Spacing.two },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    padding: Spacing.two + 2, ...Shadow.one,
  },
  itemIcon: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  itemImage: { width: 48, height: 48, borderRadius: Radius.md },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { ...T.itemName },
  itemMeta: { ...T.micro },

  // ── Outfit Tabs ──
  tabRow: { flexDirection: 'row', gap: Spacing.two },
  tab: {
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two - 2,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
  },
  tabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  tabText: { ...T.tag, color: Colors.ink },
  tabTextActive: { ...T.tag, color: Colors.paper },

  // ── Outfit Grid ──
  outfitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  outfitCard: {
    width: '48%', backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    overflow: 'hidden', ...Shadow.one,
  },
  outfitCardSelected: { borderColor: Colors.ink, borderWidth: 2 },
  outfitThumb: {
    width: '100%', aspectRatio: 3 / 4, backgroundColor: Colors.paperCard,
    position: 'relative',
  },
  outfitThumbImg: { width: '100%', height: '100%' },
  outfitThumbPlaceholder: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
  },
  outfitThumbEmoji: { fontSize: 36 },
  outfitCount: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  outfitCountText: { ...T.micro, color: Colors.paper, fontSize: 10 },
  outfitName: { ...T.bodyText, fontSize: 13, fontFamily: Fonts.uiSemiBold, color: Colors.ink, paddingHorizontal: Spacing.two, paddingTop: Spacing.two },
  outfitItems: { ...T.micro, paddingHorizontal: Spacing.two, paddingBottom: Spacing.two },

  emptyOutfits: { paddingVertical: Spacing.four, alignItems: 'center' },
  emptyOutfitText: { ...T.bodyText, color: Colors.walnut2, textAlign: 'center', fontSize: 13 },

  // ── Scene Selection ──
  sceneScroll: { gap: Spacing.two, paddingRight: Spacing.three },
  sceneOpt: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
    borderRadius: 10, backgroundColor: Colors.paper,
    borderWidth: 1, borderColor: Colors.lineStrong, minWidth: 72, gap: 4,
  },
  sceneOptSelected: { borderColor: Colors.ink, backgroundColor: Colors.signalSoft },
  sceneEmoji: { fontSize: 24 },
  sceneLabel: { ...T.micro, color: Colors.walnut },
  sceneLabelSelected: { color: Colors.ink, fontFamily: Fonts.uiSemiBold },

  // ── Generate Button ──
  generateBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 6, alignItems: 'center', marginTop: Spacing.two,
  },
  generateBtnDisabled: { opacity: 0.4 },
  generateBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 16 },
  generateHint: { ...T.micro, textAlign: 'center', color: Colors.walnut2, marginTop: Spacing.one },
  quotaHint: { ...T.micro, textAlign: 'center', color: Colors.walnut2, marginTop: 2 },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  // ── Progress (Full Screen) ──
  generatingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    padding: Spacing.four,
  },
  generatingCard: {
    width: '100%', maxWidth: 340, backgroundColor: Colors.paperCard, borderRadius: Radius.xl,
    padding: Spacing.five, alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderColor: Colors.line,
  },
  progressEmoji: { fontSize: 40 },
  progressTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, color: Colors.ink, fontSize: 18 },
  progressStepText: { ...T.micro, color: Colors.walnut, textAlign: 'center' },
  progressBar: { width: '100%', height: 6, borderRadius: 3, backgroundColor: Colors.line, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.terracotta },

  // ── Result ──
  resultCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  resultImage: { width: '100%', backgroundColor: Colors.paper },
  resultFooter: { padding: Spacing.three, gap: Spacing.two },
  resultCaption: { ...T.bodyText, color: Colors.ink, fontSize: 13 },
  resultSaveBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 6,
  },
  resultSaveBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 14 },

  // ── Suggestion ──
  suggestionCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.two, borderWidth: 1, borderColor: Colors.line, ...Shadow.one,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  scoreCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.signalSoft, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.signal,
  },
  scoreNum: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, color: Colors.signal, fontSize: 16 },
  scoreLabel: { ...T.bodyText, color: Colors.walnut, fontSize: 13 },
  suggestionText: { ...T.bodyText, color: Colors.ink, fontSize: 14, lineHeight: 22 },
  tipsList: { gap: Spacing.one, marginTop: Spacing.one },
  tipRow: { flexDirection: 'row', gap: Spacing.one, alignItems: 'flex-start' },
  tipBullet: { ...T.micro, color: Colors.terracotta },
  tipText: { ...T.micro, color: Colors.walnut, flex: 1, lineHeight: 18 },
});
