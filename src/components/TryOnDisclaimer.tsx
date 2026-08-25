import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, T, Fonts } from '@/constants/theme';

type Variant = 'full' | 'inline';

/**
 * AI 试穿免责声明
 * - full：结果图下方的浅色说明块，带「AI 生成 · 仅供参考」标签 + 详细说明
 * - inline：入口 / 上传处的一行小字提示
 */
export function TryOnDisclaimer({ variant = 'full' }: { variant?: Variant }) {
  if (variant === 'inline') {
    return (
      <Text style={styles.inline}>
        试穿效果由 AI 生成，仅供参考，实际上身以实物为准
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.tagRow}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>AI 生成 · 仅供参考</Text>
        </View>
      </View>
      <Text style={styles.body}>
        效果由 AI 模拟生成，版型、颜色、材质与尺寸贴合度可能与真实上身存在差异，不构成购买建议或合身承诺，请以实物为准。上传的照片仅用于生成本次试穿效果，并按隐私政策处理。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── full ──
  card: {
    backgroundColor: Colors.paperCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    gap: Spacing.one + 2,
  },
  tagRow: { flexDirection: 'row' },
  tag: {
    backgroundColor: Colors.signalSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  tagText: { ...T.caption, color: Colors.signal, fontFamily: Fonts.uiSemiBold },
  body: { ...T.micro, color: Colors.walnut2, lineHeight: 18 },

  // ── inline ──
  inline: {
    ...T.micro,
    color: Colors.walnut2,
    textAlign: 'center',
    lineHeight: 16,
  },
});
