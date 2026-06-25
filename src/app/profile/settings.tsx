import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Switch, Alert, Linking, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import Constants from 'expo-constants';

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
  const { profile, signOut } = useUserStore();
  const [showSignOut, setShowSignOut] = useState(false);
  const [locationAccess, setLocationAccess] = useState(true);

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
    if (isWeb) { window.alert('缓存已清除'); } else { Alert.alert('提示', '缓存已清除'); }
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
          <TouchableOpacity style={styles.row} onPress={() => {
            if (isWeb) { window.alert('当前用户名: ' + (profile?.nickname ?? '未设置')); } else { Alert.alert('用户名', '当前用户名: ' + (profile?.nickname ?? '未设置')); }
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>👤</Text>
              <Text style={styles.rowLabel}>用户名</Text>
            </View>
            <Text style={styles.rowValue}>{profile?.nickname ?? 'user_1234'} ›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => {
            if (isWeb) { window.alert('请通过登录页面的"忘记密码"功能重置密码'); } else { Alert.alert('修改密码', '请通过登录页面的"忘记密码"功能重置密码'); }
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔑</Text>
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
              <Text style={styles.rowIcon}>📍</Text>
              <Text style={styles.rowLabel}>位置信息</Text>
            </View>
            <Switch
              value={locationAccess}
              onValueChange={() => toggleAndSave('locationAccess', locationAccess, setLocationAccess)}
              trackColor={{ false: '#e5e5ea', true: '#34C759' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* 数据管理 */}
        <Text style={styles.sectionLabel}>数据管理</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={() => {
            if (isWeb) { window.alert('正在备份您的数据...'); } else { Alert.alert('数据备份', '正在备份您的数据...'); }
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>☁️</Text>
              <Text style={styles.rowLabel}>数据备份</Text>
            </View>
            <Text style={styles.rowValue}>今天 08:30 ›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={handleClearCache}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🗑️</Text>
              <Text style={styles.rowLabel}>清除缓存</Text>
            </View>
            <Text style={styles.rowValue}>128 MB</Text>
          </TouchableOpacity>
        </View>

        {/* 关于 */}
        <Text style={styles.sectionLabel}>关于</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>ℹ️</Text>
              <Text style={styles.rowLabel}>当前版本</Text>
            </View>
            <Text style={styles.rowValue}>v{appVersion}</Text>
          </View>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => {
            if (isWeb) { window.alert('感谢您的反馈！请通过邮件联系我们：feedback@stylee.app'); } else { Alert.alert('意见反馈', '感谢您的反馈！请通过邮件联系我们：feedback@stylee.app'); }
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>✏️</Text>
              <Text style={styles.rowLabel}>意见反馈</Text>
            </View>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => {
            Linking.openURL('https://yiguo2026.github.io/terms.html').catch(() => {
              if (isWeb) { window.alert('无法打开用户协议'); } else { Alert.alert('提示', '无法打开用户协议'); }
            });
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📄</Text>
              <Text style={styles.rowLabel}>用户协议</Text>
            </View>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>
          <View style={styles.rowBorder} />
          <TouchableOpacity style={styles.row} onPress={() => {
            Linking.openURL('https://yiguo2026.github.io/privacy.html').catch(() => {
              if (isWeb) { window.alert('无法打开隐私政策'); } else { Alert.alert('提示', '无法打开隐私政策'); }
            });
          }}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔒</Text>
              <Text style={styles.rowLabel}>隐私政策</Text>
            </View>
            <Text style={styles.rowValue}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 退出登录 */}
        <View style={styles.signOutGroup}>
          <TouchableOpacity style={styles.signOutBtn} onPress={() => setShowSignOut(true)}>
            <Text style={styles.signOutText}>🚪 退出登录</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
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
    fontSize: 13, color: '#8A8A8A',
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
  rowBorder: { height: 1, backgroundColor: '#E5E5EA', marginLeft: Spacing.four + 28 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowLabel: { ...T.bodyText, fontSize: 15, color: Colors.ink },
  rowValue: { fontSize: 13, color: '#8A8A8A' },

  signOutGroup: { marginTop: Spacing.four, paddingHorizontal: Spacing.four },
  signOutBtn: {
    backgroundColor: Colors.paper, borderRadius: Radius.md,
    paddingVertical: Spacing.three, alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.line,
  },
  signOutText: { ...T.bodyText, color: '#FF3B30', fontWeight: '600', fontSize: 15 },
});
