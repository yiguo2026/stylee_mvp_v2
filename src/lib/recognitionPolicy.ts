export function shouldApplyRecognition(ok: boolean, itemCount: number): boolean {
  return ok && itemCount > 0;
}

export function acceptedRecognitionItems<T>(ok: boolean, items: readonly T[]): T[] {
  return shouldApplyRecognition(ok, items.length) ? [...items] : [];
}

export function shouldFallbackToSingleRecognition(
  error?: { kind: string; status?: number },
): boolean {
  return error?.kind === 'http' && (error.status === 404 || error.status === 501);
}

export function isTrustedRecognition(provider?: string, degraded?: boolean): boolean {
  return Boolean(provider && provider !== 'mock' && degraded !== true);
}

export function shouldStandardizePhotoType(_photoType?: string): boolean {
  return true;
}

export function canStandardizeDetectedTarget(
  detectedItemCount: number,
  bbox: readonly number[] | undefined,
): boolean {
  return detectedItemCount <= 1 || bbox?.length === 4;
}

export function missingTargetBoxIndices(
  detectedItemCount: number,
  items: readonly { bbox_2d?: readonly number[] }[],
): number[] {
  if (detectedItemCount <= 1) return [];
  return items.flatMap((item, index) => (
    canStandardizeDetectedTarget(detectedItemCount, item.bbox_2d) ? [] : [index]
  ));
}
