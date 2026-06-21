import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Alert, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { Gender } from '@/types';
import { searchCitiesOnline, CityResult } from '@/lib/weather';

const GENDERS: { label: string; value: Gender }[] = [
  { label: '女', value: 'female' },
  { label: '男', value: 'male' },
  { label: '其他', value: 'other' },
  { label: '不公开', value: 'private' },
];

export default function OnboardingStep1() {
  const { user, profile, fetchProfile } = useUserStore();
  // Pre-fill with existing profile if editing from profile tab
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [gender, setGender] = useState<Gender>(profile?.gender ?? 'female');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [profession, setProfession] = useState(profile?.profession ?? '');
  const [city, setCity] = useState(profile?.permanent_city ?? '北京');
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!nickname.trim()) {
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('users').upsert({
        user_id: user?.id,
        nickname: nickname.trim(),
        gender,
        age: age ? parseInt(age) : null,
        profession: profession.trim() || null,
        permanent_city: city.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await fetchProfile();
      router.push('/onboarding/step2-style');
    } catch (e: any) {
      Alert.alert('保存失败', e.message || '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.progress}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressDot} />
        <View style={styles.progressDot} />
      </View>

      <Text style={styles.title}>先来认识一下</Text>
      <Text style={styles.subtitle}>帮助我们提供更个性化的穿搭建议，可随时跳过</Text>

      <View style={styles.section}>
        <Text style={styles.label}>昵称 *</Text>
        <TextInput
          style={styles.input}
          placeholder="你的昵称"
          placeholderTextColor={Colors.walnut2}
          value={nickname}
          onChangeText={setNickname}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>性别</Text>
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

      <View style={styles.section}>
        <Text style={styles.label}>年龄</Text>
        <TextInput
          style={styles.input}
          placeholder="可选"
          placeholderTextColor={Colors.walnut2}
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>职业</Text>
        <TextInput
          style={styles.input}
          placeholder="可选"
          placeholderTextColor={Colors.walnut2}
          value={profession}
          onChangeText={setProfession}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>常驻城市</Text>
        <TouchableOpacity
          style={styles.citySelect}
          onPress={() => { setCityModalVisible(true); searchCitiesOnline('').then(setCityResults); }}
        >
          <Text style={[styles.citySelectText, !city && styles.placeholder]}>
            {city || '选择城市'}
          </Text>
          <Text style={styles.citySelectArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.nextBtn, loading && styles.disabled]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.paper} />
            : <Text style={styles.nextText}>下一步</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>跳过，直接进入</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

      {/* City Selection Modal */}
      <Modal visible={cityModalVisible} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>📍 选择城市</Text>
            <TextInput
              style={styles.citySearchInput}
              placeholder="搜索城市..."
              placeholderTextColor={Colors.walnut2}
              value={citySearch}
              onChangeText={(text) => {
                setCitySearch(text);
                searchCitiesOnline(text).then(setCityResults);
              }}
              autoFocus
            />
            <ScrollView style={styles.cityList} keyboardShouldPersistTaps="handled">
              {cityResults.map(cr => {
                const isActive = city === cr.name;
                return (
                  <TouchableOpacity
                    key={cr.id || cr.name}
                    style={[styles.cityRow, isActive && styles.cityRowActive]}
                    onPress={() => {
                      setCity(cr.name);
                      setCityModalVisible(false);
                      setCitySearch('');
                    }}
                  >
                    <Text style={[styles.cityRowText, isActive && styles.cityRowTextActive]}>
                      {cr.name}{cr.adm1 ? ` (${cr.adm1})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {citySearch.trim() && cityResults.length === 0 && (
                <Text style={styles.cityEmpty}>没有找到匹配的城市</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setCityModalVisible(false); setCitySearch(''); }}>
              <Text style={styles.modalCloseText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.paper },
  container: { flex: 1 },
  inner: { padding: Spacing.four, paddingTop: Spacing.six, gap: Spacing.three },
  progress: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two },
  progressDot: {
    width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.line,
  },
  progressDotActive: { backgroundColor: Colors.ink },
  title: { ...T.pageTitle },
  subtitle: { ...T.bodyText, fontSize: 14, lineHeight: 22 },
  section: { gap: Spacing.one },
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
  actions: { gap: Spacing.two, marginTop: Spacing.three, alignItems: 'center' },
  nextBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    width: '100%',
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  nextText: { ...T.buttonPrimary, color: Colors.paper },
  skipText: { ...T.buttonSecondary, color: Colors.walnut },
  citySelect: {
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
  citySelectText: { ...T.inputText, color: Colors.ink },
  citySelectArrow: { fontSize: 16, color: Colors.walnut2 },
  placeholder: { color: Colors.walnut2 },
  // City modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '70%',
    padding: Spacing.four,
  },
  modalTitle: {
    ...T.sectionTitle,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  citySearchInput: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 13,
    color: Colors.ink,
    marginBottom: Spacing.two,
  },
  cityList: {
    maxHeight: 200,
  },
  cityRow: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
  },
  cityRowActive: {
    backgroundColor: '#F0EDFF',
  },
  cityRowText: {
    ...T.bodyText,
    color: Colors.walnut,
    fontSize: 14,
  },
  cityRowTextActive: {
    color: '#6C5CE7',
    fontWeight: '500',
  },
  cityEmpty: {
    ...T.micro,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    color: Colors.walnut2,
  },
  modalCloseBtn: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  modalCloseText: {
    ...T.buttonSecondary,
    color: Colors.walnut,
  },
});
