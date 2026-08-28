export type ImageGetSize = (
  uri: string,
  success: (width: number, height: number) => void,
  failure?: (error: unknown) => void,
) => void;

export type OutfitCanvasImageStatusRegistry = Readonly<Record<string, {
  sourceKey: string;
  status: 'error';
}>>;

export type OutfitCanvasImageAspectCache = Readonly<Record<string, number>>;

export type OutfitCanvasCommittedSourceRegistry = Readonly<Record<string, {
  sourceKey: string;
  generation: number;
}>>;

export type OutfitCanvasImagePresentation = 'placeholder' | 'mapped' | 'legacy';

function validAspectRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function stableSourceValue(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'object') return `${typeof value}:${String(value)}`;
  if (seen.has(value)) return '[circular]';

  seen.add(value);
  const serialized = Array.isArray(value)
    ? `[${value.map((entry) => stableSourceValue(entry, seen)).join(',')}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSourceValue((value as Record<string, unknown>)[key], seen)}`
    )).join(',')}}`;
  seen.delete(value);
  return serialized;
}

function singleSourceUri(source: unknown): string | undefined {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const uri = (source as { uri?: unknown }).uri;
  return typeof uri === 'string' && uri.length > 0 ? uri : undefined;
}

export function outfitCanvasImageSourceKey(itemId: string, source: unknown): string {
  if (typeof source === 'number') return `asset:${source}`;
  if (singleSourceUri(source)) return `uri:${stableSourceValue(source)}`;
  if (Array.isArray(source)) return `array:${stableSourceValue(source)}`;
  if (source && typeof source === 'object') return `object:${stableSourceValue(source)}`;
  return `item:${itemId}:none`;
}

export function outfitCanvasRemoteImageUri(source: unknown): string | undefined {
  const uri = singleSourceUri(source);
  return uri && /^https?:\/\//i.test(uri) ? uri : undefined;
}

export function outfitCanvasImageCacheKey(itemId: string, sourceKey: string): string {
  return `${itemId.length}:${itemId}${sourceKey.length}:${sourceKey}`;
}

export function outfitCanvasImageAspectFor(
  current: OutfitCanvasImageAspectCache,
  itemId: string,
  sourceKey: string,
): number | null {
  const aspectRatio = current[outfitCanvasImageCacheKey(itemId, sourceKey)];
  return validAspectRatio(aspectRatio) ? aspectRatio : null;
}

export function rememberOutfitCanvasImageAspect(
  current: OutfitCanvasImageAspectCache,
  itemId: string,
  sourceKey: string,
  aspectRatio: number,
): OutfitCanvasImageAspectCache {
  if (!validAspectRatio(aspectRatio)) return current;
  const key = outfitCanvasImageCacheKey(itemId, sourceKey);
  if (current[key] === aspectRatio) return current;
  return { ...current, [key]: aspectRatio };
}

export function outfitCanvasImageRequestKey(itemId: string, sourceKey: string): string {
  return outfitCanvasImageCacheKey(itemId, sourceKey);
}

export function outfitCanvasImageRequestIsInFlight(
  current: ReadonlySet<string>,
  requestKey: string,
): boolean {
  return current.has(requestKey);
}

export function startOutfitCanvasImageRequest(
  current: ReadonlySet<string>,
  requestKey: string,
): ReadonlySet<string> {
  if (current.has(requestKey)) return current;
  return new Set([...current, requestKey]);
}

export function finishOutfitCanvasImageRequest(
  current: ReadonlySet<string>,
  requestKey: string,
): ReadonlySet<string> {
  if (!current.has(requestKey)) return current;
  const next = new Set(current);
  next.delete(requestKey);
  return next;
}

export function commitOutfitCanvasImageSources(
  current: OutfitCanvasCommittedSourceRegistry,
  entries: readonly { itemId: string; sourceKey: string }[],
): OutfitCanvasCommittedSourceRegistry {
  const next: Record<string, { sourceKey: string; generation: number }> = {};
  let changed = Object.keys(current).length !== entries.length;

  entries.forEach(({ itemId, sourceKey }) => {
    const previous = current[itemId];
    const generation = previous?.sourceKey === sourceKey
      ? previous.generation
      : (previous?.generation ?? 0) + 1;
    next[itemId] = { sourceKey, generation };
    if (previous?.sourceKey !== sourceKey || previous?.generation !== generation) changed = true;
  });

  return changed ? next : current;
}

export function outfitCanvasImageRequestIsCurrent(
  current: OutfitCanvasCommittedSourceRegistry,
  itemId: string,
  sourceKey: string,
  generation: number,
): boolean {
  const committed = current[itemId];
  return committed?.sourceKey === sourceKey && committed.generation === generation;
}

export function outfitCanvasImageRequestNeedsRetry(
  current: OutfitCanvasCommittedSourceRegistry,
  itemId: string,
  sourceKey: string,
  generation: number,
): boolean {
  const committed = current[itemId];
  return committed?.sourceKey === sourceKey && committed.generation !== generation;
}

export function outfitCanvasImageUsesVisibleGeometry(
  source: unknown,
  hasCompleteVisibleMetrics: boolean,
): boolean {
  return hasCompleteVisibleMetrics && !Array.isArray(source);
}

export function outfitCanvasImagePresentation({
  hasSource,
  hasError,
  hasCompleteVisibleMetrics,
}: {
  hasSource: boolean;
  hasError: boolean;
  hasCompleteVisibleMetrics: boolean;
}): OutfitCanvasImagePresentation {
  if (!hasSource || hasError) return 'placeholder';
  return hasCompleteVisibleMetrics ? 'mapped' : 'legacy';
}

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
