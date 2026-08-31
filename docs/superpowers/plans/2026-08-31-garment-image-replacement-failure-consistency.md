# Garment Image Replacement Failure Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make initial and final wardrobe-image replacement writes roll back local optimistic state on persistence failure and prevent success UI for an uncommitted transparent master.

**Architecture:** A pure state module owns per-item, per-field mutation generations, optimistic snapshots, and guarded local rollback. The Zustand store keeps ordinary edits optimistic but adds a replacement-only rollbackable write action. The replacement hook uses an ordered final-write helper so the master URI, success toast, and recognition begin only after the final row write succeeds.

**Tech Stack:** TypeScript 5.8, Node test runner, Zustand 5, Supabase JS 2.106, Expo SDK 55 API reference, React Native/Expo Image Picker.

**Spec:** `docs/superpowers/specs/2026-08-31-garment-image-replacement-failure-consistency-design.md`

## Global Constraints

- Work only in the isolated `codex/stylee-todo-wave` worktree created from `origin/main@cffc93126f15d85aea97e84a56f2803e271a0db0`.
- Read and preserve the Expo v55 API contract at `https://docs.expo.dev/versions/v55.0.0/`; do not upgrade dependencies in this delivery.
- Keep ordinary `updateItem` failure behavior unchanged: ordinary edits remain local when Supabase is unavailable.
- Rollback replacement failures locally only; never issue a compensating Supabase write.
- Preserve the existing image picker, Storage persistence, standardization, visible-bounds merging, source generations, and recognition contracts.
- Do not change schema, RLS, Storage policy, tokens, shared visual components, layout, model-service, or historical rows.
- Follow strict RED -> GREEN for every behavior change and commit only after the relevant focused tests pass.

---

### Task 1: Pure per-field optimistic transaction state

**Files:**

- Create: `src/lib/wardrobeOptimisticUpdate.ts`
- Create: `src/lib/wardrobeOptimisticUpdate.test.ts`

**Interfaces:**

- Consumes: `WardrobeItem` from `src/types/index.ts`.
- Produces: `WardrobeMutationGenerations`, `WardrobeOptimisticState`, `WardrobeRollbackTransaction`, `applyWardrobeOptimisticUpdate`, and `rollbackWardrobeOptimisticUpdate`.
- Used by: Task 2 store actions.

- [ ] **Step 1: Write the failing pure-state tests**

Create `src/lib/wardrobeOptimisticUpdate.test.ts` with a complete `WardrobeItem` fixture and these tests:

```ts
import assert from 'node:assert';
import { test } from 'node:test';
import type { WardrobeItem } from '@/types';
import {
  applyWardrobeOptimisticUpdate,
  rollbackWardrobeOptimisticUpdate,
  type WardrobeOptimisticState,
} from './wardrobeOptimisticUpdate.ts';

const item: WardrobeItem = {
  item_id: 'item-1',
  user_id: 'user-1',
  name: '旧名称',
  category: '上装',
  color: '白色',
  image_url: 'https://storage.test/old.png',
  source_type: 'album_ai',
  status: 'active',
  ai_recognized_attrs: {
    manual_fields: ['color'],
    visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  },
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
};

const initialState = (): WardrobeOptimisticState => ({
  items: [structuredClone(item)],
  pendingEdits: {},
  mutationGenerations: {},
});

test('failed replacement restores touched item fields and removes new pending fields', () => {
  const applied = applyWardrobeOptimisticUpdate(
    initialState(),
    item.item_id,
    {
      image_url: 'file:///replacement.jpg',
      ai_recognized_attrs: { manual_fields: ['color'] },
    },
    '2026-08-31T01:00:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    applied.state,
    applied.transaction,
  );

  assert.deepEqual(rolledBack.items, [item]);
  assert.deepEqual(rolledBack.pendingEdits, {});
});

test('rollback restores pre-existing pending values instead of dropping them', () => {
  const state = initialState();
  state.pendingEdits[item.item_id] = { name: '待提交名称', image_url: item.image_url };
  const applied = applyWardrobeOptimisticUpdate(
    state,
    item.item_id,
    { image_url: 'file:///replacement.jpg' },
    '2026-08-31T01:00:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    applied.state,
    applied.transaction,
  );

  assert.equal(rolledBack.pendingEdits[item.item_id]?.name, '待提交名称');
  assert.equal(rolledBack.pendingEdits[item.item_id]?.image_url, item.image_url);
});

test('stale failure preserves a newer same-field replacement', () => {
  const first = applyWardrobeOptimisticUpdate(
    initialState(), item.item_id, { image_url: 'file:///first.jpg' },
    '2026-08-31T01:00:00.000Z',
  );
  const second = applyWardrobeOptimisticUpdate(
    first.state, item.item_id, { image_url: 'file:///second.jpg' },
    '2026-08-31T01:01:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    second.state,
    first.transaction,
  );

  assert.equal(rolledBack.items[0].image_url, 'file:///second.jpg');
  assert.equal(rolledBack.pendingEdits[item.item_id]?.image_url, 'file:///second.jpg');
});

test('rollback restores failed image fields while preserving an unrelated newer edit', () => {
  const replacement = applyWardrobeOptimisticUpdate(
    initialState(), item.item_id, { image_url: 'file:///replacement.jpg' },
    '2026-08-31T01:00:00.000Z',
  );
  const renamed = applyWardrobeOptimisticUpdate(
    replacement.state, item.item_id, { name: '新名称' },
    '2026-08-31T01:01:00.000Z',
  );

  const rolledBack = rollbackWardrobeOptimisticUpdate(
    renamed.state,
    replacement.transaction,
  );

  assert.equal(rolledBack.items[0].image_url, item.image_url);
  assert.equal(rolledBack.items[0].name, '新名称');
  assert.equal(rolledBack.pendingEdits[item.item_id]?.name, '新名称');
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/wardrobeOptimisticUpdate.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `wardrobeOptimisticUpdate.ts`.

- [ ] **Step 3: Implement the pure transaction module**

Create `src/lib/wardrobeOptimisticUpdate.ts` with these exact public types and functions:

```ts
import type { WardrobeItem } from '@/types';

type WardrobeField = keyof WardrobeItem;
type FieldGenerations = Partial<Record<WardrobeField, number>>;

export type WardrobeMutationGenerations = Record<string, FieldGenerations>;

export interface WardrobeOptimisticState {
  items: WardrobeItem[];
  pendingEdits: Record<string, Partial<WardrobeItem>>;
  mutationGenerations: WardrobeMutationGenerations;
}

export interface WardrobeRollbackTransaction {
  itemId: string;
  touchedKeys: WardrobeField[];
  fieldGenerations: FieldGenerations;
  previousItemFields: Partial<WardrobeItem>;
  itemKeysPreviouslyPresent: WardrobeField[];
  previousPendingFields: Partial<WardrobeItem>;
  pendingKeysPreviouslyPresent: WardrobeField[];
}

export interface AppliedWardrobeOptimisticUpdate {
  state: WardrobeOptimisticState;
  transaction: WardrobeRollbackTransaction;
}

export function applyWardrobeOptimisticUpdate(
  state: WardrobeOptimisticState,
  itemId: string,
  updates: Partial<WardrobeItem>,
  updatedAt: string,
): AppliedWardrobeOptimisticUpdate;

export function rollbackWardrobeOptimisticUpdate(
  state: WardrobeOptimisticState,
  transaction: WardrobeRollbackTransaction,
): WardrobeOptimisticState;
```

Implementation rules:

1. Build `optimisticUpdates` as `{ ...updates, updated_at: updatedAt }`.
2. Use unique `Object.keys(optimisticUpdates) as WardrobeField[]` for `touchedKeys`.
3. Snapshot whether each touched key existed and its previous value separately for the item and `pendingEdits[itemId]`.
4. Increment only the touched field generations, retaining generation tombstones after rollback.
5. Apply the optimistic fields to the matching item and pending edit without mutating the input arrays or objects.
6. During rollback, restore or delete a touched key only when the current field generation equals the transaction generation.
7. Remove `pendingEdits[itemId]` when no keys remain after guarded rollback.
8. Preserve unrelated items, pending edits, fields, and all newer field generations.

Use small internal helpers for `hasOwnProperty`, field snapshots, and immutable field restore/delete operations. Do not use JSON serialization for equality or cloning.

- [ ] **Step 4: Run the pure-state tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test src/lib/wardrobeOptimisticUpdate.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/wardrobeOptimisticUpdate.ts src/lib/wardrobeOptimisticUpdate.test.ts
git commit -m "fix(wardrobe): add guarded optimistic rollback"
```

---

### Task 2: Wire rollbackable replacement writes into the wardrobe store

**Files:**

- Modify: `src/stores/wardrobeStore.ts`
- Create: `src/lib/wardrobeStorePolicy.test.ts`

**Interfaces:**

- Consumes: Task 1 `applyWardrobeOptimisticUpdate` and `rollbackWardrobeOptimisticUpdate`.
- Produces: `WardrobeState.updateItemWithRollback(itemId, updates) -> Promise<boolean>`.
- Used by: Task 4 callers.

- [ ] **Step 1: Write the failing store-wiring contract test**

Create `src/lib/wardrobeStorePolicy.test.ts`:

```ts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(testDirectory, '../stores/wardrobeStore.ts'), 'utf8');

test('ordinary and rollbackable updates share field generations but only replacement failures roll back', () => {
  assert.match(source, /updateItemWithRollback:\s*\(itemId: string, updates: Partial<WardrobeItem>\) => Promise<boolean>/);
  assert.match(source, /mutationGenerations:\s*WardrobeMutationGenerations/);
  assert.match(source, /applyWardrobeOptimisticUpdate\s*\(/);
  const rollbackableStart = source.indexOf('updateItemWithRollback: async');
  const deleteStart = source.indexOf('deleteItem: async', rollbackableStart);
  assert.ok(rollbackableStart >= 0 && deleteStart > rollbackableStart);
  const rollbackableSource = source.slice(rollbackableStart, deleteStart);
  assert.match(rollbackableSource, /rollbackWardrobeOptimisticUpdate\s*\(/);
  assert.match(rollbackableSource, /return false/);

  const ordinaryStart = source.indexOf('updateItem: async');
  const ordinarySource = source.slice(ordinaryStart, rollbackableStart);
  assert.match(ordinarySource, /applyWardrobeOptimisticUpdate\s*\(/);
  assert.doesNotMatch(ordinarySource, /rollbackWardrobeOptimisticUpdate\s*\(/);
});
```

- [ ] **Step 2: Run the store contract and verify RED**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/wardrobeOptimisticUpdate.test.ts \
  src/lib/wardrobeStorePolicy.test.ts
```

Expected: pure tests pass; store contract fails because `updateItemWithRollback` and `mutationGenerations` are absent.

- [ ] **Step 3: Refactor the existing optimistic apply through Task 1**

In `src/stores/wardrobeStore.ts`:

1. Import Task 1 types/functions.
2. Add `mutationGenerations: WardrobeMutationGenerations` and `updateItemWithRollback` to `WardrobeState`.
3. Initialize `mutationGenerations: {}`.
4. Add an internal `applyOptimisticUpdate(set, itemId, updates, now)` helper that calls `applyWardrobeOptimisticUpdate` inside the Zustand functional setter, saves the returned transaction to a local variable, and returns that transaction after `set` completes.
5. Replace the hand-written optimistic setter in ordinary `updateItem` with the helper. Keep its Supabase call, error recording, `false` return, and keep-local failure behavior unchanged.

The helper must pass and receive only:

```ts
{
  items: state.items,
  pendingEdits: state.pendingEdits,
  mutationGenerations: state.mutationGenerations,
}
```

and merge only those three returned fields into Zustand state.

- [ ] **Step 4: Implement `updateItemWithRollback`**

Add the action immediately after `updateItem`:

```ts
updateItemWithRollback: async (itemId, updates) => {
  const now = new Date().toISOString();
  const transaction = applyOptimisticUpdate(set, itemId, updates, now);
  try {
    const { error } = await supabase
      .from('wardrobe_items')
      .update({ ...updates, updated_at: now })
      .eq('item_id', itemId);
    if (error) throw error;
    return true;
  } catch (e: any) {
    set(state => {
      const rolledBack = rollbackWardrobeOptimisticUpdate({
        items: state.items,
        pendingEdits: state.pendingEdits,
        mutationGenerations: state.mutationGenerations,
      }, transaction);
      return { ...rolledBack, error: e.message };
    });
    return false;
  }
},
```

Do not call `updateItem` from this action because its intentional keep-local failure policy conflicts with replacement rollback.

- [ ] **Step 5: Run focused store tests and static checking**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/wardrobeOptimisticUpdate.test.ts \
  src/lib/wardrobeStorePolicy.test.ts
npx tsc --noEmit
```

Expected: 5 tests pass, TypeScript exits 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/stores/wardrobeStore.ts src/lib/wardrobeStorePolicy.test.ts
git commit -m "fix(wardrobe): rollback failed replacement writes"
```

---

### Task 3: Gate the final master display on a durable row write

**Files:**

- Modify: `src/lib/garmentImageReplacement.ts`
- Modify: `src/lib/garmentImageReplacement.test.ts`
- Modify: `src/hooks/useGarmentImageReplace.ts`

**Interfaces:**

- Produces: `ReplacementFinalWriteResult` and `finishReplacementAfterFinalWrite`.
- Consumes: `UseGarmentImageReplaceOptions.commitReplacementUpdate` introduced in this task and wired by Task 4.

- [ ] **Step 1: Add failing final-write flow tests**

Append to `src/lib/garmentImageReplacement.test.ts`:

```ts
test('final display commits only after the durable write succeeds', async () => {
  const write = deferred<boolean>();
  const events: string[] = [];
  const flow = finishReplacementAfterFinalWrite({
    writeFinal: async () => {
      events.push('write');
      const result = await write.promise;
      events.push('write-settled');
      return result;
    },
    isCurrent: () => true,
    commitDisplay: () => { events.push('display'); },
  });

  await Promise.resolve();
  assert.deepEqual(events, ['write']);
  write.resolve(true);
  assert.equal(await flow, 'committed');
  assert.deepEqual(events, ['write', 'write-settled', 'display']);
});

test('failed or stale final writes never commit display', async () => {
  const failed: string[] = [];
  assert.equal(await finishReplacementAfterFinalWrite({
    writeFinal: async () => false,
    isCurrent: () => true,
    commitDisplay: () => { failed.push('display'); },
  }), 'failed');
  assert.deepEqual(failed, []);

  assert.equal(await finishReplacementAfterFinalWrite({
    writeFinal: async () => { throw new Error('write failed'); },
    isCurrent: () => true,
    commitDisplay: () => { failed.push('thrown-display'); },
  }), 'failed');
  assert.deepEqual(failed, []);

  const stale: string[] = [];
  assert.equal(await finishReplacementAfterFinalWrite({
    writeFinal: async () => true,
    isCurrent: () => false,
    commitDisplay: () => { stale.push('display'); },
  }), 'stale');
  assert.deepEqual(stale, []);
});
```

Also import `finishReplacementAfterFinalWrite` at the top of that test file.

- [ ] **Step 2: Run the replacement tests and verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/garmentImageReplacement.test.ts
```

Expected: FAIL because `finishReplacementAfterFinalWrite` is not exported.

- [ ] **Step 3: Implement the ordered final-write helper**

Append to `src/lib/garmentImageReplacement.ts`:

```ts
export type ReplacementFinalWriteResult = 'committed' | 'failed' | 'stale';

export async function finishReplacementAfterFinalWrite({
  writeFinal,
  isCurrent,
  commitDisplay,
}: {
  writeFinal: () => boolean | void | Promise<boolean | void>;
  isCurrent: () => boolean;
  commitDisplay: () => void;
}): Promise<ReplacementFinalWriteResult> {
  try {
    if (await writeFinal() === false) return 'failed';
  } catch {
    return 'failed';
  }
  if (!isCurrent()) return 'stale';
  commitDisplay();
  return 'committed';
}
```

- [ ] **Step 4: Run replacement tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test src/lib/garmentImageReplacement.test.ts
```

Expected: 8 tests pass, 0 fail.

- [ ] **Step 5: Add a failing hook source-contract test**

Extend `replacement hook delegates ordered writes and final attrs to the current item ref` in `src/lib/garmentImageReplacement.test.ts` with:

```ts
assert.match(source, /commitReplacementUpdate:\s*\(/);
assert.match(source, /finishReplacementAfterFinalWrite\s*\(/);
assert.match(
  source,
  /if \(finalWriteResult === 'failed'\) \{[\s\S]*?背景处理失败，已保留原图[\s\S]*?return;[\s\S]*?\}/,
);
const finalFlow = source.indexOf('await finishReplacementAfterFinalWrite');
const successToast = source.indexOf("? '已完成背景处理'", finalFlow);
const recognition = source.indexOf('void runRecognition(finalUrl)', finalFlow);
assert.ok(finalFlow >= 0 && successToast > finalFlow && recognition > successToast);
```

Run:

```bash
node --experimental-strip-types --test src/lib/garmentImageReplacement.test.ts
```

Expected: FAIL because the hook still accepts `updateItem`, sets `finalUrl` before the final write, and ignores the result.

- [ ] **Step 6: Implement hook failure gating**

In `src/hooks/useGarmentImageReplace.ts`:

1. Import `finishReplacementAfterFinalWrite`.
2. Replace the `updateItem` option with:

   ```ts
   commitReplacementUpdate: (
     id: string,
     updates: Partial<WardrobeItem>,
   ) => Promise<boolean>;
   ```

3. Destructure `commitReplacementUpdate` from `opts`.
4. Use it as `writeInitial` for `beginReplacementAfterInitialWrite`.
5. Replace the pre-write `setImageUri(finalUrl)` and ignored final update with:

   ```ts
   const finalWriteResult = await finishReplacementAfterFinalWrite({
     writeFinal: () => commitReplacementUpdate(
       currentItem.item_id,
       buildFinalReplacementImageUpdate(
         finalUrl,
         currentItemRef.current?.ai_recognized_attrs,
         persistedImage.metadata,
       ),
     ),
     isCurrent: stillCurrent,
     commitDisplay: () => { setImageUri(finalUrl); },
   });
   if (finalWriteResult === 'failed') {
     if (stillCurrent()) toast('背景处理失败，已保留原图');
     return;
   }
   if (finalWriteResult === 'stale') return;
   ```

6. Leave the existing success/fallback toast and optional recognition after the `committed` result only.
7. Update `useCallback` dependency arrays from `updateItem` to `commitReplacementUpdate`.

- [ ] **Step 7: Run Task 3 focused tests and TypeScript**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/garmentImageReplacement.test.ts \
  src/lib/wardrobeOptimisticUpdate.test.ts \
  src/lib/wardrobeStorePolicy.test.ts
npx tsc --noEmit
```

Expected: Node tests pass; TypeScript fails only at the two existing hook callers because they still pass `updateItem`. That caller failure is the intentional RED boundary for Task 4.

- [ ] **Step 8: Commit Task 3 without bypassing the caller RED**

Do not commit a TypeScript-broken intermediate state. Continue directly to Task 4, then commit Tasks 3 and 4 together after caller wiring is GREEN.

---

### Task 4: Wire both production callers to rollbackable persistence

**Files:**

- Modify: `src/app/wardrobe/[id].tsx`
- Modify: `src/app/wardrobe/edit/[id].tsx`
- Modify: `src/lib/imageUploadPolicy.test.ts`
- Modify: `src/lib/garmentImageReplacement.test.ts`
- Modify: `src/hooks/useGarmentImageReplace.ts`
- Modify: `src/lib/garmentImageReplacement.ts`

**Interfaces:**

- Consumes: `WardrobeState.updateItemWithRollback` from Task 2.
- Produces: both detail and edit callers pass `commitReplacementUpdate: updateItemWithRollback` while ordinary form/recognition edits keep using `updateItem`.

- [ ] **Step 1: Add failing caller ownership assertions**

In `src/lib/imageUploadPolicy.test.ts`, rename `ordinary edit save cannot standardize or persist an untouched image` to `replacement hook owns image persistence while ordinary edits keep their existing update action`. Keep its existing assertions, then add the detail source immediately after `editSource`:

```ts
const detailSource = readFileSync(
  resolve(testDirectory, '../app/wardrobe/[id].tsx'),
  'utf8',
);
```

Append these assertions to the same test:

```ts
assert.match(detailSource, /updateItemWithRollback/);
assert.match(editSource, /updateItemWithRollback/);
assert.match(detailSource, /commitReplacementUpdate:\s*updateItemWithRollback/);
assert.match(editSource, /commitReplacementUpdate:\s*updateItemWithRollback/);
assert.match(detailSource, /useItemAttributes\(item, \(updates\) => updateItem\(/);
assert.match(editSource, /await updateItem\(item\.item_id,/);
```

Run:

```bash
node --experimental-strip-types --test src/lib/imageUploadPolicy.test.ts
```

Expected: FAIL because callers do not select or pass `updateItemWithRollback`.

- [ ] **Step 2: Wire the detail caller**

In `src/app/wardrobe/[id].tsx`:

1. Select `updateItemWithRollback` from `useWardrobeStore` in `ItemDetailScreen`.
2. Add this `OwnedItemDetail` prop:

   ```ts
   commitReplacementUpdate: (
     id: string,
     updates: Partial<WardrobeItem>,
   ) => Promise<boolean>;
   ```

3. Pass `updateItemWithRollback` from `ItemDetailScreen` to `OwnedItemDetail`.
4. Pass `commitReplacementUpdate` into `useGarmentImageReplace`.
5. Keep `updateItem` for `useItemAttributes`, name changes, and recognized attributes.

- [ ] **Step 3: Wire the edit caller**

In `src/app/wardrobe/edit/[id].tsx`:

1. Destructure both `updateItem` and `updateItemWithRollback` from the store.
2. Pass `commitReplacementUpdate: updateItemWithRollback` to `useGarmentImageReplace`.
3. Keep ordinary `handleSave` on `updateItem`.

- [ ] **Step 4: Run the complete focused gate and verify GREEN**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/wardrobeOptimisticUpdate.test.ts \
  src/lib/wardrobeStorePolicy.test.ts \
  src/lib/garmentImageReplacement.test.ts \
  src/lib/imageUploadPolicy.test.ts
npx tsc --noEmit
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit Tasks 3 and 4**

```bash
git add \
  src/lib/garmentImageReplacement.ts \
  src/lib/garmentImageReplacement.test.ts \
  src/hooks/useGarmentImageReplace.ts \
  'src/app/wardrobe/[id].tsx' \
  'src/app/wardrobe/edit/[id].tsx' \
  src/lib/imageUploadPolicy.test.ts
git commit -m "fix(wardrobe): surface replacement persistence failures"
```

---

### Task 5: Full regression and delivery verification

**Files:**

- Verify only; no planned production file change.

**Interfaces:**

- Consumes: completed Tasks 1-4.
- Produces: evidence that the delivery meets every acceptance criterion without regressions.

- [ ] **Step 1: Run the full Node suite**

Run:

```bash
node --experimental-strip-types --test $(find src -name '*.test.ts' -print)
```

Expected: 145 tests pass, 0 fail. If the exact count differs because a test was split during implementation, require 0 failures and account for every added test by name.

- [ ] **Step 2: Run repository checks**

Run:

```bash
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

Expected: every command exits 0.

- [ ] **Step 3: Review the exact diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
git log --format='%h %an <%ae> %cn <%ce> %s' origin/main..HEAD
```

Expected:

- no whitespace errors;
- only the approved specification, plan, replacement-state module/tests, store, hook, two callers, and two existing policy tests changed;
- all commits use `fitz <fitz.wyh@gmail.com>` as author and committer;
- no generated output, `.env`, credential, media, model-service, token, preview, or Figma file appears.

- [ ] **Step 4: Perform acceptance-criteria readback**

Read the final implementations and confirm explicitly:

1. initial false restores store and component state;
2. stale same-field failure cannot overwrite a newer replacement;
3. unrelated edits survive image rollback;
4. final false keeps the selected original and blocks success/recognition;
5. ordinary `updateItem` still keeps failed local edits;
6. no compensating database write exists.

- [ ] **Step 5: Prepare the first delivery for review**

Do not mix the next permanent-deletion specification or implementation into this branch state before this delivery has its own review checkpoint. Report the commit SHAs, focused/full test counts, static/build results, and any environment-only warnings.
