export interface OutfitVisibleBounds {
  left: number;
  top: number;
  width: number;
  height: number;
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
