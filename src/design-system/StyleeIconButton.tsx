import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { ds } from './tokens';

type StyleeIconButtonStyle = 'plain' | 'filled' | 'outlined';

interface StyleeIconButtonProps {
  icon: ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  appearance?: StyleeIconButtonStyle;
  size?: 44 | 48;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StyleeIconButton({
  icon,
  accessibilityLabel,
  onPress,
  appearance = 'plain',
  size = 44,
  selected = false,
  disabled = false,
  style,
}: StyleeIconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        appearanceStyles[appearance],
        selected && styles.selected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const appearanceStyles = StyleSheet.create({
  plain: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  filled: {
    backgroundColor: ds.color.semantic.surface.input,
    borderColor: ds.color.semantic.surface.input,
  },
  outlined: {
    backgroundColor: ds.color.semantic.surface.base,
    borderColor: ds.color.semantic.border.default,
  },
});

const styles = StyleSheet.create({
  base: {
    minWidth: ds.size.control.minimumTouch,
    minHeight: ds.size.control.minimumTouch,
    borderRadius: ds.radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: ds.color.semantic.status.attentionSubtle,
    borderColor: ds.color.semantic.status.attentionSubtle,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.36,
  },
});
