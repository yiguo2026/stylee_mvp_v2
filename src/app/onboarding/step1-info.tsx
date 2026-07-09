import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, Modal, Platform,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';
import { Colors, Spacing, Radius, T, Fonts, Shadow } from '@/constants/theme';
import { Gender } from '@/types';
import { searchCitiesOnline, CityResult } from '@/lib/weather';
import { showToast } from '@/components/Toast';

const isWeb = Platform.OS === 'web';

const ADJECTIVES = ['快乐的', '阳光的', '温柔的', '酷酷的', '可爱的', '优雅的', '元气', '自由', '治愈系', '文艺范'];
const NOUNS = ['小鹿', '猫咪', '云朵', '星星', '月亮', '花栗鼠', '企鹅', '棉花糖', '小熊', '兔子'];

function randomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

const GENDERS: { label: string; value: Gender }[] = [
  { label: '女士', value: 'female' },
  { label: '男士', value: 'male' },
  { label: '其他', value: 'other' },
];

const PROFESSIONS = [
  '学生', '互联网/科技', '金融/银行', '教育/学术', '医疗/健康',
  '政府/公共事业', '制造业', '零售/电商', '媒体/广告', '法律/咨询',
  '设计/艺术', '建筑/房地产', '餐饮/酒店', '物流/交通', '自由职业',
  '其他',
];

export default function OnboardingStep1() {
  const { user, profile, fetchProfile } = useUserStore();
  const [nickname, setNickname] = useState(profile?.nickname ?? randomNickname());
  const [gender, setGender] = useState<Gender>(profile?.gender ?? 'female');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [ageError, setAgeError] = useState('');
  const [profession, setProfession] = useState(profile?.profession ?? '');
  const [professionModalVisible, setProfessionModalVisible] = useState(false);
  const [city, setCity] = useState(profile?.permanent_city ?? '北京');
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    setAgeError('');
    if (age) {
      if (!/^\d+$/.test(age)) {
        setAgeError('年龄请输入数字');
        return;
      }
      const n = parseInt(age);
      if (n < 1 || n > 110) {
        setAgeError('请输入 1-110 之间的年龄');
        return;
      }
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('users').upsert({
        user_id: user?.id,
        nickname: nickname.trim() || randomNickname(),
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
      showToast(e.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  const citySheet = (
    <View style={styles.modalOverlay}>
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>选择城市</Text>
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
          {citySearch && cityResults.length === 0 ? (
            <Text style={styles.cityNoResult}>无搜索结果</Text>
          ) : (
            cityResults.map(cr => {
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
            })
          )}
        </ScrollView>
        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setCityModalVisible(false); setCitySearch(''); }}>
          <Feather name="x-circle" size={16} color={Colors.walnut} />
          <Text style={styles.modalCloseText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const professionSheet = (
    <View style={styles.modalOverlay}>
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>选择职业</Text>
        <ScrollView style={styles.cityList} keyboardShouldPersistTaps="handled">
          {PROFESSIONS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.cityRow, profession === p && styles.cityRowActive]}
              onPress={() => {
                setProfession(p);
                setProfessionModalVisible(false);
              }}
            >
              <Text style={[styles.cityRowText, profession === p && styles.cityRowTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setProfessionModalVisible(false)}>
          <Feather name="x-circle" size={16} color={Colors.walnut} />
          <Text style={styles.modalCloseText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={styles.progress}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressDot} />
        <View style={styles.progressDot} />
      </View>

      <Text style={styles.title}>让我们认识你</Text>
      <Text style={styles.subtitle}>帮助我们提供更个性化的穿搭建议</Text>

      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>昵称</Text>
          <TouchableOpacity onPress={() => setNickname(randomNickname())}>
            <Text style={styles.randomBtn}>换一个</Text>
          </TouchableOpacity>
        </View>
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
          style={[styles.input, ageError && styles.inputError]}
          placeholder="可选"
          placeholderTextColor={Colors.walnut2}
          value={age}
          onChangeText={(t) => {
            setAge(t);
            if (!t) { setAgeError(''); return; }
            if (!/^\d+$/.test(t)) {
              setAgeError('年龄请输入数字');
            } else {
              const n = parseInt(t);
              setAgeError(n < 1 || n > 110 ? '请输入 1-110 之间的年龄' : '');
            }
          }}
        />
        {ageError ? <Text style={styles.fieldError}>{ageError}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>职业</Text>
        <TouchableOpacity
          style={styles.citySelect}
          onPress={() => setProfessionModalVisible(true)}
        >
          <Text style={[styles.citySelectText, !profession && styles.placeholder]}>
            {profession || '选择职业'}
          </Text>
          <Text style={styles.citySelectArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>常住地</Text>
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
          <Text style={styles.skipText}>跳过</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

      {isWeb ? (
        <>
          {cityModalVisible ? <View style={styles.webLayer}>{citySheet}</View> : null}
          {professionModalVisible ? <View style={styles.webLayer}>{professionSheet}</View> : null}
        </>
      ) : (
        <>
          <Modal visible={cityModalVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => { setCityModalVisible(false); setCitySearch(''); }}>
            {citySheet}
          </Modal>
          <Modal visible={professionModalVisible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={() => setProfessionModalVisible(false)}>
            {professionSheet}
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
  },
  safeArea: { flex: 1, backgroundColor: Colors.paper, position: 'relative' },
  container: { flex: 1 },
  inner: { padding: Spacing.four, paddingTop: Spacing.six, gap: Spacing.three },
  progress: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.two },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.line },
  progressDotActive: { backgroundColor: Colors.ink },
  title: { ...T.pageTitle },
  subtitle: { ...T.bodyText, fontSize: 14, lineHeight: 22 },
  section: { gap: Spacing.one },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...T.formLabel },
  randomBtn: { ...T.tag, color: Colors.terracotta, fontSize: 12 },
  input: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    color: Colors.ink,
  },
  inputError: { borderColor: Colors.accent },
  fieldError: { ...T.micro, color: Colors.accent, fontSize: 12, marginTop: 4 },
  genderRow: { flexDirection: 'row', gap: Spacing.two },
  genderBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    backgroundColor: Colors.paper,
    gap: 4,
  },
  genderBtnActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  genderText: { ...T.tag, color: Colors.ink },
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
    borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  citySelectText: { ...T.inputText, color: Colors.ink },
  citySelectArrow: { fontSize: 16, color: Colors.walnut2 },
  placeholder: { color: Colors.walnut2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    maxHeight: '70%', padding: Spacing.four,
    ...Shadow.two,
  },
  modalTitle: { ...T.sectionTitle, textAlign: 'center', marginBottom: Spacing.three },
  citySearchInput: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1.5, borderColor: Colors.line,
    borderRadius: 10,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
    fontSize: 13, color: Colors.ink, marginBottom: Spacing.two,
  },
  cityList: { maxHeight: 200 },
  cityRow: {
    paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
  },
  cityRowActive: { backgroundColor: Colors.signalSoft },
  cityRowText: { ...T.bodyText, color: Colors.walnut, fontSize: 14 },
  cityRowTextActive: { color: Colors.ink, fontFamily: Fonts.ui },
  cityNoResult: { ...T.bodyText, color: Colors.walnut2, fontSize: 14, textAlign: 'center', paddingVertical: Spacing.four },
  modalCloseBtn: { marginTop: Spacing.three, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingVertical: Spacing.two },
  modalCloseText: { ...T.buttonSecondary, color: Colors.walnut },
});
