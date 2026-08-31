# Garment Image Replacement Failure Consistency Design

**Date:** 2026-08-31
**Status:** Approved
**Repository baseline:** `yiguo2026/stylee_mvp_v2@cffc93126f15d85aea97e84a56f2803e271a0db0`

## Goal

Make wardrobe image replacement consistent across the mounted component, the
Zustand store, and Supabase when either the initial selected-image write or the
final transparent-master write fails.

After this change, no remount or refetch can revive an image that the component
already reported as failed, and no success toast can be emitted before the
corresponding row write succeeds.

## Scope

This delivery changes only the existing replacement flow used by wardrobe
detail and edit screens:

- add a rollback-on-failure store write mode for replacement writes;
- keep the existing optimistic, keep-local behavior for ordinary attribute
  edits;
- make the initial selected-image write and final transparent-master write use
  rollback-on-failure behavior;
- surface a failed final row update and keep the last durable original image;
- preserve existing concurrency guards, recognition behavior, metadata
  merging, and transparent-master persistence.

## Non-goals

- Do not change ordinary `updateItem` offline/demo behavior.
- Do not add an uncontrolled compensating Supabase write.
- Do not retry writes automatically.
- Do not change the image picker, standardization provider, Storage upload
  policy, schema, RLS, or historical wardrobe rows.
- Do not change shared visual components, tokens, layout, or copy outside the
  existing replacement toasts.

## Current behavior and defect

`wardrobeStore.updateItem` applies changes to `items` and `pendingEdits` before
writing Supabase. A failed write deliberately keeps those local changes for
ordinary offline/demo edits.

The replacement hook uses the same action for a different contract:

1. It shows and writes the newly selected local image.
2. If that write fails, the component restores its own `imageUri`, but the
   store still contains the failed optimistic image and cleared predecessor
   bounds. A remount can show the failed replacement again.
3. If standardization succeeds, the hook sets the transparent-master URI before
   awaiting the final row update. The update result is ignored, so the UI may
   show the master and a success toast even when Supabase rejected the write.

This is a failure-path consistency defect, not a replacement ordering or stale
visible-bounds defect. The existing source-key, generation, and latest-metadata
repairs remain authoritative.

## Architecture

### 1. Preserve ordinary update semantics

`updateItem(itemId, updates)` remains unchanged for ordinary attribute edits:
it applies an optimistic local update, records `pendingEdits`, attempts the
Supabase update, and keeps the local edit if persistence fails.

Changing this global contract would risk unrelated offline/demo behavior and is
outside this delivery.

### 2. Add a rollbackable store action

Add this store interface:

```ts
updateItemWithRollback: (
  itemId: string,
  updates: Partial<WardrobeItem>,
) => Promise<boolean>;
```

The action uses the same Supabase payload and optimistic timestamp behavior as
`updateItem`, but it captures a local transaction snapshot before applying the
optimistic change:

```ts
interface WardrobeRollbackTransaction {
  itemId: string;
  touchedKeys: Array<keyof WardrobeItem>;
  fieldGenerations: Partial<Record<keyof WardrobeItem, number>>;
  previousItemFields: Partial<WardrobeItem>;
  itemKeysPreviouslyPresent: Array<keyof WardrobeItem>;
  previousPendingFields: Partial<WardrobeItem>;
  pendingKeysPreviouslyPresent: Array<keyof WardrobeItem>;
}
```

The store maintains monotonic mutation generations per item and field. Both
ordinary updates and rollbackable replacement updates advance the generations
of the fields they touch. A failed transaction restores only fields whose
captured generation is still current. This prevents an older failed request
from overwriting a newer replacement while allowing unrelated concurrent edits
such as `name` or `material` to survive.

Rollback is local only:

- restore each previous item field only when no later mutation touched that
  field;
- restore or remove each corresponding `pendingEdits[itemId]` field according
  to whether that key existed before the transaction;
- preserve every newer or unrelated field mutation;
- record the Supabase error and return `false`;
- never issue a second database write to compensate.

Successful writes return `true` and retain the current optimistic state, which
is now also durable.

The pure generation, snapshot, optimistic-apply, and guarded-rollback
operations live in `src/lib/wardrobeOptimisticUpdate.ts`. The Zustand store owns
Supabase I/O and delegates state transitions to that module. This keeps failure
and concurrency behavior testable without mocking the Supabase client.

### 3. Initial replacement write

Rename the hook option from the misleading generic `updateItem` to the explicit
replacement contract:

```ts
commitReplacementUpdate: (
  itemId: string,
  updates: Partial<WardrobeItem>,
) => Promise<boolean>;
```

Both current callers pass `wardrobeStore.updateItemWithRollback`. Their
ordinary attribute and recognition callbacks continue to use `updateItem`.
The hook uses `commitReplacementUpdate` for the initial update created by
`buildInitialReplacementImageUpdate`.

The existing ordered-write helper remains in place:

- background processing starts only after the initial write returns `true`;
- an explicit `false` restores the component URI to the previously committed
  image;
- the store has already restored the previous row and `pendingEdits` snapshot;
- the hook stops processing and shows `图片保存失败，请重试`;
- stale or unmounted work remains suppressed.

### 4. Final transparent-master write

The hook does not commit `setImageUri(finalUrl)` until the final
`updateItemWithRollback` call returns `true`.

The final update continues to merge `persistedImage.metadata` with the latest
`currentItemRef.current.ai_recognized_attrs`, so unrelated edits made while
background processing was running are preserved.

If the final row update returns `false`:

- the store rolls back to the last durable initial-image state;
- the component keeps the selected original image URI;
- the hook shows `背景处理失败，已保留原图`;
- it does not emit `已完成背景处理`;
- it does not start recognition against an uncommitted master;
- it clears the processing state if the task is still current.

If the final row update returns `true`, the hook sets the master URI, emits the
existing success/fallback toast based on `persistedImage.status`, and starts
recognition only for a durable transparent master.

## Data flow

```text
picker result
  -> component shows selected local URI
  -> rollbackable initial store transaction
     -> Supabase success: start background processing
     -> Supabase failure: store + component restore previous image
  -> persist original/master in Storage
  -> build final update from latest item metadata
  -> rollbackable final store transaction
     -> Supabase success: component shows master; optional recognition starts
     -> Supabase failure: store + component keep durable selected original
```

## Error and concurrency rules

- A failed transaction never rolls back a newer transaction generation.
- A stale background token never writes, rolls back, changes component state,
  emits a toast, or starts recognition.
- An unmounted component may finish the store write already in progress, but it
  does not update component state or emit a toast.
- Storage persistence failure retains the durable initial original and uses the
  existing fallback message.
- Final row-write failure is distinct from Storage persistence failure but uses
  the same user-facing promise: the durable original remains available.
- Logs continue to use allowlisted diagnostics and never include image data,
  signed URLs, credentials, or raw provider responses.

## Files and responsibilities

- `src/lib/wardrobeOptimisticUpdate.ts`
  - pure field-generation, snapshot, optimistic-apply, and guarded-rollback
    state transitions;
- `src/lib/wardrobeOptimisticUpdate.test.ts`
  - initial rollback, pending-edit restoration, successful settlement, and
    stale-generation protection;
- `src/stores/wardrobeStore.ts`
  - expose `updateItemWithRollback`, share the existing Supabase update payload,
    and retain ordinary `updateItem` semantics;
- `src/hooks/useGarmentImageReplace.ts`
  - accept `commitReplacementUpdate`, use rollbackable writes, and gate the
    final URI, toast, and recognition on a successful final write;
- `src/app/wardrobe/[id].tsx`
  - pass rollbackable replacement persistence while retaining ordinary
    `updateItem` for attributes and recognition;
- `src/app/wardrobe/edit/[id].tsx`
  - pass the same rollbackable replacement persistence contract;
- `src/lib/garmentImageReplacement.test.ts`
  - cover ordered initial failure and the final durable-write result contract;
- `src/lib/imageUploadPolicy.test.ts`
  - preserve the shared-hook ownership boundary for replacement processing.

## Testing strategy

### RED evidence

Before production edits, add tests that fail because:

1. a failed rollbackable update leaves the touched item and `pendingEdits`
   fields changed;
2. an older failed field generation can overwrite a newer replacement, while
   an unrelated concurrent edit is accidentally rolled back;
3. the replacement hook sets `finalUrl`, shows success, or starts recognition
   without checking the final write result.

### GREEN evidence

Run the focused tests:

```bash
node --experimental-strip-types --test \
  src/lib/wardrobeOptimisticUpdate.test.ts \
  src/lib/garmentImageReplacement.test.ts \
  src/lib/imageUploadPolicy.test.ts
```

Then run:

```bash
node --experimental-strip-types --test $(find src -name '*.test.ts' -print)
npm run check
npm run build:web
git diff --check
```

Expected final result: all Node tests pass, all static/design checks pass, the
Web build succeeds, and no generated or unrelated file changes appear.

## Acceptance criteria

1. Initial replacement persistence failure restores both the mounted image and
   the store/pending-edit state.
2. Remounting after an initial failure cannot revive the failed replacement.
3. A failed stale generation cannot overwrite a newer replacement.
4. Final row-update failure keeps the durable selected original in the store
   and component.
5. Final row-update failure emits no success toast and starts no recognition.
6. Final row-update success preserves latest unrelated metadata and retains the
   existing success behavior.
7. Ordinary attribute-update failure continues to keep the local optimistic
   edit exactly as before.
8. No schema, RLS, Storage policy, token, layout, model-service, or historical
   data change is introduced.

## Delivery boundary

This is the first of five approved sequential deliveries. Permanent wardrobe
deletion, array-source geometry, reusable PR Preview infrastructure, and Figma
P0 component completion each receive their own specification, implementation
plan, tests, and review after this delivery is complete.
