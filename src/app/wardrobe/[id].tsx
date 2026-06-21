import { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ConfirmModal } from '@/components/ConfirmModal';
import { WardrobeItem, RecommendedItem } from '@/types';

export default function ItemDetailScreen() {
  const { id, itemData: itemDataParam } = useLocalSearchParams<{ id: string; itemData?: string }>();
  const { items, deleteItem } = useWardrobeStore();
  const [item, setItem] = useState<WardrobeItem | undefined>();
  const [recommendedItem, setRecommendedItem] = useState<RecommendedItem | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Render recommended item detail
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
            <Text style={styles.back}>‹ 返回</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.imageWrap}>
            {rec.image_url
              ? <Image source={{ uri: rec.image_url }} style={styles.image} resizeMode="cover" />
              : (
                <View style={styles.imagePlaceholder}>
                  <CategoryIcon category={rec.category} size={80} color={Colors.walnut2} />
                </View>
              )
            }
          </View>
          <Text style={styles.itemName}>{rec.name}</Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{rec.category}</Text>
          </View>
          <View style={styles.attrsCard}>
            {recAttrs.map((attr, i) => (
              <View
                key={attr.label}
                style={[styles.attrRow, i < recAttrs.length - 1 && styles.attrRowBorder]}
              >
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

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (!item) return;
    setDeleting(true);
    await deleteItem(item.item_id);
    router.back();
  };

  const ATTR_LABELS = [
    { label: '分类', value: item.category },
    { label: '颜色', value: item.color },
    item.material && { label: '材质', value: item.material },
    item.brand && { label: '品牌', value: item.brand },
    item.price != null && { label: '价格', value: `¥${item.price}` },
    item.fit_type && { label: '版型', value: item.fit_type },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ 返回</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/wardrobe/edit/${item.item_id}`)}>
          <Text style={styles.editBtn}>编辑</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Image */}
        <View style={styles.imageWrap}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
            : (
              <View style={styles.imagePlaceholder}>
                <CategoryIcon category={item.category} size={80} color={Colors.walnut2} />
              </View>
            )
          }
        </View>

        {/* Name & Category */}
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{item.category}</Text>
        </View>

        {/* Attributes */}
        <View style={styles.attrsCard}>
          {ATTR_LABELS.map((attr, i) => (
            <View
              key={attr.label}
              style={[styles.attrRow, i < ATTR_LABELS.length - 1 && styles.attrRowBorder]}
            >
              <Text style={styles.attrLabel}>{attr.label}</Text>
              <Text style={styles.attrValue}>{attr.value}</Text>
            </View>
          ))}
        </View>

        {/* AI attrs if present */}
        {item.ai_recognized_attrs && Object.keys(item.ai_recognized_attrs).length > 0 && (
          <View style={styles.aiCard}>
            <Text style={styles.aiTitle}>AI 识别属性</Text>
            {Object.entries(item.ai_recognized_attrs).map(([k, v]) => (
              <Text key={k} style={styles.aiAttr}>{k}：{v}</Text>
            ))}
          </View>
        )}

        {/* Source */}
        <Text style={styles.meta}>
          添加于 {new Date(item.created_at).toLocaleDateString('zh-CN')}
          {item.source_type === 'photo_ai' ? ' · 拍照识别' :
            item.source_type === 'album_ai' ? ' · 相册识别' : ' · 手动添加'}
        </Text>
      </ScrollView>

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  back: { ...T.buttonSecondary, color: Colors.walnut },
  editBtn: { ...T.buttonSecondary, color: Colors.terracotta },
  content: { padding: Spacing.four, gap: Spacing.three },
  imageWrap: {
    height: 320, borderRadius: Radius.lg, overflow: 'hidden',
    backgroundColor: Colors.paperCard,
    borderWidth: 1, borderColor: Colors.lineStrong,
    ...Shadow.two,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.vintageCream,
  },
  // placeholderEmoji removed — now uses CategoryIcon component
  // 方正悠宋 — item headline
  itemName: { ...T.sectionTitle, fontSize: 22 },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.vintageCream,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  // 苹方 — tag chip
  categoryBadgeText: { ...T.tag, color: Colors.walnut },
  attrsCard: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
    ...Shadow.one,
  },
  attrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  attrRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.lineSoft },
  // 苹方 — form label
  attrLabel: { ...T.formLabel },
  // 方正悠宋 — attr value
  attrValue: { ...T.itemName },
  aiCard: {
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  aiTitle: { ...T.formLabel, marginBottom: 4 },
  aiAttr: { ...T.itemDesc },
  // 苹方 Light — date metadata
  meta: { ...T.micro, textAlign: 'center' },
  recHint: {
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
  },
  recHintText: { ...T.itemDesc, color: Colors.walnut2 },
});
