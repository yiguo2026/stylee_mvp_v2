import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  sourceImageGeometryForVisiblePlacement,
  type OutfitCanvasImageAspectRegistry,
  type OutfitCanvasLayoutItem,
} from '@/lib/outfitCanvasLayout';
import { parseOutfitVisibleBounds } from '@/lib/outfitImageMetrics';
import {
  markOutfitCanvasImageError,
  outfitCanvasImageHasError,
  requestOutfitImageAspect,
  type OutfitCanvasImageStatusRegistry,
} from '@/lib/outfitCanvasImageState';
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
  sourceUri?: string;
};

function imageSourceUri(source: ImageSourcePropType | undefined): string | undefined {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const uri = (source as { uri?: unknown }).uri;
  return typeof uri === 'string' && uri.length > 0 ? uri : undefined;
}

function isRemoteImageUri(uri: string | undefined): uri is string {
  return Boolean(uri && /^https?:\/\//i.test(uri));
}

function hasCompleteVisibleMetrics(item: OutfitCanvasLayoutItem): boolean {
  return validAspectRatio(item.imageAspectRatio) && Boolean(parseOutfitVisibleBounds(item.visibleBounds));
}

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
  const [imageErrors, setImageErrors] = useState<OutfitCanvasImageStatusRegistry>({});
  const requestedImageDimensions = useRef(new Set<string>());
  const currentSourceKeys = useRef(new Map<string, string>());
  const isMounted = useRef(false);
  const preparedItems = useMemo<PreparedCanvasItem[]>(() => items.map((item) => {
    const source = item.imageSource
      ? item.imageSource as ImageSourcePropType
      : item.imageUri
        ? { uri: item.imageUri }
        : undefined;
    const sourceUri = imageSourceUri(source);
    const sourceKey = sourceUri
      ?? item.imageUri
      ?? (typeof item.imageSource === 'number' ? `asset:${item.imageSource}` : `item:${item.id}`);
    const loadedAspect = loadedImageAspects[item.id];
    const matchingLoadedAspect = loadedAspect?.sourceKey === sourceKey
      ? loadedAspect.aspectRatio
      : null;
    const imageAspectRatio = validAspectRatio(item.imageAspectRatio)
      ? item.imageAspectRatio
      : matchingLoadedAspect;
    const layoutItem = imageAspectRatio === item.imageAspectRatio
      ? item
      : { ...item, imageAspectRatio };
    return { layoutItem, originalItem: item, source, sourceKey, sourceUri };
  }), [items, loadedImageAspects]);
  currentSourceKeys.current = new Map(preparedItems.map((entry) => [
    entry.originalItem.id,
    entry.sourceKey,
  ]));

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    preparedItems.forEach((entry) => {
      if (
        !isRemoteImageUri(entry.sourceUri)
        || validAspectRatio(entry.originalItem.imageAspectRatio)
        || validAspectRatio(entry.layoutItem.imageAspectRatio)
      ) return;

      const requestKey = `${entry.originalItem.id}\u0000${entry.sourceKey}`;
      if (requestedImageDimensions.current.has(requestKey)) return;
      requestedImageDimensions.current.add(requestKey);

      void requestOutfitImageAspect(entry.sourceUri, Image.getSize)
        .then((aspectRatio) => {
          if (
            !isMounted.current
            || currentSourceKeys.current.get(entry.originalItem.id) !== entry.sourceKey
          ) return;
          setLoadedImageAspects((current) => rememberOutfitCanvasImageAspect(
            current,
            entry.originalItem.id,
            entry.sourceKey,
            aspectRatio,
            1,
          ));
        })
        .catch(() => undefined);
    });
  }, [preparedItems]);
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
        const usesVisibleSourceGeometry = hasCompleteVisibleMetrics(entry.item);
        const geometry = sourceImageGeometryForVisiblePlacement(entry);
        const hasError = preparedItem
          ? outfitCanvasImageHasError(imageErrors, entry.item.id, preparedItem.sourceKey)
          : false;
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
            {source && !hasError ? (
              <Image
                accessibilityElementsHidden
                source={source}
                onError={() => {
                  if (!preparedItem) return;
                  setImageErrors((current) => markOutfitCanvasImageError(
                    current,
                    entry.item.id,
                    preparedItem.sourceKey,
                  ));
                }}
                style={[
                  styles.image,
                  usesVisibleSourceGeometry
                    ? {
                      left: percent(geometry.left),
                      top: percent(geometry.top),
                      width: percent(geometry.width),
                      height: percent(geometry.height),
                    }
                    : {
                      top: imageOffsetY,
                      transform: [{ scale: garmentImageScale(entry.role) }],
                    },
                ]}
                resizeMode={usesVisibleSourceGeometry ? 'stretch' : 'contain'}
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
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
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
