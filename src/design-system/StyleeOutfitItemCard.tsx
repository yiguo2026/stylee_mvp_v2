import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Fonts } from '@/constants/theme';
import { ds } from './tokens';
import { GarmentMediaTone } from './garmentMediaTone';
import { StyleeGarmentMedia } from './StyleeGarmentMedia';
import { StyleeStatusBadge } from './StyleeStatus';

interface StyleeOutfitItemCardProps {
  name: string;
  ownership: 'owned' | 'missing';
  media?: ReactNode;
  imageUri?: string | null;
  mediaTone?: GarmentMediaTone;
  actions?: ReactNode;
  showOwnership?: boolean;
  adjustMode?: boolean;
  loading?: boolean;
  error?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function StyleeOutfitItemCard({
  name,
  ownership,
  media,
  imageUri,
  mediaTone,
  actions,
  showOwnership = true,
  adjustMode = false,
  loading = false,
  error = false,
  onPress,
  style,
  accessibilityLabel,
}: StyleeOutfitItemCardProps) {
  const interactive = Boolean(onPress);
  const { width } = useWindowDimensions();
  const responsiveStyle = width >= ds.layout.breakpointTablet
    ? styles.tabletCard
    : styles.mobileCard;
  const content = (
    <>
      <View
        style={[
          styles.media,
          error && styles.mediaError,
        ]}
      >
        <StyleeGarmentMedia
          imageUri={imageUri}
          tone={mediaTone ?? (ownership === 'owned' ? 'owned' : 'recommended')}
          placeholder={media}
        >
          {showOwnership ? (
            <View style={styles.badgePosition}>
              <StyleeStatusBadge
                label={ownership === 'owned' ? '已拥有' : '你还没有'}
                tone={ownership === 'owned' ? 'positive' : 'attention'}
              />
            </View>
          ) : null}
          {adjustMode ? (
            <View style={styles.adjustBadge}>
              <Feather name="refresh-cw" size={12} color={ds.color.semantic.text.inverse} />
            </View>
          ) : null}
          {loading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={ds.color.semantic.text.primary} />
            </View>
          ) : null}
        </StyleeGarmentMedia>
      </View>
      <Text numberOfLines={2} style={styles.name}>{name}</Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </>
  );

  if (!interactive) {
    return <View style={[styles.card, responsiveStyle, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${name}，${ownership === 'owned' ? '已拥有' : '尚未拥有'}`}
      accessibilityHint={adjustMode ? '双击替换此单品' : '双击查看单品详情'}
      onPress={onPress}
      style={({ pressed }) => [styles.card, responsiveStyle, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    padding: ds.component.outfitItemCard.padding,
    borderRadius: ds.component.outfitItemCard.radius,
    backgroundColor: ds.color.semantic.surface.card,
  },
  mobileCard: {
    flexBasis: '46%',
    maxWidth: '50%',
  },
  tabletCard: {
    flexBasis: '30%',
    maxWidth: '33.333%',
  },
  pressed: {
    opacity: 0.82,
  },
  media: {
    width: '100%',
    aspectRatio: ds.component.outfitItemCard.mediaAspectRatio,
    borderRadius: ds.component.outfitItemCard.mediaRadius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mediaError: {
    borderWidth: 1,
    borderColor: ds.color.semantic.status.attention,
  },
  badgePosition: {
    position: 'absolute',
    top: ds.component.statusBadge.mediaInset,
    right: ds.component.statusBadge.mediaInset,
  },
  adjustBadge: {
    position: 'absolute',
    left: ds.space[2],
    bottom: ds.space[2],
    width: 24,
    height: 24,
    borderRadius: ds.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ds.color.semantic.action.primary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  name: {
    ...ds.typography.content,
    fontFamily: Fonts.body,
    color: ds.color.semantic.text.primary,
    textAlign: 'center',
    marginTop: ds.space[2],
    minHeight: 36,
  },
  actions: {
    flexDirection: 'row',
    gap: ds.space[1],
    marginTop: ds.space[1],
  },
});
