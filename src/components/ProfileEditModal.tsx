import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Modal, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { useTryOnStore } from '@/stores/tryonStore';
import { supabase } from '@/lib/supabase';
import { uploadWardrobeImage } from '@/lib/uploadImage';
import { saveSelfie } from '@/lib/bodyModel';
import { Gender } from '@/types';
import { showToast } from '@/components/Toast';

const isWeb = Platform.OS === 'web';

const GENDERS: { label: string; value: Gender }[] = [
  { label: '女士', value: 'female' },
  { label: '男士', value: 'male' },
  { label: '其他', value: 'other' },
  { label: '保密', value: 'private' },
];

// Compress image to small data URL for localStorage
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
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(uri);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(uri);
      img.src = uri;
    });
  }
  return uri;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ProfileEditModal({ visible, onClose }: Props) {
  const { user, profile, fetchProfile } = useUserStore();
  const { selfieUri, setSelfie } = useTryOnStore();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [gender, setGender] = useState<Gender>(profile?.gender ?? 'female');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [city, setCity] = useState(profile?.permanent_city ?? '');
  const [profession, setProfession] = useState(profile?.profession ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [localSelfieUri, setLocalSelfieUri] = useState<string | null>(selfieUri);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarPick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const uploadedUrl = user?.id
        ? await uploadWardrobeImage(result.assets[0].uri, user.id, 'avatars')
        : null;
      if (uploadedUrl) {
        setAvatarUrl(uploadedUrl);
      } else {
        showToast('头像上传失败，请重试', 'error');
      }
    } catch {
      showToast('头像上传失败，请重试', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSelfiePick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('需要相册权限才能选择照片', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mimeType = asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const fullDataUrl = `data:${mimeType};base64,${asset.base64}`;
        try {
          const compressed = await compressToDataUrl(fullDataUrl);
          setLocalSelfieUri(compressed);
        } catch {
          setLocalSelfieUri(fullDataUrl);
        }
      } else {
        try {
          const compressed = await compressToDataUrl(asset.uri);
          setLocalSelfieUri(compressed);
        } catch {
          setLocalSelfieUri(asset.uri);
        }
      }
    }
  };

  const handleSave = async () => {
    if (!nickname.trim() || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('users').upsert(
        {
          user_id: user.id,
          nickname: nickname.trim(),
          gender,
          age: age ? parseInt(age) : null,
          profession: profession.trim() || null,
          permanent_city: city.trim() || null,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      // Save selfie to Supabase and tryon store
      if (localSelfieUri !== selfieUri) {
        if (localSelfieUri && user.id) {
          const serverUrl = await saveSelfie(localSelfieUri, user.id);
          setSelfie(serverUrl || localSelfieUri);
        } else {
          setSelfie(localSelfieUri);
        }
      }
      try {
        await fetchProfile();
      } catch {}
      onClose();
    } catch (e: any) {
      showToast('保存失败：' + (e.message || '请稍后重试'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>编辑资料</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>关闭</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarWrap} onPress={handleAvatarPick}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarEmoji}>
                    {profile?.nickname?.[0] ?? 'S'}
                  </Text>
                </View>
              )}
              <View style={styles.avatarCamera}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color={Colors.ink} />
                  : <Text style={styles.avatarCameraIcon}>📷</Text>
                }
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAvatarPick} disabled={uploadingAvatar}>
              <Text style={styles.avatarChange}>
                {uploadingAvatar ? '上传中...' : '更换头像'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>昵称</Text>
            <TextInput
              style={styles.fieldInput}
              value={nickname}
              onChangeText={setNickname}
              placeholder="请输入昵称"
              placeholderTextColor={Colors.walnut2}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>性别</Text>
            <View style={styles.genderRow}>
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.genderBtn, gender === g.value && styles.genderBtnActive]}
                  onPress={() => setGender(g.value)}
                >
                  <Text style={[styles.genderText, gender === g.value && styles.genderTextActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>年龄</Text>
            <TextInput
              style={styles.fieldInput}
              value={age}
              onChangeText={setAge}
              placeholder="请输入年龄"
              placeholderTextColor={Colors.walnut2}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>城市</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="请输入城市"
              placeholderTextColor={Colors.walnut2}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>职业</Text>
            <TextInput
              style={styles.fieldInput}
              value={profession}
              onChangeText={setProfession}
              placeholder="请输入职业"
              placeholderTextColor={Colors.walnut2}
            />
          </View>

          {/* Selfie for AI Try-on */}
          <View style={styles.bodyInfoSection}>
            <Text style={styles.bodyInfoTitle}>身体信息（AI试穿）</Text>
            <Text style={styles.bodyInfoStatus}>
              {localSelfieUri ? '已录入' : '未录入'}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>面部自拍</Text>
            <TouchableOpacity style={styles.selfieCard} onPress={handleSelfiePick} activeOpacity={0.7}>
              {localSelfieUri ? (
                <Image source={{ uri: localSelfieUri }} style={styles.selfieImage} resizeMode="cover" />
              ) : (
                <View style={styles.selfiePlaceholder}>
                  <Text style={styles.selfieLabel}>点击上传自拍照</Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.selfieHint}>面部正面清晰可见，光线充足均匀</Text>
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={Colors.paper} />
              : <Text style={styles.saveText}>保存</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (isWeb) {
    if (!visible) return null;
    return <View style={styles.webLayer}>{content}</View>;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  headerTitle: { ...T.sectionTitle },
  closeBtn: { fontSize: 20, color: Colors.walnut },
  body: { flex: 1 },
  bodyInner: { padding: Spacing.four, gap: Spacing.three },
  avatarSection: { alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.two },
  avatarWrap: { position: 'relative' },
  avatarImage: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.paperCard,
  },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 32, color: '#fff' },
  avatarCamera: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.paper,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.line,
  },
  avatarCameraIcon: { fontSize: 14 },
  avatarChange: { ...T.tag, color: Colors.ink },
  field: { gap: Spacing.one },
  fieldLabel: { ...T.formLabel },
  fieldInput: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    color: Colors.ink,
  },
  genderRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  genderBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
  },
  genderBtnActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  genderText: { ...T.tag, color: Colors.ink },
  genderTextActive: { ...T.tag, color: Colors.paper },
  bodyInfoSection: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.two, paddingTop: Spacing.two,
    borderTopWidth: 1, borderTopColor: Colors.line,
  },
  bodyInfoTitle: { ...T.bodyText, fontFamily: Fonts.uiSemiBold, fontSize: 13, color: Colors.walnut },
  bodyInfoStatus: { ...T.micro, color: Colors.walnut2 },

  // Selfie upload
  selfieCard: {
    aspectRatio: 3 / 4, borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 1.5, borderColor: Colors.line,
    borderStyle: 'dashed', backgroundColor: Colors.paperCard,
  },
  selfieImage: { width: '100%', height: '100%' },
  selfiePlaceholder: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: Spacing.one,
  },
  selfieLabel: { ...T.bodyText, fontSize: 13, color: Colors.walnut },
  selfieHint: { ...T.micro, color: Colors.walnut2, marginTop: 2 },

  footer: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  saveBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  saveText: { ...T.buttonPrimary, color: Colors.paper },
});
