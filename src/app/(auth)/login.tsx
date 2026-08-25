import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import { useCooldown } from '@/lib/useCooldown';
import { useUserStore } from '@/stores/userStore';
import { track } from '@/lib/track';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

function usernameToEmail(username: string) {
  const encoded = [...username.trim()].map(c => {
    if (c >= 'A' && c <= 'Z') return '~' + c.toLowerCase();
    return c;
  }).join('');
  return `${encoded}@users.stylee.app`;
}

function legacyUsernameToEmail(username: string) {
  return `${username.toLowerCase().trim()}@users.stylee.app`;
}

function translateLoginError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid password') || m.includes('invalid credentials')) return '账号或密码错误';
  if (m.includes('email not confirmed')) return '账号未验证';
  if (m.includes('too many requests') || m.includes('rate limit')) return '尝试次数过多，请稍后再试';
  // 后端密钥停用 / 未配置 / 鉴权失败（如 Supabase「Legacy API keys are disabled」401）：
  // 如实提示「服务暂不可用」，避免把服务端错误误判成「账号或密码错误」。
  if (m.includes('legacy api key') || m.includes('api key') || m.includes('apikey')
    || m.includes('unauthorized') || m.includes('401') || m.includes('not configured')
    || m.includes('service') && m.includes('disabled')) return '登录服务暂不可用，请稍后再试';
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return '网络连接失败，请检查网络';
  // 兜底不再默认成「账号或密码错误」——未知错误不应误导为凭证错误。
  return '登录失败，请稍后再试';
}

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cooldown = useCooldown();

  const canSubmit = username.trim().length > 0 && password.length > 0;

  useEffect(() => {
    try { track('auth_view', { page: 'login' }); } catch {}
  }, []);

  const handleLogin = async () => {
    setError('');
    if (cooldown.active) return;
    if (!username.trim()) { setError('请输入用户名'); return; }
    if (!password) { setError('请输入密码'); return; }

    setLoading(true);
    try {
      const normalizedUsername = username.trim();
      // 不再前置查 users 表（大小写敏感 + 可能与 auth 不同步会误杀已注册账号）。
      // 直接交给 Supabase Auth 判定账号/密码。
      // Try new encoded email first, fall back to legacy lowercase for old accounts.
      const encodedEmail = usernameToEmail(username);
      let session = null;

      const primary = await withTimeout(
        supabase.auth.signInWithPassword({ email: encodedEmail, password }),
        12000, 'login',
      );

      if (primary.error) {
        const emsg = (primary.error.message || '').toLowerCase();
        // 限流/网络类错误：不要再打第二次请求，否则会加重服务端限流、把账号“锁”得更久
        const isRateLimited = emsg.includes('too many') || emsg.includes('rate limit');
        const isNetworkErr = emsg.includes('network') || emsg.includes('fetch') || emsg.includes('timeout');
        // 仅在“账号/密码不匹配”时，才为老账号回退旧版邮箱格式（保证老用户仍能登录）
        const isCredErr = emsg.includes('invalid') || emsg.includes('credentials') || emsg.includes('password');
        const legacyEmail = legacyUsernameToEmail(username);
        if (isCredErr && !isRateLimited && !isNetworkErr && legacyEmail !== encodedEmail) {
          const legacy = await withTimeout(
            supabase.auth.signInWithPassword({ email: legacyEmail, password }),
            12000, 'login',
          );
          if (!legacy.error && legacy.data.session) session = legacy.data.session;
        }
        if (!session) {
          // 触发限流：启动 30s 冷却，避免用户狂点把账号越锁越久
          if (isRateLimited) cooldown.start(30);
          // 凭证类错误：额外查 users 表区分「账号不存在」与「密码错误」。
          // 仅在查询成功且返回 0 行时改判为账号不存在；查询报错/超时/RLS 异常时不改判。
          if (isCredErr && !isRateLimited && !isNetworkErr) {
            let accountExists = true;
            try {
              const res = await withTimeout(
                supabase.from('users').select('user_id').eq('username', normalizedUsername).limit(1),
                6000, 'user-exists',
              );
              if (!res.error) accountExists = Array.isArray(res.data) && res.data.length > 0;
            } catch { /* 查询失败则保守处理，不改判 */ }
            if (!accountExists) { setError('账号不存在'); return; }
          }
          setError(translateLoginError(primary.error.message));
          return;
        }
      } else {
        session = primary.data.session;
      }

      if (!session) { setError('登录失败，请重试'); return; }

      useUserStore.getState().setSession(session);
      try { track('auth_success', { mode: 'login', is_new_user: false }); } catch {}
      // 关键提速：只解析路由所需的 gender（缓存优先/单列查询），拿到就立刻跳转；
      // 完整 profile + 风格偏好放到后台刷新，不再让用户对着转圈等 select(*)+join。
      const gender = await useUserStore.getState().resolveRouteGender();
      void useUserStore.getState().fetchProfile();
      // DB trigger auto-creates users with gender='private'; onboarding sets it to female/male/other.
      router.replace(gender === 'private' ? '/onboarding/step1-info' : '/(tabs)');
    } catch (e: any) {
      setError(translateLoginError(e?.message ?? ''));
    } finally {
      // 保证任何路径（成功 / 失败 / 超时 / 异常）都会停止转圈
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Stylee</Text>
        <Text style={styles.tagline}>你的AI穿搭助手</Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="用户名（英文字母、数字、下划线）"
            placeholderTextColor={Colors.walnut2}
            value={username}
            onChangeText={(t) => { setUsername(t); setError(''); }}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="密码"
            placeholderTextColor={Colors.walnut2}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (!canSubmit || loading || cooldown.active) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit || loading || cooldown.active}
          >
            {loading
              ? <ActivityIndicator color={Colors.paper} />
              : <Text style={styles.buttonText}>
                  {cooldown.active ? `请 ${cooldown.remaining}s 后重试` : '登录'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.linkText}>还没有账号？</Text>
            <Text style={[styles.linkText, styles.linkAccent]}>立即注册</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  inner: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: Spacing.four, gap: Spacing.two,
  },
  logo: {
    fontFamily: Fonts.displayItalic,
    fontSize: 44,
    letterSpacing: 0,
    color: Colors.ink,
    marginBottom: Spacing.one,
  },
  tagline: {
    ...T.emptyTitle,
    fontSize: 15,
    letterSpacing: 0.9,
    color: Colors.walnut,
    marginBottom: Spacing.five,
  },
  form: { width: '100%', gap: Spacing.two },
  input: {
    ...T.inputText,
    backgroundColor: Colors.paperCard,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    color: Colors.ink,
  },
  inputError: { borderColor: Colors.accent },
  errorText: {
    ...T.micro,
    color: Colors.accent,
    fontSize: 13,
    marginTop: -Spacing.one,
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
  linkRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 4, marginTop: Spacing.one,
  },
  linkText: { ...T.buttonSecondary, color: Colors.walnut },
  linkAccent: { ...T.buttonSecondary, color: Colors.terracotta },
});
