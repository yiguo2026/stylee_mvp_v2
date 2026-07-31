import React from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';

interface StyleeSearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StyleeSearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  disabled = false,
  autoFocus = false,
  containerStyle,
  testID,
}: StyleeSearchFieldProps) {
  return (
    <View
      accessibilityState={{ disabled }}
      style={[styles.root, disabled && styles.disabled, containerStyle]}
      testID={testID}
    >
      <Feather
        name="search"
        size={ds.component.searchField.iconSize}
        color={ds.color.semantic.text.tertiary}
      />
      <TextInput
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        clearButtonMode="while-editing"
        editable={!disabled}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={ds.color.semantic.text.tertiary}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: ds.component.searchField.height,
    paddingHorizontal: ds.component.searchField.horizontalPadding,
    borderRadius: ds.component.searchField.radius,
    borderWidth: 1,
    borderColor: ds.color.semantic.border.default,
    backgroundColor: ds.color.semantic.surface.input,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ds.component.searchField.contentGap,
  },
  input: {
    ...ds.typography.content,
    flex: 1,
    height: '100%',
    paddingVertical: ds.space[2],
    fontFamily: Fonts.body,
    color: ds.color.semantic.text.primary,
  },
  disabled: {
    opacity: 0.36,
  },
});
