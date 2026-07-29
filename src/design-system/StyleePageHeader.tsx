import React, { ComponentProps } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';

interface StyleePageHeaderProps {
  title: string;
  actionLabel?: string;
  actionIcon?: ComponentProps<typeof Feather>['name'];
  actionDisabled?: boolean;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StyleePageHeader({
  title,
  actionLabel,
  actionIcon = 'plus',
  actionDisabled = false,
  onActionPress,
  style,
}: StyleePageHeaderProps) {
  const showAction = Boolean(actionLabel && onActionPress);

  return (
    <View style={[styles.root, style]}>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      {showAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: actionDisabled }}
          disabled={actionDisabled}
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.action,
            pressed && styles.actionPressed,
            actionDisabled && styles.actionDisabled,
          ]}
        >
          <Feather
            name={actionIcon}
            size={ds.size.icon.lg}
            color={ds.color.semantic.text.primary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: ds.component.pageHeader.minimumHeight,
    paddingHorizontal: ds.component.pageHeader.horizontalPadding,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    ...ds.typography.display,
    flex: 1,
    fontFamily: Fonts.pageTitleSerif,
    color: ds.color.semantic.text.primary,
  },
  action: {
    width: ds.component.pageHeader.actionSize,
    height: ds.component.pageHeader.actionSize,
    borderRadius: ds.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    backgroundColor: ds.color.semantic.status.neutralSubtle,
  },
  actionDisabled: {
    opacity: 0.36,
  },
});
