import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Image, Alert, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, Shadow, T } from '@/constants/theme';
import { useTryOnStore } from '@/stores/tryonStore';

const isWeb = Platform.OS === 'web';

export default function TryOnBodyPage() {
  const { selfieUri, setSelfie } = useTryOnStore();
  const [localUri, setLocalUri] = useState<string | null>(selfieUri);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      if (isWeb) { window.alert('需要相册权限才能选择照片'); } else { Alert.alert('提示', '需要相册权限才能选择照片'); }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (isWeb) { window.alert('需要相机权限才能拍照'); } else { Alert.alert('提示', '需要相机权限才能拍照'); }
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalUri(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    setSelfie(localUri);
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
            <Image source={{ uri: localUri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoEmoji}>🤳</Text>
              <Text style={styles.photoLabel}>点击上传自拍照</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Photo Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>📸 拍摄建议</Text>
          <Text style={styles.tipItem}>• 面部正面清晰可见，光线充足均匀</Text>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyCard}>
          <Text style={styles.privacyIcon}>🔒</Text>
          <Text style={styles.privacyText}>照片仅用于AI试穿效果生成，不会上传至服务器。</Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, !localUri && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!localUri}
        >
          <Text style={styles.saveBtnText}>保存身体信息</Text>
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
    ...T.formLabel, fontSize: 15, fontWeight: '600', color: Colors.ink,
  },

  photoRow: { flexDirection: 'row', gap: Spacing.three },
  photoCard: {
    aspectRatio: 3 / 4, borderRadius: Radius.lg,
    overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.line,
    borderStyle: 'dashed', backgroundColor: Colors.paperCard,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: Spacing.one,
  },
  photoEmoji: { fontSize: 36 },
  photoLabel: { ...T.bodyText, fontSize: 13, color: Colors.walnut },

  tipsCard: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.lg,
    padding: Spacing.three, gap: Spacing.one,
    borderWidth: 1, borderColor: Colors.line,
  },
  tipsTitle: { ...T.bodyText, fontWeight: '600', fontSize: 14, color: Colors.ink },
  tipItem: { ...T.bodyText, fontSize: 13, color: Colors.walnut, lineHeight: 22 },

  privacyCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: '#F0EDFF', borderRadius: Radius.md,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
  },
  privacyIcon: { fontSize: 16 },
  privacyText: { ...T.micro, color: '#6C5CE7', flex: 1, lineHeight: 18 },

  saveBtn: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4, alignItems: 'center', marginTop: Spacing.two,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { ...T.buttonPrimary, color: Colors.paper, fontSize: 16 },
});
