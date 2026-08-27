import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, router } from 'expo-router';
import { Colors, Fonts, Spacing, Radius, T } from '@/constants/theme';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { useGarmentImageReplace } from '@/hooks/useGarmentImageReplace';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Toast } from '@/components/Toast';
import { ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL, OCCASION_TAGS, FitType } from '@/types';

const COLOR_OPTIONS = [
  '白色', '黑色', '灰色', '深灰', '浅蓝', '深蓝', '藏青',
  '米色', '驼色', '棕色', '红色', '酒红', '粉色', '绿色',
  '卡其', '条纹', '花色',
];

const MATERIAL_OPTIONS = [
  '纯棉', '棉混纺', '牛津纺棉', '针织', '羊绒混纺', '羊毛混纺',
  '牛仔布', '西装料', '丝质', '真皮', '合成革', '网面',
  '雪纺', '涤纶', '亚麻', '皮革/橡胶',
];

const FIT_OPTIONS: FitType[] = ['超紧身', '修身', '常规合身', '宽松', '廓形'];
const SEASON_OPTIONS = [
  { id: 'spring', label: '春' },
  { id: 'summer', label: '夏' },
  { id: 'autumn', label: '秋' },
  { id: 'winter', label: '冬' },
  { id: 'all_season', label: '四季' },
] as const;

const CATEGORIES = CLOTHING_CATEGORIES_WITH_ALL.filter(c => c !== '全部') as ClothingCategory[];

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, updateItem } = useWardrobeStore();
  const [item, setItem] = useState(items.find(i => i.item_id === id));

  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<ClothingCategory>(item?.category ?? '上装');
  const [color, setColor] = useState(item?.color ?? '');
  const [material, setMaterial] = useState(item?.material ?? '');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [price, setPrice] = useState(item?.price?.toString() ?? '');
  const [fitType, setFitType] = useState<string>(item?.fit_type ?? '');
  const [seasons, setSeasons] = useState<string[]>(item?.season ?? []);
  const [occasionTags, setOccasionTags] = useState<string[]>(item?.occasion_tags ?? []);
  const [purchaseDate, setPurchaseDate] = useState(item?.purchase_date ?? '');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (!mountedRef.current) return;
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // 换图逻辑复用通用 hook：原图立即生效 + 后台标准化/识别，带并发令牌与 mounted 守卫
  const imageReplace = useGarmentImageReplace({
    item,
    updateItem,
    context: { category, color, material, description: name || item?.name },
    recognize: true,
    onRecognized: (result) => {
      setCategory(result.category);
      setColor(result.color);
      if (result.material) setMaterial(result.material);
      if (result.brand) setBrand(result.brand);
      if (result.fit_type) setFitType(result.fit_type);
      if (result.season?.length) setSeasons(result.season);
      if (result.occasion_tags?.length) setOccasionTags(result.occasion_tags);
      setName((result.style ? `${result.color}${result.category}·${result.style}` : `${result.color}${result.category}`).slice(0, 10));
    },
    onToast: showToast,
  });
  const { imageUri, standardizing, recognizing } = imageReplace;

  useEffect(() => {
    const found = items.find(i => i.item_id === id);
    if (found) {
      setItem(found);
      setName(found.name);
      setCategory(found.category);
      setColor(found.color);
      setMaterial(found.material ?? '');
      setBrand(found.brand ?? '');
      setPrice(found.price?.toString() ?? '');
      setFitType(found.fit_type ?? '');
      setSeasons(found.season ?? []);
      setOccasionTags(found.occasion_tags ?? []);
      setPurchaseDate(found.purchase_date ?? '');
      imageReplace.setImageUri(found.image_url ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, items]);

  const toggleSeason = (id: string) => {
    setSeasons(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleOccasion = (id: string) => {
    setOccasionTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!name.trim() || !item) return;
    setSaving(true);
    try {
      await updateItem(item.item_id, {
        name: name.trim(),
        category,
        color: color.trim() || '未知',
        material: material.trim() || undefined,
        brand: brand.trim() || undefined,
        price: price ? parseFloat(price) : undefined,
        fit_type: (fitType || undefined) as FitType | undefined,
        season: seasons.length > 0 ? seasons as any : undefined,
        occasion_tags: occasionTags.length > 0 ? occasionTags : undefined,
        purchase_date: purchaseDate || undefined,
        image_url: imageUri || undefined,
      });
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      showToast(e.message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={Colors.terracotta} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>编辑单品</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
        {/* Photos — single main image, 换图入口叠在主图右下角 */}
        <Text style={styles.sectionLabel}>照片</Text>
        <View style={styles.mainPhotoRow}>
          <View style={[styles.photoSlot, styles.photoSlotCover]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.photoImage} resizeMode="contain" />
            ) : (
              <View style={styles.photoEmpty}>
                <CategoryIcon category={category} size={40} color={Colors.walnut2} />
              </View>
            )}

            {/* 处理中：异步局部过程态，不阻塞其它字段编辑（参考新建单品导入体验） */}
            {(standardizing || recognizing) ? (
              <View style={styles.photoProcessing}>
                <ActivityIndicator size="small" color={Colors.paper} />
                <Text style={styles.photoProcessingText}>
                  {standardizing ? '标准化中…' : '识别中…'}
                </Text>
              </View>
            ) : null}

            {/* 右下角换图按钮 */}
            <TouchableOpacity
              style={styles.changePhotoFab}
              onPress={imageReplace.pickAndReplace}
              disabled={standardizing || recognizing}
              activeOpacity={0.85}
              hitSlop={8}
            >
              <Feather name="camera" size={15} color={Colors.paper} />
            </TouchableOpacity>
          </View>
          <Text style={styles.photoHint}>换图立即生效，抠图 / 标准化将在后台完成，其间可继续编辑或离开</Text>
        </View>

        {/* Form */}
        <View style={styles.formSection}>
          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>名称</Text>
            <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="输入名称" placeholderTextColor={Colors.walnut2} />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>分类</Text>
            <TouchableOpacity style={styles.fieldSelect} onPress={() => setShowCategoryPicker(!showCategoryPicker)}>
              <Text style={styles.fieldSelectText}>{category}</Text>
              <Text style={styles.fieldSelectArrow}>›</Text>
            </TouchableOpacity>
            {showCategoryPicker ? (
              <View style={styles.pickerGrid}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.pickerOption, category === cat && styles.pickerOptionActive]} onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}>
                    <Text style={[styles.pickerOptionText, category === cat && styles.pickerOptionTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>

          {/* Color */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>颜色</Text>
            <TextInput style={styles.fieldInput} value={color} onChangeText={setColor} placeholder="输入或选择颜色" placeholderTextColor={Colors.walnut2} onFocus={() => setShowColorPicker(true)} />
            {showColorPicker ? (
              <View style={styles.pickerWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pickerRow}>
                    {COLOR_OPTIONS.map(c => (
                      <TouchableOpacity key={c} style={[styles.pickerChip, color === c && styles.pickerChipActive]} onPress={() => { setColor(c); setShowColorPicker(false); }}>
                        <Text style={[styles.pickerChipText, color === c && styles.pickerChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}
          </View>

          {/* Material */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>材质</Text>
            <TextInput style={styles.fieldInput} value={material} onChangeText={setMaterial} placeholder="输入或选择材质" placeholderTextColor={Colors.walnut2} onFocus={() => setShowMaterialPicker(true)} />
            {showMaterialPicker ? (
              <View style={styles.pickerWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pickerRow}>
                    {MATERIAL_OPTIONS.map(m => (
                      <TouchableOpacity key={m} style={[styles.pickerChip, material === m && styles.pickerChipActive]} onPress={() => { setMaterial(m); setShowMaterialPicker(false); }}>
                        <Text style={[styles.pickerChipText, material === m && styles.pickerChipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}
          </View>

          {/* Brand */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>品牌</Text>
            <TextInput style={styles.fieldInput} value={brand} onChangeText={setBrand} placeholder="可选" placeholderTextColor={Colors.walnut2} />
          </View>

          {/* Price */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>价格</Text>
            <TextInput style={styles.fieldInput} value={price} onChangeText={setPrice} placeholder="可选" placeholderTextColor={Colors.walnut2} keyboardType="numeric" />
          </View>

          {/* Fit Type */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>版型</Text>
            <View style={styles.pickerGrid}>
              {FIT_OPTIONS.map(fit => (
                <TouchableOpacity key={fit} style={[styles.pickerOption, fitType === fit && styles.pickerOptionActive]} onPress={() => setFitType(fitType === fit ? '' : fit)}>
                  <Text style={[styles.pickerOptionText, fitType === fit && styles.pickerOptionTextActive]}>{fit}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Purchase Date */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>购买日期</Text>
            <TextInput
              style={styles.fieldInput}
              value={purchaseDate}
              onChangeText={setPurchaseDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.walnut2}
            />
          </View>

          {/* Season */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>季节</Text>
            <View style={styles.pickerGrid}>
              {SEASON_OPTIONS.map(s => (
                <TouchableOpacity key={s.id} style={[styles.pickerOption, seasons.includes(s.id) && styles.pickerOptionActive]} onPress={() => toggleSeason(s.id)}>
                  <Text style={[styles.pickerOptionText, seasons.includes(s.id) && styles.pickerOptionTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Occasion Tags */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>场合标签</Text>
            <View style={styles.pickerGrid}>
              {OCCASION_TAGS.map(tag => (
                <TouchableOpacity key={tag.id} style={[styles.pickerOption, occasionTags.includes(tag.id) && styles.pickerOptionActive]} onPress={() => toggleOccasion(tag.id)}>
                  <Text style={[styles.pickerOptionText, occasionTags.includes(tag.id) && styles.pickerOptionTextActive]}>{tag.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity style={[styles.saveBtn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.paper} /> : <Text style={styles.saveText}>保存修改</Text>}
        </TouchableOpacity>

        {/* Delete button removed — already available on detail page header */}
      </ScrollView>

      <Toast visible={!!toast} message={toast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  headerRight: { width: 60 },
  scroll: { flex: 1 },
  inner: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  sectionLabel: { ...T.formLabel },
  mainPhotoRow: { alignItems: 'flex-start', gap: Spacing.two },
  photoSlot: {
    width: 80, height: 80, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  photoSlotCover: { width: 120, height: 120 },
  photoImage: { width: '100%', height: '100%', borderRadius: Radius.md, backgroundColor: Colors.paperCard },
  photoEmpty: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paperCard },
  // 右下角圆形换图按钮，叠在主图上
  changePhotoFab: {
    position: 'absolute', bottom: 6, right: 6,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.paper,
  },
  // 换图处理中局部浮层（异步，不阻塞其它字段）
  photoProcessing: {
    ...StyleSheet.absoluteFillObject, borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  photoProcessingText: { ...T.micro, color: Colors.paper, fontFamily: Fonts.uiSemiBold },
  photoHint: { ...T.micro, color: Colors.walnut2, maxWidth: 200 },

  formSection: { gap: Spacing.three },
  field: { gap: Spacing.one },
  fieldLabel: { ...T.formLabel },
  fieldInput: {
    ...T.inputText, backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, color: Colors.ink,
  },
  fieldSelect: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2,
  },
  fieldSelectText: { ...T.inputText, color: Colors.ink },
  fieldSelectArrow: { color: Colors.walnut2, fontSize: 16 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  pickerOption: {
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.paper,
  },
  pickerOptionActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  pickerOptionText: { ...T.tag, color: Colors.ink },
  pickerOptionTextActive: { ...T.tag, color: Colors.paper },
  pickerWrap: { marginTop: Spacing.one },
  pickerRow: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  pickerChip: {
    paddingHorizontal: Spacing.two, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.paper,
  },
  pickerChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  pickerChipText: { ...T.tag, color: Colors.ink, fontSize: 11 },
  pickerChipTextActive: { ...T.tag, color: Colors.paper, fontSize: 11 },

  saveBtn: { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two },
  disabled: { opacity: 0.6 },
  saveText: { ...T.buttonPrimary, color: Colors.paper },
  deleteBtn: { borderWidth: 1.5, borderColor: Colors.accent, borderRadius: Radius.md, paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two },
  deleteText: { ...T.buttonPrimary, color: Colors.accent, fontFamily: Fonts.uiSemiBold, fontSize: 15 },
});
