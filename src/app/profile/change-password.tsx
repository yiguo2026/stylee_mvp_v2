import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Radius, T } from '@/constants/theme';
import { showToast } from '@/components/Toast';

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    password.length >= 6 &&
    confirmPassword.length >= 6 &&
    password === confirmPassword &&
    !submitting;

  const handleSubmit = async () => {
    if (submitting) return;
    if (password.length < 6) {
      showToast('密码至少需要 6 位', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('两次密码不一致', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showToast('密码已更新', 'success');
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      showToast('修改失败：' + (e?.message || '请稍后重试'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>修改密码</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.hint}>请设置新的登录密码，至少 6 位</Text>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>新密码</Text>
              <TextInput
                style={styles.input}
                placeholder="至少 6 位"
                placeholderTextColor={Colors.walnut2}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>确认新密码</Text>
              <TextInput
                style={styles.input}
                placeholder="再次输入新密码"
                placeholderTextColor={Colors.walnut2}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color={Colors.paper} />
                : <Text style={styles.submitText}>保存新密码</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  inner: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
  },
  hint: {
    ...T.bodyText,
    fontSize: 13,
    color: Colors.walnut,
    marginBottom: Spacing.three,
  },
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  fieldLabel: { ...T.formLabel },
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
  submitBtn: {
    marginTop: Spacing.three,
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { ...T.buttonPrimary, color: Colors.paper },
});
