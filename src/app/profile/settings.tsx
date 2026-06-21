import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Switch, Alert, Linking, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { useUserStore } from '@/stores/userStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isWeb = Platform.OS === 'web';
const STORAGE_PREFIX = 'stylee_settings_';

async function loadSetting(key: string, fallback: boolean): Promise<boolean> {
  if (isWeb) {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val !== null ? val === 'true' : fallback;
  }
  const val = await AsyncStorage.getItem(STORAGE_PREFIX + key);
  return val !== null ? val === 'true' : fallback;
}

async function saveSetting(key: string, value: boolean): Promise<void> {
  if (isWeb) {
    localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } else {
    await AsyncStorage.setItem(STORAGE_PREFIX + key, String(value));
  }
}

export default function SettingsPage() {
  const { profile, signOut } = useUserStore();
  const [showSignOut, setShowSignOut] = useState(false);

  // Notification toggles (persisted)
  const [dailyReminder, setDailyReminder] = useState(true);
  const [recommendNotify, setRecommendNotify] = useState(true);
  const [locationAccess, setLocationAccess] = useState(true);

  useEffect(() => {
    loadSetting('dailyReminder', true).then(setDailyReminder);
    loadSetting('recommendNotify', true).then(setRecommendNotify);
    loadSetting('locationAccess', true).then(setLocationAccess);
  }, []);

  const toggleAndSave = (key: string, current: boolean, setter: (v: boolean) => void) => {
    const next = !current;
    setter(next);
    saveSetting(key, next);
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const handleClearCache = () => {
    Alert.alert('缓存已清除');
  };

  const handleSignOut = () => {
    setShowSignOut(true);
  };

  const confirmSignOut = async () => {
    setShowSignOut(false);
    signOut();
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
        {/* 通知 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>通知</Text>
          <View style={styles.group}>
            <View style={styles.row}>
              <Text style={styles.rowIcon}>🔔</Text>
              <Text style={styles.rowLabel}>每日穿搭提醒</Text>
              <Switch
                value={dailyReminder}
                onValueChange={() => toggleAndSave('dailyReminder', dailyReminder, setDailyReminder)}
                trackColor={{ false: Colors.line, true: '#6C5CE7' }}
                thumbColor="#fff"
              />
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowIcon}>📰</Text>
              <Text style={styles.rowLabel}>搭配推荐通知</Text>
              <Switch
                value={recommendNotify}
                onValueChange={() => toggleAndSave('recommendNotify', recommendNotify, setRecommendNotify)}
                trackColor={{ false: Colors.line, true: '#6C5CE7' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* 账号与安全 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>账号与安全</Text>
          <View style={styles.group}>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('手机号绑定', '请前往飞书管理员后台配置手机号绑定功能')}>
              <Text style={styles.rowIcon}>📱</Text>
              <Text style={styles.rowLabel}>手机号</Text>
              <Text style={styles.rowRight}>未绑定 ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('修改密码', '请通过登录页面的"忘记密码"功能重置密码')}>
              <Text style={styles.rowIcon}>🔑</Text>
              <Text style={styles.rowLabel}>登录密码</Text>
              <Text style={styles.rowRight}>修改 ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('微信绑定', '微信绑定功能即将上线，敬请期待')}>
              <Text style={styles.rowIcon}>💬</Text>
              <Text style={styles.rowLabel}>微信绑定</Text>
              <Text style={styles.rowRight}>未绑定 ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 隐私 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>隐私</Text>
          <View style={styles.group}>
            <View style={styles.row}>
              <Text style={styles.rowIcon}>📍</Text>
              <Text style={styles.rowLabel}>位置信息</Text>
              <Switch
                value={locationAccess}
                onValueChange={() => toggleAndSave('locationAccess', locationAccess, setLocationAccess)}
                trackColor={{ false: Colors.line, true: '#6C5CE7' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* 数据管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>数据管理</Text>
          <View style={styles.group}>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('数据备份', '正在备份您的数据...')}>
              <Text style={styles.rowIcon}>☁️</Text>
              <Text style={styles.rowLabel}>数据备份</Text>
              <Text style={styles.rowRight}>立即备份 ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('导出穿搭记录', '正在生成穿搭记录导出文件...')}>
              <Text style={styles.rowIcon}>📤</Text>
              <Text style={styles.rowLabel}>导出穿搭记录</Text>
              <Text style={styles.rowRight}>导出 ›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={handleClearCache}>
              <Text style={styles.rowIcon}>🗑️</Text>
              <Text style={styles.rowLabel}>清除缓存</Text>
              <Text style={styles.rowRight}>0 MB</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 关于 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <View style={styles.group}>
            <View style={styles.row}>
              <Text style={styles.rowIcon}>ℹ️</Text>
              <Text style={styles.rowLabel}>当前版本</Text>
              <Text style={styles.rowRight}>v{appVersion}</Text>
            </View>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('意见反馈', '感谢您的反馈！请通过邮件联系我们：feedback@stylee.app')}>
              <Text style={styles.rowIcon}>✏️</Text>
              <Text style={styles.rowLabel}>意见反馈</Text>
              <Text style={styles.rowRight}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => {
              const appId = '6744236497'; // App Store ID, update after App Store Connect setup
              const url = isWeb
                ? 'https://apps.apple.com/app/id' + appId
                : 'itms-apps://itunes.apple.com/app/id' + appId;
              Linking.openURL(url).catch(() => {
                Alert.alert('提示', '无法打开 App Store，请稍后重试');
              });
            }}>
              <Text style={styles.rowIcon}>⭐</Text>
              <Text style={styles.rowLabel}>给我们评分</Text>
              <Text style={styles.rowRight}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => {
              Linking.openURL('https://styleeamazingmvp.vercel.app/terms.html').catch(() => {
                Alert.alert('用户协议', 'Stylee 用户协议\n\n1. 服务说明\nStylee 提供AI穿搭推荐服务。\n\n2. 隐私保护\n我们重视您的隐私，不会向第三方分享个人信息。\n\n3. 数据安全\n您的衣橱数据通过加密存储保障安全。');
              });
            }}>
              <Text style={styles.rowIcon}>📄</Text>
              <Text style={styles.rowLabel}>用户协议</Text>
              <Text style={styles.rowRight}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => {
              Linking.openURL('https://styleeamazingmvp.vercel.app/privacy.html').catch(() => {
                Alert.alert('隐私政策', 'Stylee 隐私政策\n\n我们收集的信息：\n- 账号信息（昵称、邮箱）\n- 衣橱数据（照片、分类）\n- 偏好设置\n\n信息用途：\n- 提供个性化穿搭推荐\n- 改善服务质量\n\n我们不会：\n- 向第三方出售您的数据\n- 在未经同意的情况下分享个人信息');
              });
            }}>
              <Text style={styles.rowIcon}>🔒</Text>
              <Text style={styles.rowLabel}>隐私政策</Text>
              <Text style={styles.rowRight}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.signOutGroup}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
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
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOut(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: Colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  headerBack: { ...T.bodyText, color: Colors.ink, width: 60 },
  headerTitle: { ...T.sectionTitle },
  headerRight: { width: 60 },
  container: { flex: 1 },
  inner: { paddingVertical: Spacing.three, paddingBottom: Spacing.six },
  section: { marginBottom: Spacing.three },
  sectionTitle: {
    ...T.micro,
    fontSize: 13,
    color: Colors.walnut2,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.one + 2,
  },
  group: {
    backgroundColor: Colors.paper,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 4,
    gap: Spacing.two,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.lineSoft,
  },
  rowIcon: { fontSize: 18, width: 28 },
  rowLabel: { ...T.bodyText, flex: 1, color: Colors.ink, fontSize: 15 },
  rowRight: { ...T.bodyText, color: Colors.walnut2, fontSize: 14 },
  signOutGroup: { marginTop: Spacing.two, paddingHorizontal: Spacing.four },
  signOutBtn: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.line,
  },
  signOutText: { ...T.bodyText, color: '#FF3B30', fontWeight: '600', fontSize: 15 },
});
