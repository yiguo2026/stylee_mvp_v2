import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';

export type StyleeStatusTone = 'positive' | 'attention' | 'neutral';

interface StyleeStatusBadgeProps {
  label: string;
  tone?: StyleeStatusTone;
  icon?: ReactNode;
}

interface StyleeInlineStatusProps {
  children: string;
  tone?: StyleeStatusTone;
  showIcon?: boolean;
}

const iconName: Record<StyleeStatusTone, 'check-circle' | 'alert-circle' | 'info'> = {
  positive: 'check-circle',
  attention: 'alert-circle',
  neutral: 'info',
};

const toneBackground = {
  positive: ds.color.semantic.status.positiveSubtle,
  attention: ds.color.semantic.status.attentionSubtle,
  neutral: ds.color.semantic.status.neutralSubtle,
};

const toneForeground = {
  positive: ds.color.semantic.status.positive,
  attention: ds.color.semantic.status.attention,
  neutral: ds.color.semantic.status.neutral,
};

export function StyleeStatusBadge({
  label,
  tone = 'neutral',
  icon,
}: StyleeStatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: toneBackground[tone] }]}>
      {icon}
      <Text style={[styles.badgeText, { color: toneForeground[tone] }]}>{label}</Text>
    </View>
  );
}

export function StyleeInlineStatus({
  children,
  tone = 'neutral',
  showIcon = true,
}: StyleeInlineStatusProps) {
  return (
    <View
      accessibilityRole="text"
      style={[styles.inline, { backgroundColor: toneBackground[tone] }]}
    >
      {showIcon ? (
        <Feather name={iconName[tone]} size={ds.size.icon.sm} color={toneForeground[tone]} />
      ) : null}
      <Text
        numberOfLines={2}
        style={[styles.inlineText, { color: toneForeground[tone] }]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: ds.component.statusBadge.height,
    paddingHorizontal: ds.component.statusBadge.horizontalPadding,
    borderRadius: ds.component.statusBadge.radius,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds.space[1],
  },
  badgeText: {
    ...ds.typography.micro,
    fontFamily: Fonts.body,
  },
  inline: {
    minHeight: ds.component.inlineStatus.minimumHeight,
    paddingHorizontal: ds.component.inlineStatus.horizontalPadding,
    paddingVertical: ds.component.inlineStatus.verticalPadding,
    borderRadius: ds.component.inlineStatus.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ds.space[2],
  },
  inlineText: {
    ...ds.typography.bodySmall,
    fontFamily: Fonts.body,
    flexShrink: 1,
    textAlign: 'center',
  },
});
