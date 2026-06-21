import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { uploadWardrobeImage } from '@/lib/uploadImage';
import { Gender } from '@/types';

const GENDERS: { label: string; value: Gender }[] = [
  { label: '👩 女', value: 'female' },
  { label: '👨 男', value: 'male' },
  { label: '保密', value: 'private' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ProfileEditModal({ visible, onClose }: Props) {
  const { user, profile, fetchProfile } = useUserStore();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [gender, setGender] = useState<Gender>(profile?.gender ?? 'female');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [city, setCity] = useState(profile?.permanent_city ?? '');
  const [profession, setProfession] = useState(profile?.profession ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
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
        Alert.alert('上传失败', '头像上传失败，请重试');
      }
    } catch {
      Alert.alert('上传失败', '头像上传失败，请重试');
    } finally {
      setUploadingAvatar(false);
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
      try {
        await fetchProfile();
      } catch {
        // fetchProfile failure shouldn't block the UI — data was saved
      }
      onClose();
    } catch (e: any) {
      Alert.alert('保存失败', e.message || '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>编辑资料</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
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
                      {profile?.nickname?.[0] ?? '👩'}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.vintageCream,
  },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#764ba2',
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
  avatarChange: { ...T.tag, color: '#6C5CE7' },
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
  genderRow: { flexDirection: 'row', gap: Spacing.two },
  genderBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paperCard,
  },
  genderBtnActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  genderText: { ...T.tag, color: Colors.walnut },
  genderTextActive: { ...T.tag, color: Colors.paper },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  saveBtn: {
    backgroundColor: '#6C5CE7',
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  saveText: { ...T.buttonPrimary, color: Colors.paper },
});
