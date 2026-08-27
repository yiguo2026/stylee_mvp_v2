import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, TextInput,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Colors, Fonts, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useWishlistStore } from '@/stores/wishlistStore';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ItemOutfits } from '@/components/ItemOutfits';
import { useItemAttributes, ItemAttributesCard, ItemAttributesSheet } from '@/components/ItemAttributes';
import { useGarmentImageReplace } from '@/hooks/useGarmentImageReplace';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/components/Toast';
import { StyleeGarmentMedia } from '@/design-system';
import type { GarmentMediaTone } from '@/design-system';
import { WardrobeItem, RecommendedItem, RecognitionResult } from '@/types';

// 详情页主图：以 contain 完整展示单品（不裁切），容器高度按图片真实长宽比自适应，
// 并限制在合理的最小/最大高度区间内，保证鞋/上装/连衣裙等不同比例都能完整居中显示。
function HeroMedia({ imageUri, tone, category, onReplace, processing }: {
  imageUri?: string | null;
  tone: GarmentMediaTone;
  category: string;
  onReplace?: () => void;
  processing?: boolean;
}) {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!imageUri) { setRatio(null); return; }
    let active = true;
    Image.getSize(
      imageUri,
      (w, h) => {
        if (!active || !w || !h) return;
        // 夹在 0.62(偏瘦长) ~ 1.2(偏宽) 之间，避免极端比例导致容器过高/过扁
        setRatio(Math.min(1.2, Math.max(0.62, w / h)));
      },
      () => { /* 读取失败保持默认 3/4 */ },
    );
    return () => { active = false; };
  }, [imageUri]);

  return (
    <View style={[styles.imageWrap, ratio ? { aspectRatio: ratio } : null]}>
      {imageUri
        ? <StyleeGarmentMedia imageUri={imageUri} tone={tone} />
        : <View style={styles.imagePlaceholder}><CategoryIcon category={category} size={80} color={Colors.walnut2} /></View>}
      {/* 换图后台标准化的局部处理态浮层：不阻塞用户其它操作 */}
      {processing ? (
        <View style={styles.heroProcessing}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.heroProcessingText}>标准化中…</Text>
        </View>
      ) : null}
      {onReplace ? (
        <TouchableOpacity
          style={styles.replaceBtn}
          activeOpacity={0.85}
          onPress={onReplace}
          disabled={processing}
        >
          <Text style={styles.replaceBtnText}>换图</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}


// Unified add-source labels for display
function getAddSourceLabel(item: WardrobeItem | RecommendedItem): string {
  const label = (item as WardrobeItem).source_label;
  const type = (item as WardrobeItem).source_type;

  if (label) {
    if (label.startsWith('相册导入') || label === '批量导入' || label === '手动添加' || label === '拍照识别' || label === '相册识别') return '相册导入';
    if (label === '来自心愿单') return '心愿单添加';
    if (label === '灵感推荐添加') return '灵感推荐添加';
    if (label === 'AI推荐添加') return 'AI推荐添加';
    if (label === '快速添加') return '快速添加';
    if (label === '心愿单添加') return '心愿单添加';
    return label;
  }
  if (type === 'photo_ai' || type === 'album_ai') return '相册导入';
  return '快速添加';
}

export default function ItemDetailScreen() {
  const { id, itemData: itemDataParam } = useLocalSearchParams<{ id: string; itemData?: string }>();
  const { items, deleteItem, updateItem } = useWardrobeStore();
  const [item, setItem] = useState<WardrobeItem | undefined>();
  const [recommendedItem, setRecommendedItem] = useState<RecommendedItem | undefined>();
  const [notFound, setNotFound] = useState(false);

  const isRecommended = id.startsWith('rec_');

  useEffect(() => {
    if (isRecommended && itemDataParam) {
      try { setRecommendedItem(JSON.parse(itemDataParam)); } catch {}
      return;
    }
    const found = items.find(i => i.item_id === id);
    if (found) { setItem(found); setNotFound(false); return; }
    // Not in store (e.g. navigated from an outfit / record page) — fetch directly.
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('wardrobe_items')
        .select('*')
        .eq('item_id', id)
        .maybeSingle();
      if (!active) return;
      if (data) setItem(data as WardrobeItem);
      else setNotFound(true); // 查不到就给明确空态，避免无限转圈
    })();
    return () => { active = false; };
  }, [id, itemDataParam, items, isRecommended]);

  // 从记录/推荐页进入但单品已被删除或云端不可用时，给出可返回的空态
  if (notFound && !item && !recommendedItem) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← 返回</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>没有找到这件单品</Text>
          <Text style={styles.emptyHint}>它可能已被删除，或暂时无法加载</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item && !recommendedItem) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.terracotta} />
        </View>
      </SafeAreaView>
    );
  }

  if (recommendedItem) {
    return <RecommendedItemDetail rec={recommendedItem} />;
  }

  return <OwnedItemDetail item={item!} updateItem={updateItem} deleteItem={deleteItem} />;
}

// 推荐态单品详情：来自灵感页 / 推荐结果页的「尚未加入衣橱」单品。
// 只读展示 + 提供「加入衣橱 / 加入心愿单」两个行动点，避免成为死胡同。
function RecommendedItemDetail({ rec }: { rec: RecommendedItem }) {
  const { user } = useUserStore();
  const addToWardrobe = useWardrobeStore(s => s.addItem);
  const addToWishlist = useWishlistStore(s => s.addItem);
  const [adding, setAdding] = useState(false);
  const [wishing, setWishing] = useState(false);
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);

  const recAttrs = [
    { label: '分类', value: rec.category },
    { label: '颜色', value: rec.color },
    rec.description && { label: '描述', value: rec.description },
  ].filter(Boolean) as { label: string; value: string }[];

  const handleAddWardrobe = async () => {
    if (added || adding) return;
    if (!user?.id) { showToast('请先登录后再添加'); return; }
    setAdding(true);
    try {
      const saved = await addToWardrobe({
        user_id: user.id,
        name: rec.name,
        category: rec.category,
        color: rec.color || '',
        source_type: 'manual',
        source_label: '灵感推荐添加',
        status: 'active',
        image_url: rec.image_url || undefined,
      });
      if (!saved) {
        const err = useWardrobeStore.getState().error;
        showToast(err ? `添加失败：${err}` : '添加失败，请稍后重试', 'error');
        return;
      }
      setAdded(true);
      showToast(`「${rec.name}」已加入衣橱`, 'success');
    } finally {
      setAdding(false);
    }
  };

  const handleAddWishlist = async () => {
    if (wished || wishing) return;
    if (!user?.id) { showToast('请先登录后再添加'); return; }
    setWishing(true);
    try {
      const saved = await addToWishlist({
        user_id: user.id,
        name: rec.name,
        category: rec.category,
        color: rec.color || '',
        image_url: rec.image_url,
        source: 'ai_recommended',
      });
      if (!saved) {
        const err = useWishlistStore.getState().error;
        showToast(err ? `加入心愿单失败：${err}` : '加入心愿单失败，请稍后重试', 'error');
        return;
      }
      setWished(true);
      showToast('已加入心愿单', 'success');
    } finally {
      setWishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroMedia imageUri={rec.image_url} tone="recommended" category={rec.category} />
        <Text style={styles.itemName}>{rec.name}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{rec.category}</Text>
        </View>
        <View style={styles.attrsCard}>
          {recAttrs.map((attr, i) => (
            <View key={attr.label} style={[styles.attrRow, i < recAttrs.length - 1 && styles.attrRowBorder]}>
              <Text style={styles.attrLabel}>{attr.label}</Text>
              <Text style={styles.attrValue}>{attr.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.recHint}>
          <Text style={styles.recHintText}>这是推荐单品，尚未加入衣橱</Text>
        </View>
      </ScrollView>

      {/* 底部行动条：把只读推荐页变成可操作——加入衣橱后即可像自有单品一样编辑 */}
      <View style={styles.recActionBar}>
        <TouchableOpacity
          style={[styles.recActionSecondary, (wished || wishing) && styles.recActionDisabled]}
          activeOpacity={0.85}
          disabled={wished || wishing}
          onPress={handleAddWishlist}
        >
          <Text style={styles.recActionSecondaryText}>
            {wished ? '已在心愿单' : wishing ? '添加中…' : '加入心愿单'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.recActionPrimary, (added || adding) && styles.recActionDisabled]}
          activeOpacity={0.85}
          disabled={added || adding}
          onPress={handleAddWardrobe}
        >
          <Text style={styles.recActionPrimaryText}>
            {added ? '已加入衣橱' : adding ? '添加中…' : '加入衣橱'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function OwnedItemDetail({ item, updateItem, deleteItem }: {
  item: WardrobeItem;
  updateItem: (id: string, updates: Partial<WardrobeItem>) => void;
  deleteItem: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);
  const attrModel = useItemAttributes(item, (updates) => updateItem(item.item_id, updates));

  // 重新识别时只回填「当前为空且非用户手动设置」的字段，绝不覆盖用户已编辑的属性，
  // 并把新识别到的字段标记为 AI 识别（用于展示「AI 识别」角标）。
  const handleRecognized = (result: RecognitionResult) => {
    const cur = useWardrobeStore.getState().items.find(i => i.item_id === item.item_id) ?? item;
    const manual = cur.ai_recognized_attrs?.manual_fields ?? [];
    const updates: Partial<WardrobeItem> = {};
    const newlyRecognized: string[] = [];
    const fill = (key: string, hasValue: boolean, apply: () => void) => {
      if (!hasValue && !manual.includes(key)) { apply(); newlyRecognized.push(key); }
    };
    if (result.color) fill('color', !!cur.color, () => { updates.color = result.color; });
    if (result.material) fill('material', !!cur.material, () => { updates.material = result.material; });
    if (result.brand) fill('brand', !!cur.brand, () => { updates.brand = result.brand; });
    if (result.fit_type) fill('fit_type', !!cur.fit_type, () => { updates.fit_type = result.fit_type; });
    if (result.season?.length) fill('season', !!cur.season?.length, () => { updates.season = result.season as WardrobeItem['season']; });
    if (result.occasion_tags?.length) fill('occasion', !!cur.occasion_tags?.length, () => { updates.occasion_tags = result.occasion_tags; });

    if (newlyRecognized.length === 0) return;
    const existing = cur.ai_recognized_attrs ?? {};
    const recognized_fields = Array.from(new Set([...(existing.recognized_fields ?? []), ...newlyRecognized]));
    updateItem(item.item_id, { ...updates, ai_recognized_attrs: { ...existing, recognized_fields } });
  };

  // 换图：在详情页内直接调起系统相册就地替换（复用编辑页的稳健逻辑，含并发令牌 + mounted 守卫）
  const imageReplace = useGarmentImageReplace({
    item,
    updateItem,
    context: { category: item.category, color: item.color, material: item.material, description: item.name },
    recognize: true,
    onRecognized: handleRecognized,
    onToast: (msg) => showToast(msg),
  });

  // store 中 item 变化（例如后台标准化换图完成写回）时，同步主图展示
  useEffect(() => {
    imageReplace.setImageUri(item.image_url ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.image_url]);

  const handleDelete = () => setShowDeleteConfirm(true);

  const saveName = () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === item.name) { setNameDraft(item.name); return; }
    updateItem(item.item_id, { name: next });
    showToast('已更新名称', 'success');
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await deleteItem(item.item_id);
      router.replace('/wardrobe');
    } catch (e: any) {
      setDeleting(false);
      showToast('删除失败：' + (e.message || '请稍后重试'), 'error');
    }
  };

  const wearCountText = item.wear_count ? `穿过 ${item.wear_count} 次` : '还没穿过';
  const lastWornText = item.last_worn_at ? `最近${timeAgo(item.last_worn_at)}穿过` : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteBtn}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero Image —— 右下角「换图」直接调起系统相册就地替换（含后台标准化 + 重新识别） */}
        <HeroMedia
          imageUri={imageReplace.imageUri || item.image_url}
          tone="owned"
          category={item.category}
          onReplace={imageReplace.pickAndReplace}
          processing={imageReplace.processing}
        />

        {/* Name —— 点击标题即可内联改名，无需另开编辑页 */}
        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              onSubmitEditing={saveName}
              onBlur={saveName}
              returnKeyType="done"
              placeholder="给这件单品起个名字"
              placeholderTextColor={Colors.walnut2}
              autoFocus
              maxLength={20}
            />
            <TouchableOpacity onPress={saveName}><Text style={styles.nameSaveText}>完成</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.nameRow}
            activeOpacity={0.6}
            onPress={() => { setNameDraft(item.name); setEditingName(true); }}
          >
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.nameEditHint}>✎</Text>
          </TouchableOpacity>
        )}

        {/* Metadata row —— 分类 + 穿着概览（避免与穿着记录区重复计数） */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {item.category} · {wearCountText}{lastWornText ? ` · ${lastWornText}` : ''}
          </Text>
        </View>

        {/* 基础属性 —— 默认仅展示 AI 识别的材质/版型，其余按需添加 */}
        <ItemAttributesCard model={attrModel} />

        {/* 穿着记录 —— 展示包含此单品的搭配（计数已在上方概览，不再重复） */}
        <View style={styles.wearSection}>
          <Text style={styles.wearTitle}>穿着记录</Text>
          <ItemOutfits itemId={item.item_id} />
        </View>

        {/* Source — unified labels: 相册导入 / 心愿单添加 / 快速添加 */}
        <Text style={styles.meta}>
          添加于 {new Date(item.created_at).toLocaleDateString('zh-CN')}
          {` · ${getAddSourceLabel(item)}`}
        </Text>
      </ScrollView>

      {/* 属性编辑底部弹层：渲染在屏幕根部，充满手机容器（不用 RN Modal 逃逸） */}
      <ItemAttributesSheet model={attrModel} />

      <ConfirmModal
        visible={showDeleteConfirm}
        title="删除衣物"
        message={`确认删除"${item.name}"吗？`}
        confirmText="删除"
        confirmStyle="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleting}
      />
    </SafeAreaView>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (24 * 3600 * 1000));
  if (days === 0) return '今天';
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return `${Math.floor(days / 30)}月前`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.two,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back: { ...T.buttonSecondary, color: Colors.walnut },
  headerActions: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  deleteBtn: { ...T.buttonSecondary, color: Colors.accent },
  editBtn: { ...T.buttonSecondary, color: Colors.terracotta },
  content: { padding: Spacing.four, gap: Spacing.three },

  imageWrap: {
    aspectRatio: 3 / 4, minHeight: 360, maxHeight: 560, borderRadius: Radius.lg, overflow: 'hidden',
    backgroundColor: Colors.paperCard, ...Shadow.two,
  },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paperCard },
  replaceBtn: {
    position: 'absolute', right: Spacing.two, bottom: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16,
    paddingHorizontal: Spacing.three, paddingVertical: 6,
  },
  replaceBtnText: { ...T.micro, color: '#fff' },
  // 换图后台标准化的局部处理态浮层
  heroProcessing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroProcessingText: { ...T.micro, color: '#fff', fontFamily: Fonts.uiSemiBold },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameEditHint: { ...T.micro, color: Colors.walnut2, fontSize: 15 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameInput: {
    flex: 1, ...T.sectionTitle, fontSize: 22, color: Colors.ink,
    borderBottomWidth: 1, borderBottomColor: Colors.lineStrong, paddingVertical: 2,
  },
  nameSaveText: { ...T.buttonSecondary, color: Colors.terracotta },

  itemName: { ...T.sectionTitle, fontSize: 22 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { ...T.micro, color: Colors.walnut },

  categoryBadge: {
    alignSelf: 'flex-start', backgroundColor: Colors.paper,
    paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.lineStrong,
  },
  categoryBadgeText: { ...T.tag, color: Colors.ink },

  attrsCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line, overflow: 'hidden', ...Shadow.one,
  },
  attrRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 4,
  },
  attrRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.lineSoft },
  attrLabel: { ...T.formLabel },
  attrValue: { ...T.itemName },
  attrUnset: { ...T.itemName, color: Colors.walnut2 },

  aiCard: { backgroundColor: Colors.signalSoft, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  aiTitle: { ...T.formLabel, marginBottom: 4 },
  aiAttr: { ...T.itemDesc },

  wearSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg, padding: Spacing.three,
    borderWidth: 1, borderColor: Colors.line,
  },
  wearTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 14, color: Colors.ink },
  wearCount: { ...T.micro, color: Colors.walnut, marginTop: Spacing.one },

  meta: { ...T.micro, textAlign: 'center' },

  recHint: { backgroundColor: Colors.signalSoft, borderRadius: Radius.md, padding: Spacing.three, alignItems: 'center' },
  recHintText: { ...T.itemDesc, color: Colors.walnut2 },

  emptyTitle: { ...T.sectionTitle, fontSize: 18, color: Colors.ink, marginBottom: Spacing.one },
  emptyHint: { ...T.itemDesc, color: Colors.walnut2 },

  recActionBar: {
    flexDirection: 'row', gap: Spacing.two,
    paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three,
    borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.paper,
  },
  recActionSecondary: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.three,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.paperCard,
  },
  recActionSecondaryText: { ...T.buttonSecondary, color: Colors.walnut },
  recActionPrimary: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.three,
    borderRadius: Radius.md, backgroundColor: Colors.terracotta,
  },
  recActionPrimaryText: { ...T.buttonSecondary, color: '#fff' },
  recActionDisabled: { opacity: 0.55 },
});
