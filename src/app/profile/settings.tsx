import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Switch, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import { NicknameEditModal } from '@/components/NicknameEditModal';
import Constants from 'expo-constants';
import { showToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';

const isWeb = Platform.OS === 'web';
const STORAGE_PREFIX = 'stylee_settings_';

async function loadSetting(key: string, fallback: boolean): Promise<boolean> {
  if (isWeb) {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val !== null ? val === 'true' : fallback;
  }
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const val = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    return val !== null ? val === 'true' : fallback;
  } catch { return fallback; }
}

async function saveSetting(key: string, value: boolean): Promise<void> {
  if (isWeb) {
    localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } else {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(STORAGE_PREFIX + key, String(value));
    } catch {}
  }
}

export default function SettingsPage() {
  const { user, profile, signOut, setProfile } = useUserStore();
  const [showSignOut, setShowSignOut] = useState(false);
  const [showNicknameEdit, setShowNicknameEdit] = useState(false);
  const [locationAccess, setLocationAccess] = useState(true);
  const [cacheSize, setCacheSize] = useState('128 MB');

  useEffect(() => {
    loadSetting('locationAccess', true).then(setLocationAccess);
  }, []);

  const toggleAndSave = (key: string, current: boolean, setter: (v: boolean) => void) => {
    const next = !current;
    setter(next);
    saveSetting(key, next);
  };

  const appVersion = Constants.expoConfig?.version ?? '2.1.0';

  const handleClearCache = () => {
    setCacheSize('0 MB');
    showToast('缓存已清除', 'success');
  };

  const handleSaveNickname = async (newValue: string) => {
    if (!user?.id) {
      showToast('未登录，无法修改', 'error');
      return;
    }
    try {
      const { error } = await supabase
        .from('users')
        .update({ nickname: newValue, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      if (profile) {
        setProfile({ ...profile, nickname: newValue });
      }
      setShowNicknameEdit(false);
      showToast('用户名已更新', 'success');
    } catch (e: any) {
      showToast('保存失败：' + (e?.message || '请稍后重试'), 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>更多设置</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        {/* 账号与安全 */}
        <Text style={styles.sectionLabel}>账号与安全</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={() => setShowNicknameEdit(true)}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>用户名</Text>
            </View>
            <Text style={styles.rowValue}>{profile?.nickname ?? 'user_1234'} ›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => router.push('/profile/change-password')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>登录密码</Text>
            </View>
            <Text style={styles.rowValue}>已设置 ›</Text>
          </TouchableOpacity>
        </View>

        {/* 隐私 */}
        <Text style={styles.sectionLabel}>隐私</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>位置信息</Text>
            </View>
            <Switch
              value={locationAccess}
              onValueChange={() => toggleAndSave('locationAccess', locationAccess, setLocationAccess)}
              trackColor={{ false: Colors.line, true: Colors.signal }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* 数据管理 */}
        <Text style={styles.sectionLabel}>数据管理</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={() => {
            showToast('正在备份您的数据…', 'info');
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>数据备份</Text>
            </View>
            <Text style={styles.rowValue}>今天 08:30 ›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={handleClearCache}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>清除缓存</Text>
            </View>
            <Text style={styles.rowValue}>{cacheSize}</Text>
          </TouchableOpacity>
        </View>

        {/* 关于 */}
        <Text style={styles.sectionLabel}>关于</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>当前版本</Text>
            </View>
            <Text style={styles.rowValue}>v{appVersion}</Text>
          </View>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => router.push('/profile/feedback')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>意见反馈</Text>
            </View>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => router.push('/profile/terms')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>用户协议</Text>
            </View>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => router.push('/profile/privacy')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>隐私政策</Text>
            </View>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 独立模型实验 */}
        <Text style={styles.sectionLabel}>实验功能</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/gamma')}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Gamma 直接模型版</Text>
            </View>
            <Text style={styles.rowValue}>独立入口 ›</Text>
          </TouchableOpacity>
        </View>

        {/* 退出登录 */}
        <View style={styles.signOutGroup}>
          <TouchableOpacity style={styles.signOutBtn} onPress={() => setShowSignOut(true)}>
            <Text style={styles.signOutText}>退出登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showSignOut}
        title="退出登录"
        message="确认要退出吗？"
        confirmText="退出"
        confirmStyle="destructive"
        onConfirm={() => { setShowSignOut(false); signOut(); }}
        onCancel={() => setShowSignOut(false)}
      />

      <NicknameEditModal
        visible={showNicknameEdit}
        initialValue={profile?.nickname ?? ''}
        onClose={() => setShowNicknameEdit(false)}
        onSave={handleSaveNickname}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.three,
    backgroundColor: Colors.paper, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  headerRight: { width: 60 },
  container: { flex: 1 },
  inner: { paddingVertical: Spacing.two, paddingBottom: Spacing.six },

  sectionLabel: {
    fontSize: 13, color: Colors.gray1,
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.one + 2,
  },
  group: {
    backgroundColor: Colors.paper,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.line,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 4,
  },
  rowBorder: { height: 1, backgroundColor: Colors.line, marginLeft: Spacing.four },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowLabel: { ...T.bodyText, fontSize: 15, color: Colors.ink },
  rowValue: { fontSize: 13, color: Colors.gray1 },

  signOutGroup: { marginTop: Spacing.four, paddingHorizontal: Spacing.four },
  signOutBtn: {
    backgroundColor: Colors.paper, borderRadius: Radius.md,
    paddingVertical: Spacing.three, alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.line,
  },
  signOutText: { ...T.bodyText, color: Colors.accent, fontFamily: Fonts.uiSemiBold, fontSize: 15 },
});
