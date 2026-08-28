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
  sourceKey: string | null;
  generation: number;
  active: boolean;
}>>;

export type OutfitCanvasImageRequestRegistry = Readonly<Record<string, {
  generation: number;
  status: 'in_flight' | 'failed';
}>>;

export interface OutfitCanvasImageRequest {
  requestKey: string;
  itemId: string;
  sourceKey: string;
  generation: number;
}

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

export function commitOutfitCanvasImageSources(
  current: OutfitCanvasCommittedSourceRegistry,
  entries: readonly { itemId: string; sourceKey: string }[],
): OutfitCanvasCommittedSourceRegistry {
  const activeSources = new Map(entries.map(({ itemId, sourceKey }) => [itemId, sourceKey]));
  const itemIds = new Set([...Object.keys(current), ...activeSources.keys()]);
  const next: Record<string, { sourceKey: string | null; generation: number; active: boolean }> = {};
  let changed = false;

  itemIds.forEach((itemId) => {
    const previous = current[itemId];
    const sourceKey = activeSources.get(itemId);
    if (sourceKey === undefined) {
      const tombstone = previous?.active
        ? { sourceKey: previous.sourceKey, generation: previous.generation + 1, active: false }
        : previous;
      if (tombstone) next[itemId] = tombstone;
      if (previous?.active) changed = true;
      return;
    }

    const generation = previous?.active && previous.sourceKey === sourceKey
      ? previous.generation
      : (previous?.generation ?? 0) + 1;
    const entry = { sourceKey, generation, active: true };
    next[itemId] = entry;
    if (
      previous?.sourceKey !== entry.sourceKey
      || previous?.generation !== entry.generation
      || previous?.active !== entry.active
    ) changed = true;
  });

  return changed ? next : current;
}

function requestMatchesCommittedSource(
  current: OutfitCanvasCommittedSourceRegistry,
  itemId: string,
  sourceKey: string,
  generation: number,
): boolean {
  const committed = current[itemId];
  return committed?.active === true
    && committed.sourceKey === sourceKey
    && committed.generation === generation;
}

export function outfitCanvasImageRequestIsCurrent(
  current: OutfitCanvasCommittedSourceRegistry,
  itemId: string,
  sourceKey: string,
  generation: number,
): boolean {
  return requestMatchesCommittedSource(current, itemId, sourceKey, generation);
}

function committedGenerationForSource(
  current: OutfitCanvasCommittedSourceRegistry,
  itemId: string,
  sourceKey: string,
): number | null {
  const committed = current[itemId];
  return committed?.active === true && committed.sourceKey === sourceKey
    ? committed.generation
    : null;
}

export function planOutfitCanvasImageRequest(
  current: OutfitCanvasImageRequestRegistry,
  committedSources: OutfitCanvasCommittedSourceRegistry,
  itemId: string,
  sourceKey: string,
): { registry: OutfitCanvasImageRequestRegistry; request: OutfitCanvasImageRequest | null } {
  const generation = committedGenerationForSource(committedSources, itemId, sourceKey);
  if (generation === null) return { registry: current, request: null };

  const requestKey = outfitCanvasImageRequestKey(itemId, sourceKey);
  const existing = current[requestKey];
  if (
    existing?.generation === generation
    && (existing.status === 'in_flight' || existing.status === 'failed')
  ) return { registry: current, request: null };
  if (existing?.status === 'in_flight') return { registry: current, request: null };

  const request = { requestKey, itemId, sourceKey, generation };
  return {
    registry: {
      ...current,
      [requestKey]: { generation, status: 'in_flight' },
    },
    request,
  };
}

function removeOutfitCanvasImageRequest(
  current: OutfitCanvasImageRequestRegistry,
  requestKey: string,
): OutfitCanvasImageRequestRegistry {
  const next: Record<string, { generation: number; status: 'in_flight' | 'failed' }> = {};
  Object.entries(current).forEach(([key, value]) => {
    if (key !== requestKey) next[key] = value;
  });
  return next;
}

export function settleOutfitCanvasImageRequest(
  current: OutfitCanvasImageRequestRegistry,
  committedSources: OutfitCanvasCommittedSourceRegistry,
  request: OutfitCanvasImageRequest,
  outcome: 'success' | 'failure',
): { registry: OutfitCanvasImageRequestRegistry; scheduleRetry: boolean } {
  const existing = current[request.requestKey];
  if (existing?.status !== 'in_flight' || existing.generation !== request.generation) {
    return { registry: current, scheduleRetry: false };
  }

  const scheduleRetry = committedGenerationForSource(
    committedSources,
    request.itemId,
    request.sourceKey,
  ) !== null && !requestMatchesCommittedSource(
    committedSources,
    request.itemId,
    request.sourceKey,
    request.generation,
  );
  const registry = outcome === 'failure'
    ? {
      ...current,
      [request.requestKey]: { generation: request.generation, status: 'failed' as const },
    }
    : removeOutfitCanvasImageRequest(current, request.requestKey);

  return { registry, scheduleRetry };
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
