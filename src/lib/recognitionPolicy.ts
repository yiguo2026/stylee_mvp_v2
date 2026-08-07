export function shouldApplyRecognition(ok: boolean, itemCount: number): boolean {
  return ok && itemCount > 0;
}

export function acceptedRecognitionItems<T>(ok: boolean, items: readonly T[]): T[] {
  return shouldApplyRecognition(ok, items.length) ? [...items] : [];
}
