/**
 * Wrap a promise (or thenable, e.g. a Supabase query builder) with a timeout so
 * that a hung network request rejects instead of leaving the UI spinning forever.
 */
export function withTimeout<T>(p: PromiseLike<T>, ms = 10000, label = 'request'): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}
