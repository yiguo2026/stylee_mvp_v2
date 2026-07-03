import { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Fonts, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ConfirmModal } from '@/components/ConfirmModal';
import { WardrobeItem, RecommendedItem, OCCASION_TAGS } from '@/types';

const isWeb = Platform.OS === 'web';

const SEASON_LABELS: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬', all_season: '四季' };

export default function ItemDetailScreen() {
  const { id, itemData: itemDataParam } = useLocalSearchParams<{ id: string; itemData?: string }>();
  const { items, deleteItem } = useWardrobeStore();
  const [item, setItem] = useState<WardrobeItem | undefined>();
  const [recommendedItem, setRecommendedItem] = useState<RecommendedItem | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAttrs, setShowAttrs] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const isRecommended = id.startsWith('rec_');

  useEffect(() => {
    if (isRecommended && itemDataParam) {
      try { setRecommendedItem(JSON.parse(itemDataParam)); } catch {}
    } else {
      setItem(items.find(i => i.item_id === id));
    }
  }, [id, itemDataParam, items]);

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
    const rec = recommendedItem;
    const recAttrs = [
      { label: '分类', value: rec.category },
      { label: '颜色', value: rec.color },
      rec.description && { label: '描述', value: rec.description },
    ].filter(Boolean) as { label: string; value: string }[];

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← 返回</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.imageWrap}>
            {rec.image_url
              ? <Image source={{ uri: rec.image_url }} style={styles.image} resizeMode="cover" />
              : <View style={styles.imagePlaceholder}><CategoryIcon category={rec.category} size={80} color={Colors.walnut2} /></View>
            }
          </View>
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
      </SafeAreaView>
    );
  }

  const handleDelete = () => setShowDeleteConfirm(true);

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (!item) return;
    setDeleting(true);
    try {
      await deleteItem(item.item_id);
      router.back();
    } catch (e: any) {
      setDeleting(false);
      if (isWeb) { window.alert('删除失败：' + (e.message || '请稍后重试')); } else { Alert.alert('删除失败', e.message || '请稍后重试'); }
    }
  };

  const ATTR_LABELS = [
    { label: '分类', value: item!.category },
    { label: '颜色', value: item!.color },
    item!.material && { label: '材质', value: item!.material },
    item!.brand && { label: '品牌', value: item!.brand },
    item!.price != null && { label: '价格', value: `¥${item!.price}` },
    item!.fit_type && { label: '版型', value: item!.fit_type },
    item!.sleeve_length && { label: '袖长', value: item!.sleeve_length },
    item!.season && item!.season.length > 0 && { label: '季节', value: item!.season.map(s => SEASON_LABELS[s] || s).join('/') },
    item!.purchase_date && { label: '购入', value: new Date(item!.purchase_date).toLocaleDateString('zh-CN') },
    item!.occasion_tags && item!.occasion_tags.length > 0 && {
      label: '场合',
      value: item!.occasion_tags.map(t => {
        const found = OCCASION_TAGS.find(ot => ot.id === t);
        return found ? found.label : t;
      }).join('、'),
    },
  ].filter(Boolean) as { label: string; value: string }[];

  const wearCountText = item!.wear_count ? `穿过${item!.wear_count}次` : '0 次穿着';
  const lastWornText = item!.last_worn_at ? `最近${timeAgo(item!.last_worn_at)}` : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 返回</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/wardrobe/edit/${item!.item_id}`)}>
          <Text style={styles.editBtn}>编辑</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero Image */}
        <View style={styles.imageWrap}>
          {item!.image_url
            ? <Image source={{ uri: item!.image_url }} style={styles.image} resizeMode="cover" />
            : <View style={styles.imagePlaceholder}><CategoryIcon category={item!.category} size={80} color={Colors.walnut2} /></View>
          }
        </View>

        {/* Name */}
        <Text style={styles.itemName}>{item!.name}</Text>

        {/* Metadata row */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{item!.category} · {wearCountText}{lastWornText ? ` · 最近${lastWornText}` : ''}</Text>
          <TouchableOpacity onPress={() => setFavorited(!favorited)}>
            <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={22} color={favorited ? Colors.terracotta : Colors.walnut2} />
          </TouchableOpacity>
        </View>

        {/* 基础属性编辑 expandable */}
        <TouchableOpacity
          style={styles.attrsToggle}
          onPress={() => setShowAttrs(!showAttrs)}
        >
          <Text style={styles.attrsToggleText}>基础属性编辑 ›</Text>
        </TouchableOpacity>

        {showAttrs && (
          <View style={styles.attrsCard}>
            {ATTR_LABELS.map((attr, i) => (
              <View key={attr.label} style={[styles.attrRow, i < ATTR_LABELS.length - 1 && styles.attrRowBorder]}>
                <Text style={styles.attrLabel}>{attr.label}</Text>
                <Text style={styles.attrValue}>{attr.value}</Text>
              </View>
            ))}
            {/* Unset attributes */}
            {(!item!.fit_type) && (
              <View style={[styles.attrRow, styles.attrRowBorder]}>
                <Text style={styles.attrLabel}>版型</Text>
                <Text style={styles.attrUnset}>—</Text>
              </View>
            )}
            {(!item!.season || item!.season.length === 0) && (
              <View style={[styles.attrRow, styles.attrRowBorder]}>
                <Text style={styles.attrLabel}>季节</Text>
                <Text style={styles.attrUnset}>—</Text>
              </View>
            )}
            {(!item!.occasion_tags || item!.occasion_tags.length === 0) && (
              <View style={[styles.attrRow, styles.attrRowBorder]}>
                <Text style={styles.attrLabel}>场合</Text>
                <Text style={styles.attrUnset}>—</Text>
              </View>
            )}
            {(!item!.purchase_date) && (
              <View style={styles.attrRow}>
                <Text style={styles.attrLabel}>购入</Text>
                <Text style={styles.attrUnset}>—</Text>
              </View>
            )}
          </View>
        )}

        {/* AI attrs */}
        {item!.ai_recognized_attrs && Object.keys(item!.ai_recognized_attrs).length > 0 && (
          <View style={styles.aiCard}>
            <Text style={styles.aiTitle}>AI 识别属性</Text>
            {Object.entries(item!.ai_recognized_attrs).map(([k, v]) => (
              <Text key={k} style={styles.aiAttr}>{k}：{v}</Text>
            ))}
          </View>
        )}

        {/* 穿着记录 */}
        <View style={styles.wearSection}>
          <Text style={styles.wearTitle}>穿着记录</Text>
          <Text style={styles.wearCount}>{wearCountText}</Text>
        </View>

        {/* 已穿搭配 */}
        <View style={styles.outfitSection}>
          <Text style={styles.outfitTitle}>已穿搭配</Text>
          <Text style={styles.outfitEmpty}>暂无搭配记录</Text>
        </View>

        {/* Source */}
        <Text style={styles.meta}>
          添加于 {new Date(item!.created_at).toLocaleDateString('zh-CN')}
          {item!.source_label ? ` · ${item!.source_label}` :
            item!.source_type === 'photo_ai' ? ' · 拍照识别' :
            item!.source_type === 'album_ai' ? ' · 相册识别' : ' · 手动添加'}
        </Text>
      </ScrollView>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="删除衣物"
        message={`确认删除"${item!.name}"吗？`}
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
  editBtn: { ...T.buttonSecondary, color: Colors.terracotta },
  content: { padding: Spacing.four, gap: Spacing.three },

  imageWrap: {
    height: 320, borderRadius: Radius.lg, overflow: 'hidden',
    backgroundColor: Colors.paperCard, ...Shadow.two,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paperCard },

  itemName: { ...T.sectionTitle, fontSize: 22 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { ...T.micro, color: Colors.walnut },

  categoryBadge: {
    alignSelf: 'flex-start', backgroundColor: Colors.paper,
    paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.lineStrong,
  },
  categoryBadgeText: { ...T.tag, color: Colors.ink },

  attrsToggle: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  attrsToggleText: { ...T.bodyText, fontSize: 14, color: Colors.ink, fontFamily: Fonts.ui },

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

  outfitSection: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg, padding: Spacing.three,
    borderWidth: 1, borderColor: Colors.line,
  },
  outfitTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 14, color: Colors.ink },
  outfitEmpty: { ...T.micro, color: Colors.walnut2, marginTop: Spacing.one },

  meta: { ...T.micro, textAlign: 'center' },

  recHint: { backgroundColor: Colors.signalSoft, borderRadius: Radius.md, padding: Spacing.three, alignItems: 'center' },
  recHintText: { ...T.itemDesc, color: Colors.walnut2 },
});
