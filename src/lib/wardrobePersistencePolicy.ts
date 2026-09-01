export const WARDROBE_IMPORT_CONFLICT_TARGET = 'user_id,import_key';

export function wardrobePersistenceMethod(
  item: { import_key?: string | null },
): 'insert' | 'upsert' {
  return typeof item.import_key === 'string' && item.import_key.trim()
    ? 'upsert'
    : 'insert';
}
