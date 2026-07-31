import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';

interface StyleeNavigationBarProps {
  title: string;
  onBack?: () => void;
  trailingLabel?: string;
  trailingSelected?: boolean;
  onTrailingPress?: () => void;
}

export function StyleeNavigationBar({
  title,
  onBack,
  trailingLabel,
  trailingSelected = false,
  onTrailingPress,
}: StyleeNavigationBarProps) {
  return (
    <View style={styles.root}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={4}
            onPress={onBack}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Feather name="arrow-left" size={20} color={ds.color.semantic.text.primary} />
            <Text style={styles.backLabel}>返回</Text>
          </Pressable>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <View style={[styles.side, styles.trailingSide]}>
        {trailingLabel && onTrailingPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={trailingSelected ? '取消收藏' : trailingLabel}
            accessibilityState={{ selected: trailingSelected }}
            hitSlop={4}
            onPress={onTrailingPress}
            style={({ pressed }) => [styles.action, styles.trailing, pressed && styles.pressed]}
          >
            <Feather
              name="heart"
              size={20}
              color={trailingSelected ? ds.color.semantic.text.accent : ds.color.semantic.text.tertiary}
            />
            <Text style={[styles.trailingLabel, trailingSelected && styles.trailingSelected]}>
              {trailingSelected ? '已收藏' : trailingLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 52,
    paddingHorizontal: ds.space[2],
    borderBottomWidth: 1,
    borderBottomColor: ds.color.semantic.border.subtle,
    backgroundColor: ds.color.semantic.surface.base,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'flex-start',
  },
  trailingSide: {
    alignItems: 'flex-end',
  },
  action: {
    minHeight: ds.size.control.minimumTouch,
    minWidth: ds.size.control.minimumTouch,
    paddingHorizontal: ds.space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds.space[1],
    borderRadius: ds.radius.md,
  },
  trailing: {
    justifyContent: 'flex-end',
  },
  pressed: {
    backgroundColor: ds.color.semantic.status.neutralSubtle,
  },
  backLabel: {
    ...ds.typography.content,
    fontFamily: Fonts.ui,
    color: ds.color.semantic.text.primary,
  },
  title: {
    ...ds.typography.heading,
    fontFamily: Fonts.titleSerif,
    color: ds.color.semantic.text.primary,
    textAlign: 'center',
    maxWidth: '42%',
  },
  trailingLabel: {
    ...ds.typography.support,
    fontFamily: Fonts.body,
    color: ds.color.semantic.text.tertiary,
  },
  trailingSelected: {
    color: ds.color.semantic.text.accent,
  },
});
