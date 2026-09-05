// Node's strip-types keeps this Store's non-type-only import at runtime.
export const WardrobeItem = Object.freeze({ testOnly: true });

export function normalizeCategory<T>(category: T): T {
  return category;
}
