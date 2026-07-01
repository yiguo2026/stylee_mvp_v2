import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ConfirmModal } from '@/components/ConfirmModal';
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
  const { items, updateItem, deleteItem } = useWardrobeStore();
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
  const [imageUri, setImageUri] = useState(item?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

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
      setImageUri(found.image_url ?? '');
    }
  }, [id, items]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.7, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

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
      Alert.alert('保存失败', e.message || '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (!item) return;
    setDeleting(true);
    await deleteItem(item.item_id);
    router.back();
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
        {/* Photos */}
        <Text style={styles.sectionLabel}>照片</Text>
        <View style={styles.photosRow}>
          <TouchableOpacity style={[styles.photoSlot, styles.photoSlotCover]} onPress={pickImage}>
            {imageUri ? (
              <>
                <Image source={{ uri: imageUri }} style={styles.photoImage} />
                <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setImageUri('')}>
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.photoEmpty}>
                <CategoryIcon category={category} size={40} color={Colors.walnut2} />
              </View>
            )}
          </TouchableOpacity>
          {[1, 2, 3].map(i => (
            <TouchableOpacity key={i} style={styles.photoSlot} onPress={pickImage}>
              <View style={styles.photoAddSlot}>
                <Text style={styles.photoPlus}>+</Text>
                <Text style={styles.photoAddLabel}>添加</Text>
              </View>
            </TouchableOpacity>
          ))}
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
            {showCategoryPicker && (
              <View style={styles.pickerGrid}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.pickerOption, category === cat && styles.pickerOptionActive]} onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}>
                    <Text style={[styles.pickerOptionText, category === cat && styles.pickerOptionTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Color */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>颜色</Text>
            <TextInput style={styles.fieldInput} value={color} onChangeText={setColor} placeholder="输入或选择颜色" placeholderTextColor={Colors.walnut2} onFocus={() => setShowColorPicker(true)} />
            {showColorPicker && (
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
            )}
          </View>

          {/* Material */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>材质</Text>
            <TextInput style={styles.fieldInput} value={material} onChangeText={setMaterial} placeholder="输入或选择材质" placeholderTextColor={Colors.walnut2} onFocus={() => setShowMaterialPicker(true)} />
            {showMaterialPicker && (
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
            )}
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

        {/* Delete */}
        <TouchableOpacity style={styles.deleteBtn} onPress={() => setShowDeleteConfirm(true)} disabled={deleting}>
          {deleting ? <ActivityIndicator color={Colors.accent} /> : <Text style={styles.deleteText}>删除此单品</Text>}
        </TouchableOpacity>
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
  photosRow: { flexDirection: 'row', gap: Spacing.two },
  photoSlot: {
    width: 80, height: 80, borderRadius: Radius.md,
    backgroundColor: Colors.paperCard, borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  photoSlotCover: { width: 120, height: 120 },
  photoImage: { width: '100%', height: '100%', borderRadius: Radius.md },
  removePhotoBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  photoEmpty: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.vintageCream },
  photoAddSlot: { alignItems: 'center', gap: 2 },
  photoPlus: { fontSize: 20, color: Colors.walnut2 },
  photoAddLabel: { ...T.micro, color: Colors.walnut2 },

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
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.paperCard,
  },
  pickerOptionActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  pickerOptionText: { ...T.tag, color: Colors.walnut },
  pickerOptionTextActive: { ...T.tag, color: Colors.paper },
  pickerWrap: { marginTop: Spacing.one },
  pickerRow: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  pickerChip: {
    paddingHorizontal: Spacing.two, paddingVertical: 4,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.paperCard,
  },
  pickerChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  pickerChipText: { ...T.tag, color: Colors.walnut, fontSize: 11 },
  pickerChipTextActive: { ...T.tag, color: Colors.paper, fontSize: 11 },

  saveBtn: { backgroundColor: Colors.ink, borderRadius: Radius.md, paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two },
  disabled: { opacity: 0.6 },
  saveText: { ...T.buttonPrimary, color: Colors.paper },
  deleteBtn: { borderWidth: 1.5, borderColor: Colors.accent, borderRadius: Radius.md, paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two },
  deleteText: { ...T.buttonPrimary, color: Colors.accent, fontWeight: '600', fontSize: 15 },
});
