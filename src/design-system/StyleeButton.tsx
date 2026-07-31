import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';

export type StyleeButtonHierarchy = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type StyleeButtonSize = 'large' | 'medium' | 'small';

interface StyleeButtonProps {
  label: string;
  onPress?: () => void;
  hierarchy?: StyleeButtonHierarchy;
  size?: StyleeButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const heightBySize: Record<StyleeButtonSize, number> = {
  large: ds.component.button.largeHeight,
  medium: ds.component.button.mediumHeight,
  small: ds.component.button.smallHeight,
};

export function StyleeButton({
  label,
  onPress,
  hierarchy = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  style,
  labelStyle,
  accessibilityLabel,
  accessibilityHint,
}: StyleeButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { minHeight: heightBySize[size] },
        hierarchyStyles[hierarchy],
        pressed && !isDisabled && pressedStyles[hierarchy],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={[styles.content, loading && styles.hidden]}>
        {leadingIcon}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            hierarchy === 'primary' ? styles.labelInverse : styles.labelPrimary,
            hierarchy === 'destructive' && styles.labelDestructive,
            isDisabled && styles.labelDisabled,
            labelStyle,
          ]}
        >
          {label}
        </Text>
        {trailingIcon}
      </View>
      {loading ? (
        <ActivityIndicator
          style={styles.loading}
          color={hierarchy === 'primary' ? ds.color.semantic.text.inverse : ds.color.semantic.text.primary}
        />
      ) : null}
    </Pressable>
  );
}

const hierarchyStyles = StyleSheet.create({
  primary: {
    backgroundColor: ds.color.semantic.action.primary,
    borderColor: ds.color.semantic.action.primary,
  },
  secondary: {
    backgroundColor: ds.color.semantic.action.secondary,
    borderColor: ds.color.semantic.border.default,
  },
  tertiary: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  destructive: {
    backgroundColor: ds.color.semantic.status.attentionSubtle,
    borderColor: ds.color.semantic.status.attentionSubtle,
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: ds.color.semantic.action.primaryPressed,
    borderColor: ds.color.semantic.action.primaryPressed,
  },
  secondary: {
    backgroundColor: ds.color.semantic.status.neutralSubtle,
  },
  tertiary: {
    backgroundColor: ds.color.semantic.status.neutralSubtle,
  },
  destructive: {
    opacity: 0.84,
  },
});

const styles = StyleSheet.create({
  base: {
    minWidth: ds.size.control.minimumTouch,
    paddingHorizontal: ds.component.button.horizontalPadding,
    borderRadius: ds.component.button.radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ds.space[2],
  },
  hidden: {
    opacity: 0,
  },
  label: {
    ...ds.typography.content,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  labelPrimary: {
    color: ds.color.semantic.text.primary,
  },
  labelInverse: {
    color: ds.color.semantic.text.inverse,
  },
  labelDestructive: {
    color: ds.color.semantic.action.destructive,
  },
  disabled: {
    backgroundColor: ds.color.semantic.action.disabled,
    borderColor: ds.color.semantic.action.disabled,
  },
  labelDisabled: {
    color: ds.color.semantic.text.tertiary,
  },
  loading: {
    position: 'absolute',
  },
});
