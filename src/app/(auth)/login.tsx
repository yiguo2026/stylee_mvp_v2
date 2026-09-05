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
import { signInUsername } from '@/lib/loginAuthFlow';
import { track } from '@/lib/track';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

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
      const result = await signInUsername({
        username,
        password,
        signIn: async (email, signInPassword) => {
          const { data, error: authError } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password: signInPassword }),
            12000, 'login',
          );
          return { session: data.session, errorMessage: authError?.message ?? null };
        },
      });
      if (result.rateLimited) cooldown.start(30);
      if (!result.session) {
        setError(result.errorMessage ?? '登录失败，请重试');
        return;
      }
      try { track('auth_success', { mode: 'login', is_new_user: false }); } catch {}
      return;
    } finally {
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
