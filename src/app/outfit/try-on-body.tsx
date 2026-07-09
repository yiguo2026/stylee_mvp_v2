import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Image, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';
import { useTryOnStore } from '@/stores/tryonStore';
import { useUserStore } from '@/stores/userStore';
import { saveSelfie } from '@/lib/bodyModel';
import { showToast } from '@/components/Toast';

const isWeb = Platform.OS === 'web';

// Compress image to a small data URL for localStorage persistence
async function compressToDataUrl(uri: string, maxWidth = 200): Promise<string> {
  if (isWeb) {
    return new Promise((resolve) => {
      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(uri);
      img.src = uri;
    });
  }
  // Native: use ImageManipulator or just return base64 from picker
  return uri;
}

export default function TryOnBodyPage() {
  const { selfieUri, setSelfie } = useTryOnStore();
  const { user } = useUserStore();
  const [localUri, setLocalUri] = useState<string | null>(selfieUri);
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('需要相册权限才能选择照片', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      // Build a display URI and a compressed version for storage
      if (asset.base64) {
        const mimeType = asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const fullDataUrl = `data:${mimeType};base64,${asset.base64}`;
        // Compress for localStorage
        try {
          const compressed = await compressToDataUrl(fullDataUrl);
          setLocalUri(compressed);
        } catch {
          setLocalUri(fullDataUrl);
        }
      } else {
        try {
          const compressed = await compressToDataUrl(asset.uri);
          setLocalUri(compressed);
        } catch {
          setLocalUri(asset.uri);
        }
      }
    }
  };

  const handleSave = async () => {
    if (!localUri || !user?.id) return;
    setSaving(true);
    // Upload to Supabase and get persistent URL
    const serverUrl = await saveSelfie(localUri, user.id);
    // Use server URL if available, otherwise fall back to local URI
    setSelfie(serverUrl || localUri);
    setSaving(false);
    if (router.canGoBack()) router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>身体信息</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Description */}
        <Text style={styles.desc}>
          上传照片帮助 AI 生成更贴合你的试穿效果，首次录入后无需重复填写（* 为必填）
        </Text>

        {/* Selfie Upload */}
        <Text style={styles.fieldLabel}>上传面部自拍 *</Text>

        <TouchableOpacity style={styles.photoCard} onPress={pickImage} activeOpacity={0.7}>
          {localUri ? (
            <Image source={{ uri: localUri }} style={styles.photoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoLabel}>点击上传自拍照</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Photo Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>拍摄建议</Text>
          <Text style={styles.tipItem}>• 面部正面清晰可见，光线充足均匀</Text>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyCard}>
          <Text style={styles.privacyText}>照片仅用于AI试穿效果生成，安全存储在您的账户中。</Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, (!localUri || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!localUri || saving}
        >
          {saving
            ? <ActivityIndicator color={Colors.paper} size="small" />
            : <Text style={styles.saveBtnText}>保存身体信息</Text>
          }
        </TouchableOpacity>
      </ScrollView>
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
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },

  desc: {
    ...T.bodyText, fontSize: 13, color: Colors.walnut, lineHeight: 22,
  },
  fieldLabel: {
    ...T.formLabel, fontSize: 15, fontFamily: Fonts.uiSemiBold, color: Colors.ink,
  },

  photoCard: {
    aspectRatio: 3 / 4, borderRadius: Radius.lg,
    overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.line,
    borderStyle: 'dashed', backgroundColor: Colors.paperCard,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: Spacing.one,
  },
  photoLabel: { ...T.bodyText, fontSize: 13, color: Colors.walnut },

  tipsCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.line,
  },
  tipsTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 14, color: Colors.ink },
  tipItem: { ...T.bodyText, fontSize: 13, color: Colors.walnut, lineHeight: 22 },

  privacyCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.signalSoft, borderRadius: Radius.md,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
  },
  privacyText: { ...T.micro, color: Colors.ink, flex: 1, lineHeight: 18 },

  saveBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 16 },
});
