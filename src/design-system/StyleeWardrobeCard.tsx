import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Fonts } from '@/constants/theme';
import { ds, dsShadow } from './tokens';

interface StyleeWardrobeCardProps {
  name: string;
  metadata: string;
  imageUri?: string | null;
  imageSource?: ImageSourcePropType;
  placeholder?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function StyleeWardrobeCard({
  name,
  metadata,
  imageUri,
  imageSource,
  placeholder,
  disabled = false,
  loading = false,
  onPress,
  accessibilityLabel,
  style,
}: StyleeWardrobeCardProps) {
  const resolvedImageSource = imageSource ?? (imageUri ? { uri: imageUri } : undefined);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? `${name}，${metadata}`}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.media}>
        {resolvedImageSource ? (
          <Image
            source={resolvedImageSource}
            style={styles.image}
            resizeMode="contain"
          />
        ) : placeholder}
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={ds.color.semantic.text.primary} />
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={1} style={styles.name}>{name}</Text>
        <Text numberOfLines={1} style={styles.metadata}>{metadata}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: ds.component.wardrobeCard.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.subtle,
    backgroundColor: ds.color.semantic.surface.card,
    overflow: 'hidden',
    ...dsShadow.one,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.36,
  },
  media: {
    width: '100%',
    aspectRatio: ds.component.wardrobeCard.mediaAspectRatio,
    backgroundColor: ds.color.semantic.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ds.color.semantic.status.neutralSubtle,
    opacity: 0.82,
  },
  info: {
    minHeight: ds.component.wardrobeCard.infoMinimumHeight,
    paddingHorizontal: ds.component.wardrobeCard.infoHorizontalPadding,
    paddingVertical: ds.component.wardrobeCard.infoVerticalPadding,
    justifyContent: 'center',
  },
  name: {
    ...ds.typography.content,
    fontFamily: Fonts.ui,
    color: ds.color.semantic.text.primary,
  },
  metadata: {
    ...ds.typography.support,
    fontFamily: Fonts.body,
    color: ds.color.semantic.text.secondary,
  },
});
