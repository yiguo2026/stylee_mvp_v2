import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { supabase, supabaseAdmin, confirmUser } from '@/lib/supabase';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

function usernameToEmail(username: string) {
  return `${username.toLowerCase().trim()}@users.stylee.app`;
}

function translateRegisterError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered')) return '该用户名已注册';
  if (m.includes('password') && m.includes('weak')) return '密码太简单，请使用至少6位包含字母和数字的密码';
  if (m.includes('password')) return '密码不符合要求，请使用至少6位密码';
  if (m.includes('rate limit') || m.includes('too many')) return '请求过于频繁，请稍后再试';
  if (m.includes('network') || m.includes('fetch')) return '网络连接失败，请检查网络';
  return msg;
}

const USERNAME_REGEX = /^[一-龥a-zA-Z0-9_]+$/;

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showTerms, setShowTerms] = useState(false);

  const canSubmit =
    username.trim().length > 0 &&
    password.length >= 6 &&
    password === confirmPassword &&
    !usernameError &&
    !passwordError;

  const handleUsernameChange = (t: string) => {
    setUsername(t);
    setUsernameError('');
    setError('');
    if (t.trim() && !USERNAME_REGEX.test(t)) {
      setUsernameError('用户名仅支持中英文字符、数字和下划线');
    }
  };

  const handlePasswordChange = (t: string) => {
    setPassword(t);
    setPasswordError('');
    setError('');
  };

  const handleConfirmChange = (t: string) => {
    setConfirmPassword(t);
    setPasswordError('');
    if (t && password && t !== password) {
      setPasswordError('两次密码不一致');
    }
  };

  const handleRegister = async () => {
    setError('');
    setUsernameError('');
    setPasswordError('');

    if (!username.trim()) { setError('请输入用户名'); return; }
    if (!USERNAME_REGEX.test(username)) { setUsernameError('用户名仅支持中英文字符、数字和下划线'); return; }
    if (!password) { setError('请输入密码'); return; }
    if (password.length < 6) { setError('密码至少需要6位'); return; }
    if (password !== confirmPassword) { setPasswordError('两次密码不一致'); return; }

    setLoading(true);
    try {
      // Use admin API to create user directly (bypasses email domain validation)
      const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: usernameToEmail(username),
        password,
        email_confirm: true,
      });

      if (authError) {
        setLoading(false);
        setError(translateRegisterError(authError.message));
        return;
      }

      // Create profile with username
      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            user_id: data.user.id,
            username: username.trim(),
            nickname: username.trim(),
          });
        if (profileError) {
          console.warn('[Register] profile creation failed:', profileError.message);
        }
      }

      setLoading(false);
      // 注册成功，跳转登录页（不自动登录）
      router.replace('/(auth)/login');
    } catch {
      setLoading(false);
      setError('网络连接失败，请检查网络后重试');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>

        <Text style={styles.title}>创建账号</Text>
        <Text style={styles.subtitle}>开始你的穿搭之旅</Text>

        <View style={styles.form}>
          <View>
            <TextInput
              style={[styles.input, (usernameError || error) && styles.inputError]}
              placeholder="用户名"
              placeholderTextColor={Colors.walnut2}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
            />
            {usernameError ? <Text style={styles.fieldError}>{usernameError}</Text> : null}
          </View>

          <View>
            <TextInput
              style={[styles.input, error && styles.inputError]}
              placeholder="密码（至少6位，支持大小写字母、数字、英文符号）"
              placeholderTextColor={Colors.walnut2}
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry
            />
          </View>

          <View>
            <TextInput
              style={[styles.input, (passwordError || error) && styles.inputError]}
              placeholder="确认密码"
              placeholderTextColor={Colors.walnut2}
              value={confirmPassword}
              onChangeText={handleConfirmChange}
              secureTextEntry
            />
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={!canSubmit || loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.paperRaised} />
              : <Text style={styles.buttonText}>注册</Text>
            }
          </TouchableOpacity>

          <View style={styles.termsRow}>
            <Text style={styles.termsText}>注册即表示同意</Text>
            <TouchableOpacity onPress={() => setShowTerms(true)}>
              <Text style={styles.termsLink}>用户协议</Text>
            </TouchableOpacity>
            <Text style={styles.termsText}>和</Text>
            <TouchableOpacity onPress={() => setShowTerms(true)}>
              <Text style={styles.termsLink}>隐私政策</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.back()}
          >
            <Text style={styles.linkText}>已有账号？</Text>
            <Text style={[styles.linkText, styles.linkAccent]}>去登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Terms Modal */}
      <Modal visible={showTerms} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.termsModal}>
          <View style={styles.termsModalHeader}>
            <Text style={styles.termsModalTitle}>用户协议与隐私政策</Text>
            <TouchableOpacity onPress={() => setShowTerms(false)}>
              <Text style={styles.termsModalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.termsModalContent}>
            <Text style={styles.termsSectionTitle}>用户协议</Text>
            <Text style={styles.termsBody}>
一、服务说明{'\n\n'}
Stylee AI穿搭助手（下称"本应用"）仅面向个人非商用场景提供以下工具类服务：穿搭智能推荐、衣橱数字化管理、穿搭记录留存、虚拟试穿辅助。{'\n\n'}
二、账号责任{'\n\n'}
注册账号、设置密码后，您需自行保管账号登录信息。因账号泄露、转借他人造成的数据丢失、他人恶意操作衣橱内容等后果，均由您本人自行承担。{'\n\n'}
三、功能限制{'\n\n'}
AI穿搭方案仅为参考建议，不构成穿搭、服饰选购的决定性依据。虚拟试穿、风格推荐受算法模型限制，无法保证100%贴合个人身形、场景需求。{'\n\n'}
四、使用规范{'\n\n'}
禁止上传色情、暴力、侵权、违法违规衣物图片。禁止利用本应用传播违规内容。{'\n\n'}
五、知识产权{'\n\n'}
本应用界面设计、AI算法模型、推荐逻辑等均为Stylee所有。{'\n\n'}
六、免责声明{'\n\n'}
因不可抗力导致的数据丢失，本应用不承担赔偿责任。
            </Text>
            <Text style={styles.termsSectionTitle}>隐私政策</Text>
            <Text style={styles.termsBody}>
一、数据收集范围{'\n\n'}
本应用仅在本地浏览器 LocalStorage 存储以下信息：账号昵称与基本偏好设置、衣橱衣物信息、穿搭记录与搭配历史、风格偏好设置、AI试穿身体信息。不会主动收集手机号、身份证、精确地理位置等敏感个人信息。{'\n\n'}
二、图片权限说明{'\n\n'}
相册、相机权限仅用于拍摄/上传衣物照片录入衣橱。图片文件仅保存在您当前设备本地。不会自动上传至外部服务器。{'\n\n'}
三、数据使用规则{'\n\n'}
您的衣橱数据、穿搭记录仅用于为您个人生成个性化AI穿搭推荐。不会向第三方售卖、共享您的数据。不会基于您的数据进行广告推送。{'\n\n'}
四、数据存储与安全{'\n\n'}
所有数据均存储于浏览器本地，不经过远程服务器。数据安全性取决于您的设备与浏览器安全环境。{'\n\n'}
五、数据删除{'\n\n'}
您可随时通过「我的 → 设置 → 退出登录」清空本地全部存储数据。
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  inner: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: Spacing.four, paddingVertical: Spacing.six,
  },
  backBtn: { position: 'absolute', top: Spacing.six, left: Spacing.four },
  backText: { ...T.buttonSecondary, color: Colors.walnut },
  title: { ...T.pageTitle, marginBottom: Spacing.one },
  subtitle: {
    ...T.emptyTitle, fontSize: 14, letterSpacing: 0.84,
    color: Colors.walnut, marginBottom: Spacing.five,
  },
  form: { gap: Spacing.two },
  input: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1, borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    color: Colors.ink,
  },
  inputError: { borderColor: Colors.accent },
  fieldError: {
    ...T.micro, color: Colors.accent, fontSize: 12, marginTop: 4,
  },
  errorText: {
    ...T.micro, color: Colors.accent, fontSize: 13, marginTop: -Spacing.one,
  },
  button: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...T.buttonPrimary, color: Colors.paper },
  termsRow: {
    flexDirection: 'row', justifyContent: 'center',
    flexWrap: 'wrap', gap: 2, marginTop: Spacing.one,
  },
  termsText: { ...T.micro, color: Colors.walnut2 },
  termsLink: { ...T.micro, color: Colors.terracotta, textDecorationLine: 'underline' },
  linkRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 4, marginTop: Spacing.one,
  },
  linkText: { ...T.buttonSecondary, color: Colors.walnut },
  linkAccent: { ...T.buttonSecondary, color: Colors.terracotta },

  // Terms modal
  termsModal: { flex: 1, backgroundColor: Colors.paper },
  termsModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.four, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  termsModalTitle: { ...T.sectionTitle },
  termsModalClose: { fontSize: 18, color: Colors.walnut2 },
  termsModalContent: { padding: Spacing.four },
  termsSectionTitle: { ...T.subTitle, marginTop: Spacing.three, marginBottom: Spacing.two },
  termsBody: { ...T.bodyText, fontSize: 13, lineHeight: 22, color: Colors.walnut },
});
