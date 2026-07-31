import React, { ReactNode } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';

export type StyleeChoiceChipSelectionMode = 'single' | 'multiple';

interface StyleeChoiceChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  selectionMode?: StyleeChoiceChipSelectionMode;
  disabled?: boolean;
  leadingContent?: ReactNode;
  trailingContent?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const verticalHitSlop = Math.max(
  0,
  (ds.component.choiceChip.minimumTouch - ds.component.choiceChip.visualMinHeight) / 2,
);

export function StyleeChoiceChip({
  label,
  selected,
  onPress,
  selectionMode = 'multiple',
  disabled = false,
  leadingContent,
  trailingContent,
  style,
  accessibilityLabel,
}: StyleeChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole={selectionMode === 'single' ? 'radio' : 'checkbox'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: verticalHitSlop, bottom: verticalHitSlop, left: 2, right: 2 }}
      onPress={onPress}
      style={style}
    >
      {({ pressed }) => (
        <View
          pointerEvents="none"
          style={[
            styles.visual,
            selected && styles.selected,
            pressed && !disabled && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          {leadingContent}
          <Text
            numberOfLines={1}
            style={[styles.label, selected && styles.labelSelected]}
          >
            {label}
          </Text>
          {trailingContent}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  visual: {
    minWidth: ds.size.control.minimumTouch,
    minHeight: ds.component.choiceChip.visualMinHeight,
    paddingHorizontal: ds.component.choiceChip.horizontalPadding,
    paddingVertical: ds.component.choiceChip.verticalPadding,
    borderRadius: ds.component.choiceChip.radius,
    borderWidth: 1,
    borderColor: ds.color.semantic.border.strong,
    backgroundColor: ds.color.semantic.surface.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ds.component.choiceChip.contentGap,
  },
  selected: {
    backgroundColor: ds.color.semantic.action.primary,
    borderColor: ds.color.semantic.action.primary,
  },
  pressed: {
    opacity: 0.74,
  },
  disabled: {
    opacity: 0.36,
  },
  label: {
    ...ds.typography.content,
    fontFamily: Fonts.body,
    color: ds.color.semantic.text.primary,
  },
  labelSelected: {
    color: ds.color.semantic.text.inverse,
  },
});
