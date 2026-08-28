import { PRESET_OUTFIT_IMAGE_METRICS } from '../data/outfitCanvasImageMetrics.generated.ts';

export interface OutfitVisibleBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OutfitImageMetrics {
  sourceAspectRatio?: number;
  visibleBounds?: OutfitVisibleBounds;
}

export function presetOutfitImageMetrics(uri?: string | null): OutfitImageMetrics | undefined {
  if (!uri) return undefined;
  const marker = '/preset-items/';
  const index = uri.indexOf(marker);
  if (index < 0) return undefined;
  const key = uri.slice(index).split(/[?#]/, 1)[0];
  return PRESET_OUTFIT_IMAGE_METRICS[key as keyof typeof PRESET_OUTFIT_IMAGE_METRICS];
}

const finite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

export function parseOutfitVisibleBounds(value: unknown): OutfitVisibleBounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const { left, top, width, height } = raw;
  if (!finite(left) || !finite(top) || !finite(width) || !finite(height)) return undefined;
  if (left < 0 || top < 0 || width <= 0 || height <= 0) return undefined;
  if (left + width > 1 || top + height > 1) return undefined;
  return { left, top, width, height };
}

export function visibleBoundsFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
): OutfitVisibleBounds | undefined {
  return parseOutfitVisibleBounds(attrs?.visible_bounds);
}

export function mergeReplacementImageAttrs(
  existingAttrs: Record<string, unknown> | null | undefined,
  replacementMetadata: object,
): Record<string, unknown> {
  const { visible_bounds: _existingVisibleBounds, ...existing } = existingAttrs ?? {};
  const { visible_bounds: replacementVisibleBounds, ...replacement } = replacementMetadata as Record<string, unknown>;
  const visibleBounds = parseOutfitVisibleBounds(replacementVisibleBounds);
  return {
    ...existing,
    ...replacement,
    ...(visibleBounds ? { visible_bounds: visibleBounds } : {}),
  };
}
