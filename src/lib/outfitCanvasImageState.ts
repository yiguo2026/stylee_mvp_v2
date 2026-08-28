export type ImageGetSize = (
  uri: string,
  success: (width: number, height: number) => void,
  failure?: (error: unknown) => void,
) => void;

export type OutfitCanvasImageStatusRegistry = Readonly<Record<string, {
  sourceKey: string;
  status: 'error';
}>>;

export function requestOutfitImageAspect(uri: string, getSize: ImageGetSize): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      getSize(uri, (width, height) => {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          reject(new Error('invalid image dimensions'));
          return;
        }
        resolve(width / height);
      }, reject);
    } catch (error) {
      reject(error);
    }
  });
}

export function markOutfitCanvasImageError(
  current: OutfitCanvasImageStatusRegistry,
  itemId: string,
  sourceKey: string,
): OutfitCanvasImageStatusRegistry {
  const previous = current[itemId];
  if (previous?.sourceKey === sourceKey && previous.status === 'error') return current;

  return {
    ...current,
    [itemId]: { sourceKey, status: 'error' },
  };
}

export function outfitCanvasImageHasError(
  current: OutfitCanvasImageStatusRegistry,
  itemId: string,
  sourceKey: string,
): boolean {
  const status = current[itemId];
  return status?.sourceKey === sourceKey && status.status === 'error';
}
