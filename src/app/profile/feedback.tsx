import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';
import { showToast } from '@/components/Toast';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'bug',      label: '功能异常 / Bug' },
  { key: 'idea',     label: '功能建议' },
  { key: 'ai',       label: 'AI 推荐效果' },
  { key: 'account',  label: '账号 / 数据' },
  { key: 'other',    label: '其他' },
];

const CONTACT_EMAIL = 'feedback@stylee.app';

export default function FeedbackPage() {
  const [category, setCategory] = useState<string>('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = content.trim().length >= 5 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      showToast('请填写至少 5 个字的反馈内容', 'error');
      return;
    }
    setSubmitting(true);
    // TODO: 接后端反馈表 / 或转 Supabase feedback 表
    setTimeout(() => {
      setSubmitting(false);
      showToast('已收到您的反馈，谢谢 💛', 'success');
      setContent('');
      setContact('');
      if (router.canGoBack()) router.back();
    }, 400);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); }} hitSlop={12}>
          <Text style={styles.headerBack}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>意见反馈</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>反馈类型</Text>
          <View style={styles.categoryWrap}>
            {CATEGORIES.map(c => {
              const active = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setCategory(c.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>反馈内容</Text>
          <View style={styles.textAreaWrap}>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="请描述您遇到的问题或建议，尽量提供具体的操作步骤～"
              placeholderTextColor={Colors.gray1}
              value={content}
              onChangeText={setContent}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.counter}>{content.length}/500</Text>
          </View>

          <Text style={styles.sectionLabel}>联系方式（选填）</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="邮箱 / 手机号，方便我们跟进"
              placeholderTextColor={Colors.gray1}
              value={contact}
              onChangeText={setContact}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.emailHintWrap}>
            <Text style={styles.emailHintLabel}>也可发送邮件至：</Text>
            <Text style={styles.emailHintValue}>{CONTACT_EMAIL}</Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>{submitting ? '提交中…' : '提交反馈'}</Text>
          </TouchableOpacity>

          <View style={styles.footerSpace} />
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
  inner: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.six },

  sectionLabel: {
    fontSize: 13, color: Colors.gray1,
    marginTop: Spacing.three, marginBottom: Spacing.two,
  },

  categoryWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.paperCard,
    borderWidth: 1, borderColor: Colors.line,
  },
  categoryChipActive: {
    backgroundColor: Colors.ink, borderColor: Colors.ink,
  },
  categoryChipText: {
    fontSize: 13, color: Colors.ink,
  },
  categoryChipTextActive: {
    color: Colors.paper, fontFamily: Fonts.uiSemiBold,
  },

  textAreaWrap: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line,
    padding: 12, minHeight: 140,
  },
  textArea: {
    fontSize: 14, color: Colors.ink, lineHeight: 22,
    minHeight: 110, padding: 0,
  },
  counter: {
    alignSelf: 'flex-end', fontSize: 12, color: Colors.gray1, marginTop: 4,
  },

  inputWrap: {
    backgroundColor: Colors.paperCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  input: { fontSize: 14, color: Colors.ink, padding: 0 },

  emailHintWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: Spacing.three,
  },
  emailHintLabel: { fontSize: 12, color: Colors.gray1 },
  emailHintValue: {
    fontSize: 12, color: Colors.ink, fontFamily: Fonts.uiSemiBold,
  },

  submitBtn: {
    marginTop: Spacing.four,
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: {
    fontSize: 14, color: Colors.paper, fontFamily: Fonts.uiSemiBold,
  },

  footerSpace: { height: Spacing.six },
});
