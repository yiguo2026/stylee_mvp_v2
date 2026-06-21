import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';
import { Colors, Spacing, Radius, Fonts, T } from '@/constants/theme';

function translateRegisterError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered')) return '该邮箱已注册，请直接登录';
  if (m.includes('password') && m.includes('weak')) return '密码太简单，请使用至少6位包含字母和数字的密码';
  if (m.includes('password')) return '密码不符合要求，请使用至少6位密码';
  if (m.includes('rate limit') || m.includes('too many')) return '请求过于频繁，请稍后再试';
  if (m.includes('email') && (m.includes('invalid') || m.includes('format'))) return '邮箱格式不正确，请输入有效的邮箱地址';
  if (m.includes('network') || m.includes('fetch')) return '网络连接失败，请检查网络';
  return msg;
}

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');

    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('邮箱格式不正确，请输入有效的邮箱地址');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少需要6位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      setLoading(false);

      if (authError) {
        setError(translateRegisterError(authError.message));
        return;
      }

      if (data.session) {
        useUserStore.getState().setSession(data.session);
        router.replace('/onboarding/step1-info');
      } else if (data.user) {
        setError('注册成功！请查看邮箱验证链接，验证后即可登录');
      } else {
        setError('该邮箱已注册，请直接登录');
      }
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
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="邮箱"
            placeholderTextColor={Colors.walnut2}
            value={email}
            onChangeText={(t) => { setEmail(t); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="密码（至少6位）"
            placeholderTextColor={Colors.walnut2}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry
          />
          <TextInput
            style={[styles.input, error && styles.inputError]}
            placeholder="确认密码"
            placeholderTextColor={Colors.walnut2}
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.paperRaised} />
              : <Text style={styles.buttonText}>注册</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.back()}
          >
            <Text style={styles.linkText}>已有账号？</Text>
            <Text style={[styles.linkText, styles.linkAccent]}>去登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  backBtn: {
    position: 'absolute',
    top: Spacing.six,
    left: Spacing.four,
  },
  backText: {
    ...T.buttonSecondary,
    color: Colors.walnut,
  },
  title: {
    ...T.pageTitle,
    marginBottom: Spacing.one,
  },
  subtitle: {
    ...T.emptyTitle,
    fontSize: 14,
    letterSpacing: 0.84,
    color: Colors.walnut,
    marginBottom: Spacing.five,
  },
  form: {
    gap: Spacing.two,
  },
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
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    ...T.micro,
    color: '#FF3B30',
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...T.buttonPrimary,
    color: Colors.paper,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.one,
  },
  linkText: {
    ...T.buttonSecondary,
    color: Colors.walnut,
  },
  linkAccent: {
    ...T.buttonSecondary,
    color: Colors.terracotta,
  },
});
