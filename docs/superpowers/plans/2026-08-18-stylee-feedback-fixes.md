# Stylee Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six user-tested failures and ship one shared adaptive outfit-canvas implementation with an in-app Demo entry, without pushing or opening a PR before user acceptance.

**Architecture:** Keep App-only search, account isolation, and deterministic layout in focused pure-policy modules plus shared Design System components. Keep recognition compression, transparent-master quality fallback, and try-on prompt controls inside the canonical model service, then apply the same governed file changes to the App vendored copy. Preserve original garment images for standardization/storage and use an ephemeral compressed copy only at the model boundary.

**Tech Stack:** Expo Router / React Native / TypeScript / Zustand / Supabase Auth, Python 3.12 / Pillow 12.3 / DashScope Qwen, Node test runner, Python script tests.

**Spec:** `docs/superpowers/specs/2026-08-18-stylee-feedback-fixes-design.md`

## Global Constraints

- Preserve one transparent PNG master and runtime semantic backgrounds; never persist scene composites.
- Existing wardrobe records remain unchanged; no database migration or historical reprocessing.
- Keep `重试` and `用原图保存` failure recovery.
- Recognition compression is ephemeral, longest edge at most 1280, target approximately 1MP, JPEG quality 82.
- Original images continue to feed standardization and persistent storage.
- Keep fashion-magazine photographic quality in try-on output, but generate no text, title, letter, number, logo, watermark, or magazine cover layout.
- Every import task is owned by exactly one `ownerUserId`; cross-account processing is forbidden.
- UI uses existing semantic Design System tokens and 44×44 minimum interactive targets.
- Do not push or create a PR until the user accepts the completed local result.

---

### Task 1: Separate hat/scarf search semantics

**Files:**
- Create: `src/lib/wardrobeSearchPolicy.ts`
- Create: `src/lib/wardrobeSearchPolicy.test.ts`
- Modify: `src/app/(tabs)/wardrobe.tsx`

**Interfaces:**
- Produces: `matchesWardrobeSearch(item: WardrobeSearchItem, rawQuery: string): boolean`
- Consumes: garment `name`, `category`, `color`, optional `brand`, optional `material`

- [ ] **Step 1: Write failing search tests**

```ts
test('hat queries exclude scarf names even though both use 帽巾', () => {
  assert.equal(matchesWardrobeSearch({ name: '棒球帽', category: '帽巾', color: '白色' }, '帽'), true);
  assert.equal(matchesWardrobeSearch({ name: '纯色针织围巾', category: '帽巾', color: '米色' }, '帽'), false);
});

test('scarf queries exclude hats and ordinary category queries still work', () => {
  assert.equal(matchesWardrobeSearch({ name: '纯色针织围巾', category: '帽巾', color: '米色' }, '围巾'), true);
  assert.equal(matchesWardrobeSearch({ name: '针织冷帽', category: '帽巾', color: '黑色' }, '围巾'), false);
  assert.equal(matchesWardrobeSearch({ name: '灰色卫衣', category: '上装', color: '灰色' }, '上衣'), true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test src/lib/wardrobeSearchPolicy.test.ts`

Expected: FAIL because `wardrobeSearchPolicy.ts` does not exist.

- [ ] **Step 3: Implement subtype-aware matching**

```ts
const HAT_QUERY = /帽|cap|beanie/i;
const SCARF_QUERY = /围巾|丝巾|领巾|披肩|脖套|scarf/i;
const HAT_ITEM = /帽|cap|beanie/i;
const SCARF_ITEM = /围巾|丝巾|领巾|披肩|脖套|scarf/i;

export function matchesWardrobeSearch(item: WardrobeSearchItem, rawQuery: string): boolean {
  const query = rawQuery.trim();
  if (!query) return true;
  const subtypeText = [item.name, item.brand ?? '', item.material ?? ''].join(' ');
  if (SCARF_QUERY.test(query)) return SCARF_ITEM.test(subtypeText);
  if (HAT_QUERY.test(query)) return HAT_ITEM.test(subtypeText) && !SCARF_ITEM.test(subtypeText);
  const terms = [query, ...(SEARCH_ALIASES[query] ?? [])];
  const haystack = [item.name, item.category, item.color, item.brand ?? '', item.material ?? ''].join(' ');
  return terms.some((term) => haystack.includes(term));
}
```

- [ ] **Step 4: Replace the inline wardrobe filter and verify GREEN**

Run: `node --experimental-strip-types --test src/lib/wardrobeSearchPolicy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the search fix**

```bash
git add src/lib/wardrobeSearchPolicy.ts src/lib/wardrobeSearchPolicy.test.ts 'src/app/(tabs)/wardrobe.tsx'
git commit -m "fix(wardrobe): separate hat and scarf search"
```

### Task 2: Bind import tasks to the active account and retain diagnostics

**Files:**
- Create: `src/lib/importTaskPolicy.ts`
- Create: `src/lib/importTaskPolicy.test.ts`
- Modify: `src/stores/importStore.ts`
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(tabs)/wardrobe.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/components/ImportSkeletonCard.tsx`

**Interfaces:**
- Produces: `ImportTask.ownerUserId`, `ImportTask.requestId`, `ImportTask.failedStage`, `ImportTask.errorType`, `ImportTask.serverDurationMs`
- Produces: `setActiveUser(userId: string | null): void`
- Produces: `tasksForUser(tasks, userId)` and `summarizeImportTasks(tasks)`

- [ ] **Step 1: Write failing ownership-policy tests**

```ts
test('tasks are visible only to their owner', () => {
  const tasks = [task('a', 'user-a', 'failed'), task('b', 'user-b', 'pending')];
  assert.deepEqual(tasksForUser(tasks, 'user-a').map((x) => x.id), ['a']);
  assert.deepEqual(tasksForUser(tasks, null), []);
});

test('summary counters are recalculated from retained tasks', () => {
  assert.deepEqual(summarizeImportTasks([
    task('a', 'u', 'failed'), task('b', 'u', 'needs_selection'), task('c', 'u', 'done'),
  ]), { totalCount: 3, completedCount: 1, failedCount: 1, pendingSelectionCount: 1 });
});
```

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test src/lib/importTaskPolicy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement pure ownership/counter policies**

Implement `tasksForUser` as an owner equality filter and derive every counter from task status rather than increment/decrement bookkeeping.

- [ ] **Step 4: Add `ownerUserId` and `setActiveUser` to the store**

```ts
setActiveUser: (userId) => set((state) => {
  const tasks = userId ? state.tasks.filter((task) => task.ownerUserId === userId) : [];
  return { activeUserId: userId, tasks, ...summarizeImportTasks(tasks), isProcessing: false };
}),
```

`startImport` must tag every task with the passed user ID. `processQueue`, `retryFailed`, `confirmSelection`, `handleDetection`, and `handleFinalize` must reject a task whose owner differs from the current active user. `handleFinalize` must use `task.ownerUserId`, never a mutable global user ID.

- [ ] **Step 5: Persist recognition diagnostics into failed tasks**

After `aiDetectMultiItems`, copy `meta.requestId`, `meta.failedStage`, `meta.errorType`, and `meta.serverDurationMs` into the task. Render a concise detail such as `识别超时 · request_id …` without exposing image bytes or tokens.

- [ ] **Step 6: Wire auth events to task reset**

Call `useImportStore.getState().setActiveUser(session.user.id)` before routing after sign-in, and call `setActiveUser(null)` on `SIGNED_OUT` / no session. Home and wardrobe surfaces consume only tasks owned by the current user.

- [ ] **Step 7: Run GREEN and App type checks**

Run:

```bash
node --experimental-strip-types --test src/lib/importTaskPolicy.test.ts
npm run check
```

- [ ] **Step 8: Commit account isolation**

```bash
git add src/lib/importTaskPolicy.ts src/lib/importTaskPolicy.test.ts src/stores/importStore.ts src/app/_layout.tsx 'src/app/(tabs)/wardrobe.tsx' 'src/app/(tabs)/index.tsx' src/components/ImportSkeletonCard.tsx
git commit -m "fix(import): isolate tasks by account"
```

### Task 3: Compress only the model-service recognition input

**Files:**
- Create canonical: `/Users/bytedance/Documents/styleetest1/.worktrees/style-model-canonical/stylee/vision/recognition_input.py`
- Create canonical: `/Users/bytedance/Documents/styleetest1/.worktrees/style-model-canonical/test_recognition_input.py`
- Modify canonical: `/Users/bytedance/Documents/styleetest1/.worktrees/style-model-canonical/stylee/service/ai_features.py`
- Modify canonical: `/Users/bytedance/Documents/styleetest1/.worktrees/style-model-canonical/stylee/service/server.py`
- Apply the same governed changes to: `model-service/stylee/vision/recognition_input.py`, `model-service/test_recognition_input.py`, `model-service/stylee/service/ai_features.py`, `model-service/stylee/service/server.py`

**Interfaces:**
- Produces: `prepare_recognition_data_uri(image_ref: str) -> PreparedRecognitionImage`
- `PreparedRecognitionImage` contains `data_uri`, `encoded_bytes`, `width`, `height`, `compressed`

- [ ] **Step 1: Write failing Pillow preprocessing tests in canonical service**

```py
def test_large_png_becomes_bounded_jpeg():
    source = png_data_uri(Image.new('RGB', (1672, 2508), 'beige'))
    prepared = prepare_recognition_data_uri(source)
    assert prepared.data_uri.startswith('data:image/jpeg;base64,')
    assert max(prepared.width, prepared.height) <= 1280
    assert prepared.width * prepared.height <= 1_100_000
    assert prepared.compressed is True

def test_small_jpeg_is_not_reencoded():
    source = jpeg_data_uri(Image.new('RGB', (640, 960), 'beige'), quality=82)
    prepared = prepare_recognition_data_uri(source)
    assert prepared.data_uri == source
    assert prepared.compressed is False
```

- [ ] **Step 2: Run RED in canonical service**

Run: `python3 test_recognition_input.py`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement bounded ephemeral preprocessing**

Decode only PNG/JPEG data URIs, enforce the existing byte/pixel safety limits, convert to RGB, resize with `Image.Resampling.LANCZOS` using both 1280-long-edge and approximately 1MP bounds, then encode JPEG at quality 82 with optimization. Do not write a file or mutate the original payload.

- [ ] **Step 4: Use the prepared data URI only inside `recognize_many`**

Build the Qwen message with `prepared.data_uri`, return sanitized `input_info`, and let the server move that info into trace fields:

```py
trace.annotate(
    recognition_input_bytes=input_info.get('encoded_bytes'),
    recognition_input_width=input_info.get('width'),
    recognition_input_height=input_info.get('height'),
    recognition_input_compressed=input_info.get('compressed'),
)
```

- [ ] **Step 5: Run canonical tests and sync only changed governed files**

Run all canonical `test_*.py`, then copy the four changed files into `model-service/` and run the matching vendored tests. Do not overwrite outfit-constraint files from the separate open branch.

- [ ] **Step 6: Commit canonical and App-vendored changes separately**

Canonical commit: `fix(vision): bound multi-item recognition input`

App commit: `fix(model): compress recognition input`

### Task 4: Reject dirty transparent masters and keep magazine photography text-free

**Files:**
- Modify canonical: `stylee/vision/prompts.py`, `stylee/ingest.py`, `stylee/service/ai_features.py`, `stylee/vision/dashscope.py`, `test_vision.py`, `test_ai_features.py`
- Apply identical governed changes under App `model-service/`
- Modify App: `src/design-system/StyleeWardrobeCard.tsx`, `src/design-system/garmentMediaTone.test.ts`

**Interfaces:**
- `build_verify_messages` requires category/color fidelity and a clean transparent garment-only background.
- `build_edit_payload` accepts optional `parameters` without changing existing callers.
- `tryon_edit_parameters(model: str) -> dict`

- [ ] **Step 1: Write failing direct-matte fallback and prompt tests**

Add a fake verifier that returns background drift on the first direct-matte result and clean output after image edit. Assert a WEB image calls direct matte, then image edit, then matte, and returns a verified `img2img_alpha` result. Assert the verification prompt includes `棋盘格`, `白色矩形`, and `可见背景`.

- [ ] **Step 2: Run RED**

Run: `python3 test_vision.py && python3 test_ai_features.py`

- [ ] **Step 3: Refactor `standardize_item` to validate direct matte before accepting it**

For WEB images, direct matte uses the existing visual verification call. Drift triggers one image-edit+matte fallback. The fallback output is verified once more; remaining drift returns `cropped_fallback` and cannot be persisted as a transparent master.

- [ ] **Step 4: Add text-free try-on parameters while retaining style**

The prompt must retain `时尚杂志摄影质感` and add `不是杂志封面，不进行文字排版，画面不得出现任何文字、字母、数字、标题、Logo或水印`.

```py
def tryon_edit_parameters(model: str) -> dict:
    params = {
        'watermark': False,
        'negative_prompt': '文字，字母，数字，标题，Logo，水印，杂志封面排版',
    }
    if model != 'qwen-image-edit':
        params['prompt_extend'] = False
    return params
```

- [ ] **Step 5: Change wardrobe media from `neutral` to `owned` tone**

`StyleeWardrobeCard` uses the existing `owned` semantic tone (`surface.input`) for a consistently visible light-gray media background. Update the semantic-token test rather than adding raw colors.

- [ ] **Step 6: Run canonical/App tests and commit**

Canonical commit: `fix(vision): reject dirty masters and suppress tryon text`

App commit: `fix(media): enforce clean wardrobe presentation`

### Task 5: Build the adaptive editorial outfit canvas

**Files:**
- Create: `src/design-system/outfitCanvasLayout.ts`
- Create: `src/design-system/outfitCanvasLayout.test.ts`
- Create: `src/design-system/StyleeOutfitCanvas.tsx`
- Modify: `src/design-system/index.ts`
- Modify: `src/design-system/README.md`
- Modify: `src/app/outfit/result.tsx`

**Interfaces:**
- Produces: `layoutOutfitCanvas(items: OutfitCanvasItem[]): OutfitCanvasLayout`
- Produces: `StyleeOutfitCanvas({ items, onItemPress?, accessibilityLabel? })`
- `OutfitCanvasSlot` includes percentage-based `left`, `top`, `width`, `height`, `rotation`, `zIndex`

- [ ] **Step 1: Write failing pure layout tests**

```ts
test('three core items put shoes beside rather than on trousers', () => {
  const layout = layoutOutfitCanvas([top, bottom, shoes]);
  const shoe = layout.slots.find((slot) => slot.item.id === 'shoes')!;
  const pants = layout.slots.find((slot) => slot.item.id === 'bottom')!;
  assert.ok(shoe.left > pants.left + pants.width * 0.55);
  assert.ok(shoe.width < pants.width * 0.72);
});

test('no accessory creates no accessory slot and six items orbit the core', () => {
  assert.equal(layoutOutfitCanvas([top, bottom, shoes]).template, 'core');
  const full = layoutOutfitCanvas([outer, top, bottom, shoes, scarf, hat]);
  assert.equal(full.template, 'orbit');
  assert.deepEqual(full.slots.map((slot) => slot.item.id).sort(), ['bottom','hat','outer','scarf','shoes','top']);
});
```

- [ ] **Step 2: Run RED**

Run: `node --experimental-strip-types --test src/design-system/outfitCanvasLayout.test.ts`

- [ ] **Step 3: Implement deterministic templates**

Use normalized category/name to assign outer/top/bottom/dress/shoes/bag/hat/scarf/accessory roles. Implement `core`, `layered`, `orbit`, and `accessory-strip` templates with percentage geometry. A dress replaces top+bottom. Do not create empty slots.

- [ ] **Step 4: Implement `StyleeOutfitCanvas`**

Render one semantic `owned` canvas surface and transparent `Image` elements in absolute percentage slots. Use `resizeMode="contain"`, percentage positions, 44×44 minimum press targets, accessible labels, and no per-item background rectangles.

- [ ] **Step 5: Replace the ad-hoc result flatlay**

Keep the existing item list, favorite, swap, save, and try-on flows. Replace only the hero composition with `StyleeOutfitCanvas` and remove obsolete shape styles/functions.

- [ ] **Step 6: Run layout tests, `npm run check`, and commit**

Commit: `feat(outfit): add adaptive editorial canvas`

### Task 6: Add the in-app Demo route and experiment entry

**Files:**
- Create: `src/app/outfit-layout-demo.tsx`
- Modify: `src/app/profile/settings.tsx`
- Reuse: `public/preset-items/*`, `StyleeOutfitCanvas`

**Interfaces:**
- Route: `/outfit-layout-demo`
- Settings entry: `更多设置 → 实验功能 → 穿搭布局 Demo`

- [ ] **Step 1: Add a failing route/source guard test**

Extend a Node source test to require that the Demo route imports `StyleeOutfitCanvas` and that settings navigates to `/outfit-layout-demo`; it must not duplicate slot coordinates.

- [ ] **Step 2: Run RED**

Run the focused Node test and confirm the missing route/entry failure.

- [ ] **Step 3: Build the Demo screen**

Use `StyleeNavigationBar`, semantic tokens, and three 44×44 scenario controls for `3件基础`, `4件叠穿`, and `6件配饰`. Feed preset image URIs into the same production canvas component. Explain that composition is client-side and has no image-generation cost.

- [ ] **Step 4: Add the settings entry and verify routing**

Add a second row under the existing `实验功能` group without changing the Gamma entry.

- [ ] **Step 5: Commit**

Commit: `feat(demo): expose adaptive outfit layouts`

### Task 7: Full verification and user handoff

**Files:**
- Create/update: local screenshots under the task visualization folder
- Create: local QA report for result and Demo screens
- Do not create a PR yet

- [ ] **Step 1: Run all automated gates**

```bash
node --experimental-strip-types --test src/lib/*.test.ts src/design-system/*.test.ts
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

Run all canonical and vendored `test_*.py` with `Pillow==12.3.0`, then run the model-service changed-file sync comparison appropriate to the still-open canonical prerequisite branches.

- [ ] **Step 2: Browser-test the production flows**

At 320, 375, 393, 430, and 768 widths verify:

- hat search excludes scarf and scarf search excludes hat;
- 3/4/6 Demo layouts have no empty slots and shoes do not cover trousers;
- settings entry opens Demo;
- failed task disappears after sign-out/account switch;
- wardrobe cards use the uniform semantic background;
- result list, swap, favorite, save, and try-on navigation still work.

- [ ] **Step 3: Re-run the user's original recognition image**

Use the existing temporary test account and original image. Confirm trace reports a compressed recognition input and returns five items without changing the original storage image.

- [ ] **Step 4: Run visual QA**

Compare the approved editorial mock and Demo capture side-by-side. Fix all P0/P1/P2 differences; record any P3 polish separately.

- [ ] **Step 5: Report the local result and wait**

Provide the local Demo/preview, exact test evidence, commits, known limitations, and no PR URL. Wait for explicit user approval before pushing or creating GitHub PRs.
