import { useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Colors, Fonts, Radius, Spacing, T } from '@/constants/theme';
import { CLOTHING_CATEGORIES, type ClothingCategory, type Season } from '@/types';
import { gammaImport, type GammaImportItem, type GammaImportResponse } from '@/lib/gammaService';
import { uploadWardrobeImage } from '@/lib/uploadImage';
import { useUserStore } from '@/stores/userStore';
import { useWardrobeStore } from '@/stores/wardrobeStore';
import { showToast } from '@/components/Toast';

const seasonMap: Record<string, Season> = {
  spring: '春', summer: '夏', autumn: '秋', fall: '秋', winter: '冬', all_season: '四季',
  春: '春', 夏: '夏', 秋: '秋', 冬: '冬', 四季: '四季',
};

export default function GammaImportScreen() {
  const { user } = useUserStore();
  const { addItem } = useWardrobeStore();
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [result, setResult] = useState<GammaImportResponse | null>(null);
  const [item, setItem] = useState<GammaImportItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showToast('需要相册权限才能导入图片', 'error'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    const uri = picked.assets[0].uri;
    setSourceUri(uri);
    setResult(null);
    setItem(null);
    setLoading(true);
    const response = await gammaImport(uri);
    setLoading(false);
    if (!response) { showToast('Gamma 导入失败，请检查 Model Service', 'error'); return; }
    setResult(response);
    setItem(response.item);
    if (response.error) showToast('识别完成，但标准图生成失败', 'info');
  };

  const patchItem = (updates: Partial<GammaImportItem>) => setItem(current => current ? { ...current, ...updates } : current);

  const save = async () => {
    if (!user || !item || !sourceUri) { showToast('请先登录并完成识别', 'error'); return; }
    if (!item.name.trim()) { showToast('请填写单品名称', 'error'); return; }
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (result?.standardized_image_url) {
        imageUrl = await uploadWardrobeImage(result.standardized_image_url, user.id, 'gamma', { persistRemote: true, timeoutMs: 45000 });
      }
      if (!imageUrl) imageUrl = await uploadWardrobeImage(sourceUri, user.id, 'gamma');
      if (!imageUrl) { showToast('图片保存失败，请稍后重试', 'error'); return; }

      const seasons = (item.season ?? []).map(x => seasonMap[x]).filter(Boolean) as Season[];
      const saved = await addItem({
        user_id: user.id,
        name: item.name.trim(),
        category: item.category as ClothingCategory,
        color: item.color || '未识别',
        material: item.material || undefined,
        brand: item.brand || undefined,
        fit_type: item.fit_type || undefined,
        sleeve_length: item.sleeve_length || undefined,
        season: seasons.length ? seasons : undefined,
        occasion_tags: item.occasion_tags?.length ? item.occasion_tags : undefined,
        image_url: imageUrl,
        ai_recognized_attrs: { engine: 'gamma', style: item.style, photo_type: item.photo_type, trace: result?.trace },
        source_type: 'photo_ai', source_label: 'Gamma 导入', status: 'active',
      });
      if (!saved) { showToast('衣橱保存失败', 'error'); return; }
      showToast('已通过 Gamma 加入衣橱', 'success');
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const preview = result?.standardized_image_url || sourceUri;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Gamma 导入</Text><View style={styles.headerSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.imageBox} onPress={pick} disabled={loading}>
          {preview ? <Image source={{ uri: preview }} style={styles.image} resizeMode="contain" /> : <Text style={styles.pickText}>选择一张衣服图片</Text>}
          {loading && <View style={styles.loadingCover}><ActivityIndicator color={Colors.paper} /><Text style={styles.loadingText}>Qwen 正在识别并生成标准图…</Text></View>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={pick} disabled={loading}>
          <Text style={styles.secondaryText}>{sourceUri ? '重新选择' : '从相册选择'}</Text>
        </TouchableOpacity>

        {item && <View style={styles.form}>
          <Text style={styles.sectionTitle}>识别结果（可修改）</Text>
          <Text style={styles.label}>名称</Text>
          <TextInput value={item.name} onChangeText={name => patchItem({ name })} style={styles.input} />
          <Text style={styles.label}>类别</Text>
          <View style={styles.chips}>{CLOTHING_CATEGORIES.map(category =>
            <TouchableOpacity key={category} style={[styles.chip, item.category === category && styles.chipActive]} onPress={() => patchItem({ category })}>
              <Text style={[styles.chipText, item.category === category && styles.chipTextActive]}>{category}</Text>
            </TouchableOpacity>)}</View>
          <Text style={styles.label}>颜色</Text>
          <TextInput value={item.color} onChangeText={color => patchItem({ color })} style={styles.input} />
          <Text style={styles.label}>材质</Text>
          <TextInput value={item.material ?? ''} onChangeText={material => patchItem({ material })} style={styles.input} />
          <Text style={styles.meta}>耗时 {(result!.trace.duration_ms / 1000).toFixed(1)}s · {result!.trace.vision_model} + {result!.trace.edit_model}</Text>
          {result?.error ? <Text style={styles.warning}>标准图未生成，保存时将使用原图。</Text> : null}
          <TouchableOpacity style={styles.primary} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.paper} /> : <Text style={styles.primaryText}>确认加入衣橱</Text>}
          </TouchableOpacity>
        </View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.line },
  back: { ...T.bodyText, width: 64 }, headerTitle: { ...T.sectionTitle }, headerSide: { width: 64 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  imageBox: { height: 330, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.paperRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.lineStrong },
  image: { width: '100%', height: '100%' }, pickText: { ...T.bodyText, color: Colors.gray1 },
  loadingCover: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,.68)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: Fonts.ui, color: Colors.paper, fontSize: 14 },
  secondary: { alignItems: 'center', paddingVertical: Spacing.three }, secondaryText: { ...T.buttonSecondary, color: Colors.accent },
  form: { marginTop: Spacing.two }, sectionTitle: { ...T.sectionTitle, marginBottom: Spacing.three },
  label: { ...T.formLabel, marginTop: Spacing.three, marginBottom: Spacing.two },
  input: { ...T.inputText, borderWidth: 1, borderColor: Colors.lineStrong, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, color: Colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: Colors.paperRaised },
  chipActive: { backgroundColor: Colors.ink }, chipText: { ...T.tag }, chipTextActive: { color: Colors.paper },
  meta: { ...T.caption, marginTop: Spacing.three }, warning: { ...T.itemDesc, color: Colors.accent, marginTop: Spacing.two },
  primary: { height: 52, borderRadius: Radius.md, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.four },
  primaryText: { ...T.buttonPrimary, color: Colors.paper },
});
