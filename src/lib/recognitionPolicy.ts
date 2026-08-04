export function shouldApplyRecognition(ok: boolean, itemCount: number): boolean {
  return ok && itemCount > 0;
}
