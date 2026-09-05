export type SettledRead<T> =
  | Readonly<{ status: 'fulfilled'; data: T | null; error: unknown | null }>
  | Readonly<{ status: 'rejected' }>;

export type ProfileReadPatch<P, S> = Readonly<{
  profile:
    | Readonly<{ kind: 'unchanged' }>
    | Readonly<{ kind: 'replace'; value: P | null }>;
  stylePreferences:
    | Readonly<{ kind: 'unchanged' }>
    | Readonly<{ kind: 'replace'; value: S[] }>;
  cacheProfile: P | null;
}>;

export function profileReadPatch<P, S>(
  profile: SettledRead<P>,
  stylePreferences: SettledRead<S[]>,
): ProfileReadPatch<P, S> {
  const profileSucceeded = profile.status === 'fulfilled' && profile.error === null;
  const preferencesSucceeded = stylePreferences.status === 'fulfilled'
    && stylePreferences.error === null;

  return {
    profile: profileSucceeded
      ? { kind: 'replace', value: profile.data }
      : { kind: 'unchanged' },
    stylePreferences: preferencesSucceeded
      ? { kind: 'replace', value: stylePreferences.data ?? [] }
      : { kind: 'unchanged' },
    cacheProfile: profileSucceeded ? profile.data : null,
  };
}

export function mergeWardrobeRead<T extends Readonly<{
  item_id: string;
  created_at?: string;
  updated_at?: string;
  wear_count?: number;
  favorite_count?: number;
}>>(input: Readonly<{
  rawItems: readonly T[];
  stats: Readonly<Record<string, Readonly<{ wear: number; favorite: number }>>> | null;
  pendingEdits: Readonly<Record<string, Partial<T>>>;
  deletedIds: readonly string[];
}>): T[] {
  const deletedIds = new Set(input.deletedIds);

  return input.rawItems
    .filter((item) => !deletedIds.has(item.item_id))
    .map((item) => {
      const usage = input.stats?.[item.item_id];
      const withStats = input.stats === null
        ? item
        : {
            ...item,
            wear_count: usage?.wear ?? 0,
            favorite_count: usage?.favorite ?? 0,
          };
      const edit = input.pendingEdits[item.item_id];
      return (edit === undefined ? withStats : { ...withStats, ...edit }) as T;
    })
    .sort((a, b) => {
      const createdDiff = new Date(b.created_at ?? 0).getTime()
        - new Date(a.created_at ?? 0).getTime();
      if (createdDiff !== 0) return createdDiff;

      return new Date(b.updated_at ?? 0).getTime()
        - new Date(a.updated_at ?? 0).getTime();
    });
}
