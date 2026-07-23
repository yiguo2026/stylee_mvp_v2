import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

// Encode uppercase letters to preserve case (must match register.tsx encoding)
function usernameToEmail(username: string) {
  const encoded = [...username.trim()].map(c => {
    if (c >= 'A' && c <= 'Z') return '~' + c.toLowerCase();
    return c;
  }).join('');
  return `${encoded}@users.stylee.app`;
}

function translateLoginError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid password')) return '密码错误';
  if (m.includes('email not confirmed')) return '账号未验证';
  if (m.includes('too many requests') || m.includes('rate limit')) return '尝试次数过多，请稍后再试';
  if (m.includes('network') || m.includes('fetch')) return '网络连接失败，请检查网络';
  return '密码错误，请重试';
}

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const handleLogin = async () => {
    setError('');
    if (!username.trim()) { setError('请输入用户名'); return; }
    if (!password) { setError('请输入密码'); return; }

    setLoading(true);

    // Check if username exists before attempting login
    const { data: existingUser } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', username.trim())
      .maybeSingle();
    if (!existingUser) {
      setLoading(false);
      setError('账号不存在');
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (authError) {
      setLoading(false);
      setError(translateLoginError(authError.message));
      return;
    }
    if (data.session) {
      useUserStore.getState().setSession(data.session);
      await useUserStore.getState().fetchProfile();
      setLoading(false);
      const { profile } = useUserStore.getState();
      // DB trigger auto-creates users with gender='private'; onboarding sets it to female/male/other.
      router.replace(profile && profile.gender !== 'private' ? '/(tabs)' : '/onboarding/step1-info');
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
            style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit || loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.paper} />
              : <Text style={styles.buttonText}>登录</Text>
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
