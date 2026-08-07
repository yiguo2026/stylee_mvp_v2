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
