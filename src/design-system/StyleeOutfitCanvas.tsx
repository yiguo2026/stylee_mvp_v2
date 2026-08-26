import React, { useMemo } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import {
  buildOutfitCanvasLayout,
  garmentImageOffsetY,
  garmentImageScale,
  type OutfitCanvasLayoutItem,
} from '@/lib/outfitCanvasLayout';
import { ds } from './tokens';

export interface StyleeOutfitCanvasProps {
  items: OutfitCanvasLayoutItem[];
  selectedItemId?: string | null;
  onItemPress?: (item: OutfitCanvasLayoutItem) => void;
  accessibilityLabel?: string;
  emptyLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const percent = (value: number) => `${value}%` as `${number}%`;

export function StyleeOutfitCanvas({
  items,
  selectedItemId,
  onItemPress,
  accessibilityLabel = '穿搭单品组合画布',
  emptyLabel = '暂无搭配单品',
  style,
}: StyleeOutfitCanvasProps) {
  const layout = useMemo(() => buildOutfitCanvasLayout(items), [items]);

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.canvas, style]}>
      {layout.length === 0 ? <Text style={styles.empty}>{emptyLabel}</Text> : null}
      {layout.map((entry) => {
        const source = entry.item.imageSource
          ? entry.item.imageSource as ImageSourcePropType
          : entry.item.imageUri
            ? { uri: entry.item.imageUri }
            : undefined;
        const selected = selectedItemId === entry.item.id;
        const imageOffsetY = garmentImageOffsetY(entry.role);
        return (
          <Pressable
            key={entry.item.id}
            accessibilityLabel={entry.item.name}
            accessibilityRole={onItemPress ? 'button' : 'image'}
            accessibilityState={{ selected }}
            disabled={!onItemPress}
            hitSlop={ds.space[2]}
            onPress={() => onItemPress?.(entry.item)}
            style={[
              styles.garment,
              {
                left: percent(entry.left),
                top: percent(entry.top),
                width: percent(entry.width),
                height: percent(entry.height),
                zIndex: entry.zIndex,
                transform: [{ rotate: `${entry.rotation}deg` }],
              },
            ]}
          >
            {source ? (
              <Image
                accessibilityElementsHidden
                source={source}
                style={[
                  styles.image,
                  {
                    top: imageOffsetY,
                    transform: [{ scale: garmentImageScale(entry.role) }],
                  },
                ]}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.placeholder}>
                <Text numberOfLines={2} style={styles.placeholderText}>{entry.item.name}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'relative',
    width: '100%',
    maxWidth: ds.layout.contentMaxMobile,
    minHeight: 360,
    maxHeight: 480,
    aspectRatio: 0.8,
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.default,
    borderRadius: ds.radius.xxxl,
    backgroundColor: ds.color.semantic.surface.input,
  },
  garment: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ds.radius.lg,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ds.space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.color.semantic.border.default,
    borderRadius: ds.radius.lg,
    backgroundColor: ds.color.semantic.surface.card,
  },
  placeholderText: {
    ...ds.typography.support,
    color: ds.color.semantic.text.secondary,
    textAlign: 'center',
  },
  empty: {
    ...ds.typography.content,
    color: ds.color.semantic.text.secondary,
    margin: 'auto',
  },
});
