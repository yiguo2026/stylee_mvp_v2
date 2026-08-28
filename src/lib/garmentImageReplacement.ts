import { mergeReplacementImageAttrs } from './outfitImageMetrics.ts';

export interface ReplacementImageUpdate {
  image_url: string;
  ai_recognized_attrs: Record<string, unknown>;
}

export function buildInitialReplacementImageUpdate(
  imageUrl: string,
  existingAttrs: Record<string, unknown> | null | undefined,
): ReplacementImageUpdate {
  const { visible_bounds: _previousVisibleBounds, ...attrs } = existingAttrs ?? {};
  return { image_url: imageUrl, ai_recognized_attrs: attrs };
}

export function buildFinalReplacementImageUpdate(
  imageUrl: string,
  latestAttrs: Record<string, unknown> | null | undefined,
  replacementMetadata: object,
): ReplacementImageUpdate {
  return {
    image_url: imageUrl,
    ai_recognized_attrs: mergeReplacementImageAttrs(latestAttrs, replacementMetadata),
  };
}

export function imageUriAfterInitialReplacementWrite(
  previousCommittedImageUri: string,
  selectedImageUri: string,
  result: ReplacementInitialWriteResult,
): string {
  return result === 'failed' ? previousCommittedImageUri : selectedImageUri;
}

export type ReplacementInitialWriteResult = 'started' | 'failed' | 'stale';

export async function beginReplacementAfterInitialWrite({
  writeInitial,
  isCurrent,
  startBackground,
}: {
  writeInitial: () => boolean | void | Promise<boolean | void>;
  isCurrent: () => boolean;
  startBackground: () => void;
}): Promise<ReplacementInitialWriteResult> {
  try {
    if (await writeInitial() === false) return 'failed';
  } catch {
    return 'failed';
  }
  if (!isCurrent()) return 'stale';
  startBackground();
  return 'started';
}
