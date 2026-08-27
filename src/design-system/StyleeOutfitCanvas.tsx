import React, { useMemo, useState } from 'react';
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
  OUTFIT_CANVAS_ASPECT_RATIO,
  OUTFIT_CANVAS_MIN_HEIGHT,
  rememberOutfitCanvasImageAspect,
  type OutfitCanvasImageAspectRegistry,
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

const validAspectRatio = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

type PreparedCanvasItem = {
  layoutItem: OutfitCanvasLayoutItem;
  originalItem: OutfitCanvasLayoutItem;
  source: ImageSourcePropType | undefined;
  sourceKey: string;
};

export function StyleeOutfitCanvas({
  items,
  selectedItemId,
  onItemPress,
  accessibilityLabel = '穿搭单品组合画布',
  emptyLabel = '暂无搭配单品',
  style,
}: StyleeOutfitCanvasProps) {
  const [loadedImageAspects, setLoadedImageAspects] = useState<
    OutfitCanvasImageAspectRegistry
  >({});
  const preparedItems = useMemo<PreparedCanvasItem[]>(() => items.map((item) => {
    const source = item.imageSource
      ? item.imageSource as ImageSourcePropType
      : item.imageUri
        ? { uri: item.imageUri }
        : undefined;
    let resolvedSource: ReturnType<typeof Image.resolveAssetSource> | undefined;
    if (source) {
      try {
        resolvedSource = Image.resolveAssetSource(source) ?? undefined;
      } catch {
        resolvedSource = undefined;
      }
    }
    const sourceKey = resolvedSource?.uri
      ?? item.imageUri
      ?? (typeof item.imageSource === 'number' ? `asset:${item.imageSource}` : `item:${item.id}`);
    const synchronousAspect = validAspectRatio(resolvedSource?.width)
      && validAspectRatio(resolvedSource?.height)
      ? resolvedSource.width / resolvedSource.height
      : null;
    const loadedAspect = loadedImageAspects[item.id];
    const matchingLoadedAspect = loadedAspect?.sourceKey === sourceKey
      ? loadedAspect.aspectRatio
      : null;
    const imageAspectRatio = validAspectRatio(item.imageAspectRatio)
      ? item.imageAspectRatio
      : matchingLoadedAspect ?? synchronousAspect;
    const layoutItem = imageAspectRatio === item.imageAspectRatio
      ? item
      : { ...item, imageAspectRatio };
    return { layoutItem, originalItem: item, source, sourceKey };
  }), [items, loadedImageAspects]);
  const layoutItems = useMemo(
    () => preparedItems.map((entry) => entry.layoutItem),
    [preparedItems],
  );
  const preparedById = useMemo(
    () => new Map(preparedItems.map((entry) => [entry.layoutItem.id, entry])),
    [preparedItems],
  );
  const layout = useMemo(() => buildOutfitCanvasLayout(layoutItems), [layoutItems]);

  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.canvas, style]}>
      {layout.length === 0 ? <Text style={styles.empty}>{emptyLabel}</Text> : null}
      {layout.map((entry) => {
        const preparedItem = preparedById.get(entry.item.id);
        const source = preparedItem?.source;
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
            onPress={() => onItemPress?.(preparedItem?.originalItem ?? entry.item)}
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
                onLoad={({ nativeEvent }) => {
                  const width = nativeEvent.source?.width;
                  const height = nativeEvent.source?.height;
                  if (
                    !preparedItem
                    || !validAspectRatio(width)
                    || !validAspectRatio(height)
                    || Math.abs((entry.item.imageAspectRatio ?? 0) - (width / height)) <= 1e-6
                  ) return;
                  setLoadedImageAspects((current) => rememberOutfitCanvasImageAspect(
                    current,
                    entry.item.id,
                    preparedItem.sourceKey,
                    width,
                    height,
                  ));
                }}
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
    minHeight: OUTFIT_CANVAS_MIN_HEIGHT,
    maxHeight: 480,
    aspectRatio: OUTFIT_CANVAS_ASPECT_RATIO,
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
