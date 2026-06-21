import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, ActivityIndicator, Alert, Modal,
  SafeAreaView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { aiRecognizeClothing, CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS } from '@/lib/ai';
import { uploadWardrobeImage } from '@/lib/uploadImage';
import { ClothingCategory } from '@/types';

const isWeb = Platform.OS === 'web';

type PickerField = 'category' | 'color' | 'material';

export default function AddWardrobeItem() {
  const { user } = useUserStore();
  const { addItem } = useWardrobeStore();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ClothingCategory>('上装');
  const [color, setColor] = useState('');
  const [material, setMaterial] = useState('');
  const [brand, setBrand] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerField, setPickerField] = useState<PickerField | null>(null);

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

  const runRecognition = async (uri: string) => {
    setRecognizing(true);
    try {
      const result = await aiRecognizeClothing(uri);
      setCategory(result.category);
      setColor(result.color);
      if (result.material) setMaterial(result.material);
      if (!name) setName(`${result.color}${result.category}`);
    } finally {
      setRecognizing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请填写衣物名称');
      return;
    }
    if (!user) return;
    setSaving(true);

    // Try to upload image to Supabase Storage; fall back to local URI if not set up yet
    let finalImageUrl = imageUri;
    if (imageUri) {
      const uploaded = await uploadWardrobeImage(imageUri, user.id);
      if (uploaded) finalImageUrl = uploaded;
      // If upload fails, keep the local URI (works on same device)
    }

    const saved = await addItem({
      user_id: user.id,
      name: name.trim(),
      category,
      color,
      material: material || undefined,
      brand: brand || undefined,
      image_url: finalImageUrl ?? undefined,
      source_type: imageUri ? 'photo_ai' : 'manual',
      status: 'active',
    });
    setSaving(false);
    if (saved) {
      router.back();
    } else {
      Alert.alert('保存失败', '请稍后重试');
    }
  };

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.title}>添加衣物</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim()}>
          {saving
            ? <ActivityIndicator size="small" color={Colors.terracotta} />
            : <Text style={[styles.save, !name.trim() && styles.saveDisabled]}>保存</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Image Section */}
        <View style={styles.imageSection}>
          {imageUri ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
              {recognizing && (
                <View style={styles.recognizingOverlay}>
                  <ActivityIndicator color={Colors.paper} />
                  <Text style={styles.recognizingText}>AI 识别中…</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.imagePlaceholder}>
              <MaterialCommunityIcons name="hanger" size={44} color={Colors.walnut2} />
              <Text style={styles.placeholderText}>添加图片</Text>
            </View>
          )}
          <View style={styles.imageActions}>
            {!isWeb && (
              <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
                <Feather name="camera" size={15} color={Colors.ink} />
                <Text style={styles.imageBtnText}>拍照</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
              <Feather name="image" size={15} color={Colors.ink} />
              <Text style={styles.imageBtnText}>{isWeb ? '选择图片' : '相册'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {recognizing && (
          <View style={styles.recognizingBanner}>
            <ActivityIndicator size="small" color={Colors.terracotta} />
            <Text style={styles.recognizingBannerText}>AI 正在识别衣物属性…</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
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

          <View style={styles.row}>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>分类</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setPickerField('category')}
              >
                <Text style={styles.selectText}>{category}</Text>
                <Text style={styles.selectArrow}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.label}>颜色</Text>
              <TouchableOpacity
                style={styles.select}
                onPress={() => setPickerField('color')}
              >
                <Text style={[styles.selectText, !color && styles.placeholder]}>
                  {color || '选择'}
                </Text>
                <Text style={styles.selectArrow}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>材质</Text>
            <TouchableOpacity
              style={styles.select}
              onPress={() => setPickerField('material')}
            >
              <Text style={[styles.selectText, !material && styles.placeholder]}>
                {material || '选择材质（可选）'}
              </Text>
              <Text style={styles.selectArrow}>›</Text>
            </TouchableOpacity>
          </View>

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
        </View>
      </ScrollView>

      {/* Picker Modal */}
      <Modal visible={pickerField !== null} transparent animationType="slide">
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
            {pickerField && pickerOptions[pickerField].map(opt => (
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
                {opt === currentPickerValue && <Feather name="check" size={16} color={Colors.sage} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  cancel: { ...T.buttonSecondary, color: Colors.walnut },
  // 方正悠宋 — nav title
  title: { ...T.subTitle },
  save: { ...T.buttonSecondary, color: Colors.terracotta },
  saveDisabled: { color: Colors.walnut2 },
  content: { padding: Spacing.four, gap: Spacing.three },
  imageSection: { gap: Spacing.two },
  imageContainer: {
    height: 240, borderRadius: Radius.lg, overflow: 'hidden',
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
  imagePlaceholder: {
    height: 240, borderRadius: Radius.lg,
    backgroundColor: Colors.vintageCream,
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.linen, borderStyle: 'dashed',
  },
  // placeholderEmoji removed — now uses MaterialCommunityIcons hanger
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
    backgroundColor: Colors.vintageCream,
    borderRadius: Radius.md,
    padding: Spacing.two + 4,
    borderWidth: 1,
    borderColor: Colors.linen,
  },
  recognizingBannerText: { ...T.itemDesc },
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
  row: { flexDirection: 'row', gap: Spacing.two },
  flex1: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalContent: {
    backgroundColor: Colors.paperRaised,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  // 方正悠宋 — modal title
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
  pickerOptionActive: { backgroundColor: Colors.vintageCream },
  // 方正悠宋 — picker item text
  pickerOptionText: { ...T.itemName, fontSize: 16 },
  pickerOptionTextActive: { ...T.itemName, fontSize: 16, color: Colors.terracotta },
  // checkmark style removed — now uses Feather check icon directly
});
