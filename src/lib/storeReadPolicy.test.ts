import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { test } from 'node:test';

import {
  mergeWardrobeRead,
  profileReadPatch,
  type SettledRead,
} from './storeReadPolicy.ts';

type Profile = Readonly<{ user_id: string; nickname: string }>;
const rejected = Object.freeze({ status: 'rejected' } as const);

test('keeps a failed profile unchanged without publishing cache data', () => {
  const profile: SettledRead<Profile> = {
    status: 'fulfilled',
    data: { user_id: 'account-a', nickname: 'A' },
    error: new Error('profile failed'),
  };
  assert.deepEqual(profileReadPatch(profile), {
    profile: { kind: 'unchanged' },
    cacheProfile: null,
  });
});

test('applies a successful profile and caches only returned non-null profile data', () => {
  const returnedProfile = { user_id: 'account-a', nickname: 'A' };

  assert.deepEqual(profileReadPatch<Profile>(
    { status: 'fulfilled', data: returnedProfile, error: null },
  ), {
    profile: { kind: 'replace', value: returnedProfile },
    cacheProfile: returnedProfile,
  });
});

test('distinguishes successful nulls from rejected and errored reads', () => {
  assert.deepEqual(profileReadPatch<Profile>(
    { status: 'fulfilled', data: null, error: null },
  ), {
    profile: { kind: 'replace', value: null },
    cacheProfile: null,
  });

  assert.deepEqual(profileReadPatch<Profile>(
    rejected,
  ), {
    profile: { kind: 'unchanged' },
    cacheProfile: null,
  });
});

test('user profile store has no raw preference join or second preference state source', async () => {
  const source = await readFile(fileURLToPath(new NodeURL('../stores/userStore.ts', import.meta.url)), 'utf8');

  assert.doesNotMatch(source, /user_style_preferences|tags\(\*\)/u);
  assert.doesNotMatch(source, /\bstylePreferences\b|\bsetStylePreferences\b/u);
});

type Item = Readonly<{
  item_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  wear_count?: number;
  favorite_count?: number;
}>;

test('applies deletion, stats, current edits, then newest-first sorting', () => {
  const result = mergeWardrobeRead<Item>({
    rawItems: [
      {
        item_id: 'item-old',
        name: 'A old',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-03T00:00:00.000Z',
      },
      {
        item_id: 'item-deleted',
        name: 'A deleted',
        created_at: '2026-03-01T00:00:00.000Z',
      },
      {
        item_id: 'item-new',
        name: 'A new',
        created_at: '2026-02-01T00:00:00.000Z',
      },
    ],
    stats: {
      'item-old': { wear: 3, favorite: 2 },
      'item-new': { wear: 5, favorite: 4 },
      'item-deleted': { wear: 99, favorite: 99 },
    },
    pendingEdits: {
      'item-old': { name: 'B current edit', wear_count: 8 },
    },
    deletedIds: ['item-deleted'],
  });

  assert.deepEqual(result, [
    {
      item_id: 'item-new',
      name: 'A new',
      created_at: '2026-02-01T00:00:00.000Z',
      wear_count: 5,
      favorite_count: 4,
    },
    {
      item_id: 'item-old',
      name: 'B current edit',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-03T00:00:00.000Z',
      wear_count: 8,
      favorite_count: 2,
    },
  ]);
});

test('returns base rows unchanged by missing stats while still applying current overlays', () => {
  const executeResult = Object.freeze({
    rawItems: Object.freeze([
      Object.freeze({
        item_id: 'item-shared',
        name: 'A server row',
        created_at: '2026-01-01T00:00:00.000Z',
        wear_count: 7,
        favorite_count: 6,
      }),
    ]),
    stats: null,
  });
  assert.deepEqual(Object.keys(executeResult).sort(), ['rawItems', 'stats']);

  const currentApplyTimeEdits = {
    'item-shared': { name: 'B current overlay' },
  };
  const result = mergeWardrobeRead<Item>({
    ...executeResult,
    pendingEdits: currentApplyTimeEdits,
    deletedIds: [],
  });

  assert.deepEqual(result, [{
    item_id: 'item-shared',
    name: 'B current overlay',
    created_at: '2026-01-01T00:00:00.000Z',
    wear_count: 7,
    favorite_count: 6,
  }]);
});

test('uses updated time only as the tie-breaker for equal creation times', () => {
  const result = mergeWardrobeRead<Item>({
    rawItems: [
      { item_id: 'item-a', name: 'A', created_at: '2026-01-01', updated_at: '2026-01-02' },
      { item_id: 'item-b', name: 'B', created_at: '2026-01-01', updated_at: '2026-01-03' },
    ],
    stats: {},
    pendingEdits: {},
    deletedIds: [],
  });

  assert.deepEqual(result.map((item) => item.name), ['B', 'A']);
});
