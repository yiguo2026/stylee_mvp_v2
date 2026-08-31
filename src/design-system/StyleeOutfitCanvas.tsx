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
  sourceImageGeometryForVisiblePlacement,
  type OutfitCanvasLayoutItem,
} from '@/lib/outfitCanvasLayout';
import { parseOutfitVisibleBounds } from '@/lib/outfitImageMetrics';
import {
  commitOutfitCanvasImageSources,
  markOutfitCanvasImageError,
  outfitCanvasImageAspectFor,
  outfitCanvasImageHasError,
  outfitCanvasImagePresentation,
  outfitCanvasImageSourceKey,
  outfitCanvasImageUsesVisibleGeometry,
  outfitCanvasRemoteImageUri,
  planOutfitCanvasImageRequest,
  requestOutfitImageAspect,
  rememberOutfitCanvasImageAspect,
  type OutfitCanvasCommittedSourceRegistry,
  type OutfitCanvasImageAspectCache,
  type OutfitCanvasImageRequestRegistry,
  type OutfitCanvasImageStatusRegistry,
  settleOutfitCanvasImageRequest,
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
  const [loadedImageAspects, setLoadedImageAspects] = useState<OutfitCanvasImageAspectCache>({});
  const [imageErrors, setImageErrors] = useState<OutfitCanvasImageStatusRegistry>({});
  const [requestRevision, setRequestRevision] = useState(0);
  const imageRequests = useRef<OutfitCanvasImageRequestRegistry>({});
  const committedSources = useRef<OutfitCanvasCommittedSourceRegistry>({});
  const isMounted = useRef(false);
  const preparedItems = useMemo<PreparedCanvasItem[]>(() => items.map((item) => {
    const source = item.imageSource !== undefined && item.imageSource !== null
      ? item.imageSource as ImageSourcePropType
      : item.imageUri
        ? { uri: item.imageUri }
        : undefined;
    const sourceKey = outfitCanvasImageSourceKey(item.id, source);
    const sourceUri = outfitCanvasRemoteImageUri(source);
    const matchingLoadedAspect = outfitCanvasImageAspectFor(
      loadedImageAspects,
      item.id,
      sourceKey,
    );
    const imageAspectRatio = validAspectRatio(item.imageAspectRatio)
      ? item.imageAspectRatio
      : matchingLoadedAspect;
    const layoutItem = imageAspectRatio === item.imageAspectRatio
      ? item
      : { ...item, imageAspectRatio };
    return { layoutItem, originalItem: item, source, sourceKey, sourceUri };
  }), [items, loadedImageAspects]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    committedSources.current = commitOutfitCanvasImageSources(
      committedSources.current,
      preparedItems.map((entry) => ({
        itemId: entry.originalItem.id,
        sourceKey: entry.sourceKey,
      })),
    );
  }, [preparedItems]);

  useEffect(() => {
    preparedItems.forEach((entry) => {
      if (
        !entry.sourceUri
        || validAspectRatio(entry.originalItem.imageAspectRatio)
        || validAspectRatio(entry.layoutItem.imageAspectRatio)
      ) return;

      const plan = planOutfitCanvasImageRequest(
        imageRequests.current,
        committedSources.current,
        entry.originalItem.id,
        entry.sourceKey,
      );
      imageRequests.current = plan.registry;
      const request = plan.request;
      if (!request) return;

      let outcome: 'success' | 'failure' = 'failure';
      let aspectRatio: number | null = null;
      void requestOutfitImageAspect(entry.sourceUri, Image.getSize)
        .then(
          (resolvedAspectRatio) => {
            outcome = 'success';
            aspectRatio = resolvedAspectRatio;
          },
          () => undefined,
        )
        .finally(() => {
          const resolvedAspectRatio = aspectRatio;
          const requestIsCurrent = isMounted.current && request.generation
            === committedSources.current[request.itemId]?.generation
            && request.sourceKey === committedSources.current[request.itemId]?.sourceKey;
          if (outcome === 'success' && resolvedAspectRatio !== null && requestIsCurrent) {
            setLoadedImageAspects((current) => rememberOutfitCanvasImageAspect(
              current,
              request.itemId,
              request.sourceKey,
              resolvedAspectRatio,
            ));
          }
          const settlement = settleOutfitCanvasImageRequest(
            imageRequests.current,
            committedSources.current,
            request,
            outcome,
          );
          imageRequests.current = settlement.registry;
          if (settlement.scheduleRetry && isMounted.current) {
            setRequestRevision((current) => current + 1);
          }
        });
    });
  }, [preparedItems, requestRevision]);
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
        const usesVisibleSourceGeometry = outfitCanvasImageUsesVisibleGeometry(
          source,
          hasCompleteVisibleMetrics(entry.item),
        );
        const geometry = sourceImageGeometryForVisiblePlacement(entry);
        const hasError = preparedItem
          ? outfitCanvasImageHasError(imageErrors, entry.item.id, preparedItem.sourceKey)
          : false;
        const presentation = outfitCanvasImagePresentation({
          hasSource: Boolean(source),
          hasError,
          hasCompleteVisibleMetrics: usesVisibleSourceGeometry,
        });
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
            {presentation === 'mapped' && source ? (
              <View style={styles.mappedImageClip}>
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
                  style={[styles.mappedImage, {
                    left: percent(geometry.left),
                    top: percent(geometry.top),
                    width: percent(geometry.width),
                    height: percent(geometry.height),
                  }]}
                  resizeMode="stretch"
                />
              </View>
            ) : presentation === 'legacy' && source ? (
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
                style={[styles.image, {
                  top: imageOffsetY,
                  transform: [{ scale: garmentImageScale(entry.role) }],
                }]}
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
  mappedImageClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  mappedImage: {
    position: 'absolute',
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
