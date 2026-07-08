import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, ActivityIndicator, Alert, Modal,
  SafeAreaView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { aiDetectMultiItems, aiStandardizeGarment, CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS, AIMeta } from '@/lib/ai';
import { consumePendingImages } from '@/lib/pendingImages';
import { uploadWardrobeImage } from '@/lib/uploadImage';
import { ClothingCategory, CLOTHING_CATEGORIES_WITH_ALL, OCCASION_TAGS, FitType, DetectedItem } from '@/types';
import { AIResultBanner } from '@/components/AIResultBanner';
import { AILoading } from '@/components/AILoading';
import { CategoryIcon } from '@/components/CategoryIcon';

const isWeb = Platform.OS === 'web';

const CATEGORIES = CLOTHING_CATEGORIES_WITH_ALL.filter(c => c !== '全部') as ClothingCategory[];
const FIT_OPTIONS: FitType[] = ['超紧身', '修身', '常规合身', '宽松', '廓形'];
const SEASON_OPTIONS = [
  { id: 'spring', label: '春' },
  { id: 'summer', label: '夏' },
  { id: 'autumn', label: '秋' },
  { id: 'winter', label: '冬' },
  { id: 'all_season', label: '四季' },
] as const;

type PickerField = 'category' | 'color' | 'material';

export default function AddWardrobeItem() {
  const { user } = useUserStore();
  const { addItem } = useWardrobeStore();
  const { images: imagesParam } = useLocalSearchParams<{ images?: string }>();

  // Multi-image import: all source images and their detection results
  const [imageSources, setImageSources] = useState<string[]>([]);
  const [detectingImages, setDetectingImages] = useState(false);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClothingCategory>('上装');
  const [color, setColor] = useState('');
  const [material, setMaterial] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [fitType, setFitType] = useState<string>('');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [occasionTags, setOccasionTags] = useState<string[]>([]);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerField, setPickerField] = useState<PickerField | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Multi-item detection state
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showItemPicker, setShowItemPicker] = useState(false);

  // Item queue: sequential confirm flow for multi-item import
  const [itemQueue, setItemQueue] = useState<DetectedItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [pendingAdvance, setPendingAdvance] = useState(false); // set true after save, effect handles advance

  // Standardization state
  const [photoType, setPhotoType] = useState<string>('flat');
  const [standardizedUri, setStandardizedUri] = useState<string | null>(null);
  const [stdState, setStdState] = useState<'idle' | 'generating' | 'done' | 'failed'>('idle');
  const [useStandardized, setUseStandardized] = useState(true);
  const [recognizeMeta, setRecognizeMeta] = useState<AIMeta | null>(null);
  const [stdMeta, setStdMeta] = useState<AIMeta | null>(null);

  const reqTokenRef = useRef(0);

  // Process images passed from AddClothingSheet or onboarding
  useEffect(() => {
    // Prefer global pendingImages (reliable across stacks), fall back to route params
    const pending = consumePendingImages();
    const imageUris = pending || (imagesParam ? (() => { try { return JSON.parse(imagesParam); } catch { return null; } })() : null);
    if (!imageUris || imageUris.length === 0) return;
    console.log('[wardrobe/add] received images, count:', imageUris.length, 'source:', pending ? 'global' : 'params');
    let cancelled = false;
    const uris = imageUris;

    setImageSources(uris);
    setImageUri(uris[0]);

    if (uris.length === 1) {
      // Single image — use existing single-image flow
      runRecognition(uris[0]);
    } else {
      // Multiple images — detect all in parallel, then show combined picker
      setDetectingImages(true);
      setRecognizing(true);
      Promise.all(uris.map((uri: string) => aiDetectMultiItems(uri).catch(() => ({ items: [], meta: { source: 'mock', durationMs: 0, ok: false } }))))
        .then(results => {
          if (cancelled) return;
          setRecognizing(false);
          setDetectingImages(false);

          // Collect all items, tag each with its source image URI
          const allItems: (DetectedItem & { sourceImageUri: string })[] = [];
          results.forEach((result, imgIdx) => {
            result.items.forEach((item: any) => {
              allItems.push({ ...item, sourceImageUri: uris[imgIdx] });
            });
          });

          if (allItems.length === 0) {
            return;
          }

          if (allItems.length === 1) {
            const item = allItems[0];
            setImageUri(item.sourceImageUri);
            fillFormFromDetected(item);
            const token = reqTokenRef.current;
            void runStandardize(item.sourceImageUri, item.category, photoType, token, { color: item.color, material: item.material, description: item.description });
          } else {
            // Show combined picker
            setDetectedItems(allItems as any);
            setSelectedIndices(new Set(allItems.map((_, i) => i)));
            setShowItemPicker(true);
          }
        });
    }

    return () => { cancelled = true; };
  }, [imagesParam]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限', '需要相册权限才能选择图片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      runRecognition(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限', '需要相机权限才能拍照');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      runRecognition(result.assets[0].uri);
    }
  };

  const toggleSeason = (id: string) => {
    setSeasons(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleOccasion = (id: string) => {
    setOccasionTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const toggleDetectedItem = (idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const resetForm = () => {
    setName(''); setCategory('上装'); setColor(''); setMaterial('');
    setBrand(''); setPrice(''); setFitType(''); setSeasons([]);
    setOccasionTags([]); setPurchaseDate('');
    setStandardizedUri(null); setStdState('idle'); setUseStandardized(true);
    setStdMeta(null);
  };

  const fillFormFromDetected = (item: DetectedItem) => {
    setCategory(item.category);
    setColor(item.color);
    if (item.material) setMaterial(item.material);
    setName(item.description || `${item.color}${item.category}`);
    if (item.fit_type) setFitType(item.fit_type);
    if (item.season?.length) setSeasons(item.season);
    if (item.occasion_tags?.length) setOccasionTags(item.occasion_tags);
  };

  const runStandardize = async (uri: string, cat: string, pt: string, token: number, extras?: { color?: string; material?: string; description?: string }) => {
    setStdState('generating');
    const { url, meta } = await aiStandardizeGarment(uri, cat, pt, extras);
    if (reqTokenRef.current !== token) return;
    setStdMeta(meta);
    if (url) { setStandardizedUri(url); setUseStandardized(true); setStdState('done'); }
    else { setStdState('failed'); }
  };

  const runRecognition = async (uri: string) => {
    const token = ++reqTokenRef.current;
    setRecognizing(true);
    setRecognizeMeta(null); setStdMeta(null);
    setStandardizedUri(null); setStdState('idle');
    setDetectedItems([]); setSelectedIndices(new Set()); setShowItemPicker(false);
    try {
      const { items, meta } = await aiDetectMultiItems(uri);
      if (reqTokenRef.current !== token) return;
      setRecognizeMeta(meta);

      if (items.length === 1) {
        // Single item — skip picker, fill form directly
        fillFormFromDetected(items[0]);
        const pt = photoType;
        void runStandardize(uri, items[0].category, pt, token, { color: items[0].color, material: items[0].material, description: items[0].description });
      } else {
        // Multiple items — show picker
        setDetectedItems(items);
        setSelectedIndices(new Set([0])); // pre-select first
        setShowItemPicker(true);
      }
    } finally {
      if (reqTokenRef.current === token) setRecognizing(false);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedIndices.size === 0) return;
    const sortedIndices = [...selectedIndices].sort();
    const queue = sortedIndices.map(i => detectedItems[i]);
    setItemQueue(queue);
    setQueueTotal(queue.length);
    setShowItemPicker(false);

    // Fill form with first item and start standardization using its source image
    const firstItem = queue[0] as any;
    const sourceUri = firstItem.sourceImageUri ?? imageUri;
    setImageUri(sourceUri);
    resetForm();
    fillFormFromDetected(firstItem);
    const token = reqTokenRef.current;
    void runStandardize(sourceUri, firstItem.category, photoType, token, { color: firstItem.color, material: firstItem.material, description: firstItem.description });
  };

  // useEffect drives the queue advance after a successful save.
  useEffect(() => {
    if (!pendingAdvance) return;
    setPendingAdvance(false);

    const remainingQueue = itemQueue.slice(1);
    setItemQueue(remainingQueue);

    if (remainingQueue.length > 0) {
      const nextItem = remainingQueue[0] as any;
      const sourceUri = nextItem.sourceImageUri ?? imageUri;
      setImageUri(sourceUri);
      resetForm();
      fillFormFromDetected(nextItem);
      const token = reqTokenRef.current;
      void runStandardize(sourceUri, nextItem.category, photoType, token, { color: nextItem.color, material: nextItem.material, description: nextItem.description });
    } else {
      setQueueTotal(0);
      router.back();
    }
  }, [pendingAdvance]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请填写衣物名称');
      return;
    }
    if (!user) return;
    setSaving(true);

    try {
      // Determine the image to save
      let finalImageUrl = imageUri;
      const chosen = (useStandardized && standardizedUri) ? standardizedUri : imageUri;
      if (chosen) {
        const uploaded = await uploadWardrobeImage(chosen, user.id);
        if (uploaded) finalImageUrl = uploaded;
        else finalImageUrl = imageUri;
      }

      const saved = await addItem({
        user_id: user.id,
        name: name.trim(),
        category,
        color,
        material: material || undefined,
        brand: brand || undefined,
        price: price ? parseFloat(price) : undefined,
        fit_type: (fitType || undefined) as FitType | undefined,
        season: seasons.length > 0 ? seasons as any : undefined,
        occasion_tags: occasionTags.length > 0 ? occasionTags : undefined,
        purchase_date: purchaseDate || undefined,
        image_url: finalImageUrl ?? undefined,
        source_type: imageUri ? 'photo_ai' : 'manual',
        source_label: imageUri ? '拍照识别' : '手动添加',
        status: 'active',
      });

      if (!saved) {
        Alert.alert('保存失败', '请稍后重试');
        return;
      }

      // Signal the effect to advance the queue
      setPendingAdvance(true);
    } catch (e) {
      console.warn('[AddWardrobe] Save failed:', e);
      Alert.alert('保存出错', '请稍后重试');
    } finally {
      setSaving(false);
    }
  }, [user, name, category, color, material, brand, price, fitType, seasons, occasionTags, purchaseDate, imageUri, useStandardized, standardizedUri, addItem]);

  const pickerOptions: Record<PickerField, string[]> = {
    category: CATEGORY_OPTIONS,
    color: COLOR_OPTIONS,
    material: MATERIAL_OPTIONS,
  };

  const pickerTitles: Record<PickerField, string> = {
    category: '选择分类',
    color: '选择颜色',
    material: '选择材质',
  };

  const handlePickerSelect = (value: string) => {
    if (pickerField === 'category') setCategory(value as ClothingCategory);
    if (pickerField === 'color') setColor(value);
    if (pickerField === 'material') setMaterial(value);
    setPickerField(null);
  };

  const currentPickerValue = pickerField === 'category' ? category
    : pickerField === 'color' ? color
    : material;

  const pickerSheet = (
    <>
      <TouchableOpacity
        style={styles.modalBackdrop}
        onPress={() => setPickerField(null)}
      />
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {pickerField ? pickerTitles[pickerField] : ''}
          </Text>
          <TouchableOpacity onPress={() => setPickerField(null)}>
            <Text style={styles.modalClose}>完成</Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {pickerField ? pickerOptions[pickerField].map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.pickerOption, opt === currentPickerValue && styles.pickerOptionActive]}
              onPress={() => handlePickerSelect(opt)}
            >
              <Text style={[
                styles.pickerOptionText,
                opt === currentPickerValue && styles.pickerOptionTextActive,
              ]}>
                {opt}
              </Text>
              {opt === currentPickerValue ? <Feather name="check" size={16} color={Colors.sage} /> : null}
            </TouchableOpacity>
          )) : null}
        </ScrollView>
      </View>
    </>
  );

  return (
    <>
      <Stack.Screen options={{ presentation: isWeb ? 'card' : 'modal' }} />
      <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerActionBtn}>
          <Feather name="x-circle" size={16} color={Colors.walnut} />
          <Text style={styles.cancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {queueTotal > 1 ? `添加衣物 (${queueTotal - itemQueue.length + 1}/${queueTotal})` : '添加衣物'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim()}>
          {saving
            ? <ActivityIndicator size="small" color={Colors.terracotta} />
            : <Text style={[styles.save, !name.trim() && styles.saveDisabled]}>
                {itemQueue.length > 1
                  ? `保存 (还有${itemQueue.length - 1}件)`
                  : '保存'}
              </Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Multi-image thumbnails */}
        {imageSources.length > 1 ? (
          <View style={styles.thumbRow}>
            {imageSources.map((uri, idx) => (
              <TouchableOpacity
                key={`thumb-${idx}`}
                style={[styles.thumbItem, uri === imageUri && styles.thumbItemActive]}
                onPress={() => setImageUri(uri)}
              >
                <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                <Text style={styles.thumbLabel}>图{idx + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* Image Section */}
        <View style={styles.imageSection}>
          {imageUri ? (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: useStandardized && standardizedUri ? standardizedUri : imageUri }}
                style={styles.image}
                resizeMode="contain"
              />
              {recognizing ? (
                <View style={styles.recognizingOverlay}>
                  <ActivityIndicator color={Colors.paper} />
                  <Text style={styles.recognizingText}>AI 识别中…</Text>
                </View>
              ) : null}
              {stdState === 'generating' ? (
                <View style={styles.stdBadge}>
                  <ActivityIndicator size="small" color={Colors.paper} />
                  <Text style={styles.stdBadgeText}>标准化中…</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialCommunityIcons name="hanger" size={44} color={Colors.walnut2} />
              <Text style={styles.placeholderText}>添加图片</Text>
            </View>
          )}

          {stdState === 'done' ? (
            <View style={styles.stdToggleRow}>
              <TouchableOpacity
                style={[styles.stdToggleBtn, !useStandardized && styles.stdToggleBtnActive]}
                onPress={() => setUseStandardized(false)}
              >
                <Text style={[styles.stdToggleBtnText, !useStandardized && styles.stdToggleBtnTextActive]}>原图</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stdToggleBtn, useStandardized && styles.stdToggleBtnActive]}
                onPress={() => setUseStandardized(true)}
              >
                <Text style={[styles.stdToggleBtnText, useStandardized && styles.stdToggleBtnTextActive]}>标准图</Text>
              </TouchableOpacity>
              <Text style={styles.stdDoneCaption}>已生成标准图</Text>
            </View>
          ) : null}
          {stdState === 'failed' ? (
            <View style={styles.stdFailedRow}>
              <Text style={styles.stdFailedCaption}>标准图生成失败</Text>
              <TouchableOpacity
                style={styles.stdRetryBtn}
                onPress={() => {
                  if (!imageUri) return;
                  const token = ++reqTokenRef.current;
                  void runStandardize(imageUri, category, photoType, token, { color, material, description: name });
                }}
              >
                <Feather name="refresh-cw" size={13} color={Colors.terracotta} />
                <Text style={styles.stdRetryBtnText}>重试</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stdUseOriginalBtn}
                onPress={() => { setUseStandardized(false); }}
              >
                <Text style={styles.stdUseOriginalBtnText}>用原图保存</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.imageActions}>
            {!isWeb ? (
              <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
                <Feather name="camera" size={15} color={Colors.ink} />
                <Text style={styles.imageBtnText}>拍照</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
              <Feather name="image" size={15} color={Colors.ink} />
              <Text style={styles.imageBtnText}>{isWeb ? '选择图片' : '相册'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {recognizing ? (
          <View style={styles.recognizingBanner}>
            <ActivityIndicator size="small" color={Colors.terracotta} />
            <Text style={styles.recognizingBannerText}>AI 正在识别衣物属性…</Text>
          </View>
        ) : null}

        {/* Multi-item picker */}
        {showItemPicker && detectedItems.length > 1 ? (
          <View style={styles.itemPickerCard}>
            <View style={styles.itemPickerHeader}>
              <Text style={styles.itemPickerTitle}>
                {imageSources.length > 1
                  ? `${imageSources.length}张图片中检测到 ${detectedItems.length} 件单品`
                  : `图片中检测到 ${detectedItems.length} 件单品`}
              </Text>
              <TouchableOpacity onPress={() => {
                const all = new Set(detectedItems.map((_, i) => i));
                setSelectedIndices(prev => prev.size === detectedItems.length ? new Set() : all);
              }}>
                <Text style={styles.itemPickerSelectAll}>
                  {selectedIndices.size === detectedItems.length ? '取消全选' : '全选'}
                </Text>
              </TouchableOpacity>
            </View>
            {detectedItems.map((item, idx) => {
              const isSelected = selectedIndices.has(idx);
              const sourceItem = item as any;
              const imgLabel = imageSources.length > 1 && sourceItem.sourceImageUri
                ? `图${imageSources.indexOf(sourceItem.sourceImageUri) + 1}`
                : '';
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.detectedItemRow, isSelected && styles.detectedItemRowActive]}
                  onPress={() => toggleDetectedItem(idx)}
                >
                  <View style={[styles.detectedItemIcon, isSelected && styles.detectedItemIconActive]}>
                    <CategoryIcon category={item.category} size={20} color={isSelected ? Colors.paper : Colors.ink} />
                  </View>
                  <View style={styles.detectedItemInfo}>
                    <Text style={[styles.detectedItemDesc, isSelected && styles.detectedItemDescActive]}>
                      {item.description}
                    </Text>
                    <Text style={styles.detectedItemMeta}>
                      {imgLabel ? `${imgLabel} · ` : ''}{item.category} · {item.color}{item.material ? ` · ${item.material}` : ''}
                    </Text>
                  </View>
                  {isSelected ? (
                    <View style={styles.detectedItemCheck}>
                      <Feather name="check" size={14} color={Colors.paper} />
                    </View>
                  ) : (
                    <View style={styles.detectedItemUncheck} />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.confirmBtn, selectedIndices.size === 0 && styles.confirmBtnDisabled]}
              onPress={handleConfirmSelection}
              disabled={selectedIndices.size === 0}
            >
              <Text style={styles.confirmBtnText}>
                确认导入 {selectedIndices.size} 件
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {recognizeMeta && <AIResultBanner {...recognizeMeta} />}
        {stdState !== 'idle' && stdState !== 'generating' && stdMeta && <AIResultBanner {...stdMeta} />}

        {/* Form — only visible when not in item picker mode or after selection */}
        {!showItemPicker ? (
          <View style={styles.form}>
            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>名称 *</Text>
              <TextInput
                style={styles.input}
                placeholder="例如：白色棉质T恤"
                placeholderTextColor={Colors.walnut2}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text style={styles.label}>分类</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              >
                <Text style={styles.selectText}>{category}</Text>
                <Text style={styles.selectArrow}>›</Text>
              </TouchableOpacity>
              {showCategoryPicker ? (
                <View style={styles.pickerGrid}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat} style={[styles.gridOption, category === cat && styles.gridOptionActive]} onPress={() => { setCategory(cat); setShowCategoryPicker(false); }}>
                      <Text style={[styles.gridOptionText, category === cat && styles.gridOptionTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Color */}
            <View style={styles.field}>
              <Text style={styles.label}>颜色</Text>
              <TextInput
                style={styles.input}
                placeholder="输入或选择颜色"
                placeholderTextColor={Colors.walnut2}
                value={color}
                onChangeText={setColor}
                onFocus={() => setShowColorPicker(true)}
              />
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
              <Text style={styles.label}>材质</Text>
              <TextInput
                style={styles.input}
                placeholder="输入或选择材质"
                placeholderTextColor={Colors.walnut2}
                value={material}
                onChangeText={setMaterial}
                onFocus={() => setShowMaterialPicker(true)}
              />
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
              <Text style={styles.label}>品牌</Text>
              <TextInput
                style={styles.input}
                placeholder="可选"
                placeholderTextColor={Colors.walnut2}
                value={brand}
                onChangeText={setBrand}
              />
            </View>

            {/* Price */}
            <View style={styles.field}>
              <Text style={styles.label}>价格</Text>
              <TextInput
                style={styles.input}
                placeholder="可选"
                placeholderTextColor={Colors.walnut2}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
            </View>

            {/* Fit Type */}
            <View style={styles.field}>
              <Text style={styles.label}>版型</Text>
              <View style={styles.pickerGrid}>
                {FIT_OPTIONS.map(fit => (
                  <TouchableOpacity key={fit} style={[styles.gridOption, fitType === fit && styles.gridOptionActive]} onPress={() => setFitType(fitType === fit ? '' : fit)}>
                    <Text style={[styles.gridOptionText, fitType === fit && styles.gridOptionTextActive]}>{fit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Purchase Date */}
            <View style={styles.field}>
              <Text style={styles.label}>购买日期</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.walnut2}
                value={purchaseDate}
                onChangeText={setPurchaseDate}
              />
            </View>

            {/* Season */}
            <View style={styles.field}>
              <Text style={styles.label}>季节</Text>
              <View style={styles.pickerGrid}>
                {SEASON_OPTIONS.map(s => (
                  <TouchableOpacity key={s.id} style={[styles.gridOption, seasons.includes(s.id) && styles.gridOptionActive]} onPress={() => toggleSeason(s.id)}>
                    <Text style={[styles.gridOptionText, seasons.includes(s.id) && styles.gridOptionTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Occasion Tags */}
            <View style={styles.field}>
              <Text style={styles.label}>场合标签</Text>
              <View style={styles.pickerGrid}>
                {OCCASION_TAGS.map(tag => (
                  <TouchableOpacity key={tag.id} style={[styles.gridOption, occasionTags.includes(tag.id) && styles.gridOptionActive]} onPress={() => toggleOccasion(tag.id)}>
                    <Text style={[styles.gridOptionText, occasionTags.includes(tag.id) && styles.gridOptionTextActive]}>{tag.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {saving ? (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color={Colors.paper} />
          <Text style={styles.savingTitle}>
            {queueTotal > 1 ? `正在导入 (${queueTotal - itemQueue.length + 1}/${queueTotal})…` : '正在导入单品…'}
          </Text>
          <Text style={styles.savingSub}>上传图片并保存到衣橱</Text>
        </View>
      ) : null}

      {/* Picker Modal (legacy for non-grid pickers) */}
      {pickerField ? (
        isWeb ? (
          <View style={styles.webLayer}>{pickerSheet}</View>
        ) : (
          <Modal visible transparent animationType="slide" onRequestClose={() => setPickerField(null)}>
            {pickerSheet}
          </Modal>
        )
      ) : null}

      {recognizing ? (
        <View style={styles.aiLoadingLayer}>
          <AILoading
            title={detectingImages ? 'AI 正在识别多张图片' : 'AI 正在识别衣物'}
            subtitle={detectingImages ? `正在分析 ${imageSources.length} 张图片中的单品...` : '正在解析单品属性...'}
            steps={['读取图片', '识别衣物轮廓', '解析颜色材质', '生成单品信息']}
            durationMs={imageSources.length > 1 ? 12000 : 8000}
          />
        </View>
      ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
  },
  aiLoadingLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
  },
  safe: { flex: 1, backgroundColor: Colors.paper, position: 'relative' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  headerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cancel: { ...T.buttonSecondary, color: Colors.walnut },
  title: { ...T.subTitle },
  save: { ...T.buttonSecondary, color: Colors.terracotta },
  saveDisabled: { color: Colors.walnut2 },
  content: { padding: Spacing.four, gap: Spacing.three },
  thumbRow: { flexDirection: 'row', gap: Spacing.two },
  thumbItem: {
    width: 56, height: 56, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent', alignItems: 'center',
  },
  thumbItemActive: { borderColor: Colors.ink },
  thumbImage: { width: 56, height: 56, borderRadius: Radius.md - 2 },
  thumbLabel: { ...T.micro, fontSize: 9, color: Colors.walnut2, marginTop: 1, textAlign: 'center' },
  imageSection: { gap: Spacing.two },
  imageContainer: {
    minHeight: 200, maxHeight: 400, borderRadius: Radius.lg, overflow: 'hidden',
    backgroundColor: Colors.paperCard,
  },
  image: { width: '100%', height: '100%' },
  recognizingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  recognizingText: { color: Colors.paper, fontSize: 14 },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  savingTitle: { ...T.bodyText, color: Colors.paper, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  savingSub: { ...T.micro, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  stdBadge: {
    position: 'absolute',
    bottom: Spacing.two,
    right: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  stdBadgeText: { color: Colors.paper, fontSize: 12 },
  stdToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  stdToggleBtn: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
  },
  stdToggleBtnActive: {
    backgroundColor: Colors.signalSoft,
    borderColor: Colors.ink,
  },
  stdToggleBtnText: { ...T.itemDesc, color: Colors.ink },
  stdToggleBtnTextActive: { ...T.itemDesc, color: Colors.ink },
  stdDoneCaption: { ...T.itemDesc, color: Colors.walnut2, flex: 1, textAlign: 'right' },
  stdFailedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stdFailedCaption: { ...T.itemDesc, color: Colors.walnut2 },
  stdRetryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.two, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.terracotta, backgroundColor: Colors.paper,
  },
  stdRetryBtnText: { ...T.tag, color: Colors.terracotta },
  stdUseOriginalBtn: {
    paddingHorizontal: Spacing.two, paddingVertical: 4,
    borderRadius: 10, backgroundColor: Colors.ink,
  },
  stdUseOriginalBtnText: { ...T.tag, color: Colors.paper },
  imagePlaceholder: {
    height: 240, borderRadius: Radius.lg,
    backgroundColor: Colors.paperCard,
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.linen, borderStyle: 'dashed',
  },
  placeholderText: { ...T.itemDesc, fontSize: 14 },
  imageActions: { flexDirection: 'row', gap: Spacing.two },
  imageBtn: {
    flex: 1,
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  imageBtnText: { ...T.buttonSecondary, color: Colors.ink },
  recognizingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.signalSoft,
    borderRadius: Radius.md,
    padding: Spacing.two + 4,
    borderWidth: 1,
    borderColor: Colors.linen,
  },
  recognizingBannerText: { ...T.itemDesc },

  // Multi-item picker
  itemPickerCard: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
    ...Shadow.one,
  },
  itemPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  itemPickerTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold },
  itemPickerSelectAll: { ...T.buttonSecondary, color: Colors.terracotta },
  detectedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    gap: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lineSoft,
  },
  detectedItemRowActive: {
    backgroundColor: Colors.signalSoft,
  },
  detectedItemIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.paper,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.lineStrong,
  },
  detectedItemIconActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  detectedItemInfo: { flex: 1, gap: 2 },
  detectedItemDesc: { ...T.bodyText, fontSize: 14 },
  detectedItemDescActive: { color: Colors.ink, fontFamily: Fonts.uiSemiBold },
  detectedItemMeta: { ...T.micro, color: Colors.walnut },
  detectedItemCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  detectedItemUncheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: Colors.lineStrong,
  },
  confirmBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    marginHorizontal: Spacing.three,
    marginVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  confirmBtnDisabled: { backgroundColor: Colors.walnut2 },
  confirmBtnText: { ...T.buttonPrimary, color: Colors.paper },

  form: { gap: Spacing.two },
  field: { gap: Spacing.one },
  label: { ...T.formLabel },
  input: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    color: Colors.ink,
  },
  select: {
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: { ...T.inputText, color: Colors.ink },
  selectArrow: { fontSize: 16, color: Colors.walnut2 },
  placeholder: { color: Colors.walnut2 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  gridOption: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
  },
  gridOptionActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  gridOptionText: { ...T.tag, color: Colors.ink },
  gridOptionTextActive: { ...T.tag, color: Colors.paper },
  pickerWrap: { marginTop: Spacing.one },
  pickerRow: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  pickerChip: {
    paddingHorizontal: Spacing.two, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.lineStrong, backgroundColor: Colors.paper,
  },
  pickerChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  pickerChipText: { ...T.tag, color: Colors.ink, fontSize: 11 },
  pickerChipTextActive: { ...T.tag, color: Colors.paper, fontSize: 11 },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex1: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalContent: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '60%',
    ...Shadow.two,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  modalTitle: { ...T.subTitle },
  modalClose: { ...T.buttonSecondary, color: Colors.terracotta },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lineSoft,
  },
  pickerOptionActive: { backgroundColor: Colors.signalSoft },
  pickerOptionText: { ...T.itemName, fontSize: 16 },
  pickerOptionTextActive: { ...T.itemName, fontSize: 16, color: Colors.terracotta },
});
