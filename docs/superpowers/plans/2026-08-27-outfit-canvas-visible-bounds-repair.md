# Outfit Canvas Visible-Bounds Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Stylee outfit-canvas garment proportions, visible gaps, Web image sizing, and image-failure fallback without rewriting historical wardrobe data.

**Architecture:** The canonical service exposes optional normalized visible-subject bounds already computed during alpha validation. The App persists those bounds in existing JSON metadata, supplements shipped preset assets with a generated metrics manifest, and lays out visible subject rectangles rather than transparent image frames. Image loading remains non-destructive: Web dimensions use `Image.getSize`, failures render semantic placeholders, and historical rows are not mutated.

**Tech Stack:** Python 3.11+, Pillow 12.3.0, Expo/React Native 0.81, React Native Web 0.21, TypeScript 5.8, Node test runner, Supabase JSONB metadata, GitHub Actions, GitHub Pages preview.

**Spec:** `docs/superpowers/specs/2026-08-27-outfit-canvas-visible-bounds-repair-design.md`

## Global Constraints

- Before App code changes, read `https://docs.expo.dev/versions/v55.0.0/` for the exact APIs being used.
- Before App UI changes, read `docs/STYLEE_DESIGN_SYSTEM_CONTEXT.md`, `design-tokens/README.md`, and `src/design-system/README.md` completely.
- `fitzw/style-model` is canonical; App `model-service/` is generated and must never be edited first.
- Normalized visible bounds are optional and backward compatible.
- Do not add a Supabase column or migration; persist bounds in existing `ai_recognized_attrs` JSON.
- Do not bulk rewrite historical wardrobe images.
- Do not add catalog image resolution, latency tuning, model soft-quality tuning, Figma work, or unrelated analytics fixes.
- Visible upper/lower gap must be `2%`–`4%`; visible lower/shoe gap must be `5%`–`8%`.
- T-shirt/trousers visible width ratio must be below `2.0` for the approved fixture.
- Required visual widths are `320`, `375`, `393`, `430`, and `768` pt.
- Preserve semantic head/neck/carry/micro/foot zones and legal 2–6 item fixture behavior.
- Preserve unrelated user changes in the primary App checkout; execute from isolated worktrees.

## Workspace Setup

At execution time, load `superpowers:using-git-worktrees`. Detect whether the current checkout is already a linked worktree before creating another one.

Use these isolated paths unless they already exist and point at the intended branches:

```bash
/private/tmp/style-model-visible-bounds
/private/tmp/stylee-app-outfit-quality
```

The canonical worktree starts from `fitzw/style-model main@f67971399bec7e0dc1da99ca4431c8a2825cbebb` on branch `codex/visible-bounds-standardization`. The App worktree continues PR #19 branch `codex/outfit-quality-semantic-layout`.

---

### Task 1: Canonical normalized visible-bounds contract

**Files:**

- Modify: `/private/tmp/style-model-visible-bounds/stylee/contracts.py`
- Modify: `/private/tmp/style-model-visible-bounds/stylee/vision/alpha_matte.py`
- Modify: `/private/tmp/style-model-visible-bounds/stylee/ingest.py`
- Modify: `/private/tmp/style-model-visible-bounds/stylee/vision/mock.py`
- Modify: `/private/tmp/style-model-visible-bounds/stylee/service/adapter.py`
- Test: `/private/tmp/style-model-visible-bounds/test_alpha_matte.py`
- Test: `/private/tmp/style-model-visible-bounds/test_vision.py`
- Test: `/private/tmp/style-model-visible-bounds/test_service.py`

**Interfaces:**

- Produces: `VisibleBounds(left: float, top: float, width: float, height: float)`.
- Produces: `VisibleBounds.to_dict() -> dict[str, float]`.
- Produces: `StandardizedImage.visible_bounds: VisibleBounds | None`.
- Produces: optional `visible_bounds` object in `/standardize` JSON.
- Consumed by: Task 2 App contract and persistence.

- [ ] **Step 1: Write failing alpha and contract tests**

Add the following assertions using the existing `fixture_png()` helper:

```python
from stylee.contracts import VisibleBounds


def test_alpha_stats_expose_normalized_visible_bounds():
    result = matte_image_bytes(fixture_png())
    bounds = result.stats.visible_bounds
    assert 0 <= bounds.left < 1
    assert 0 <= bounds.top < 1
    assert 0 < bounds.width <= 1
    assert 0 < bounds.height <= 1
    assert bounds.left + bounds.width <= 1
    assert bounds.top + bounds.height <= 1
    assert bounds.width == 0.51
    assert bounds.height == 0.61


def test_visible_bounds_reject_non_finite_or_out_of_range_values():
    for values in [
        (-0.1, 0.0, 0.5, 0.5),
        (0.0, 0.0, 0.0, 0.5),
        (0.8, 0.0, 0.3, 0.5),
        (float("nan"), 0.0, 0.5, 0.5),
    ]:
        try:
            VisibleBounds(*values)
            assert False, values
        except ValueError:
            pass
```

Update `_FakeMatte.process()` in `test_vision.py` to construct `AlphaStats` with normalized bounds and assert propagation:

```python
assert si.visible_bounds == VisibleBounds(0.01, 0.01, 0.01, 0.01)
```

Update `test_std_to_app()` to expect:

```python
"visible_bounds": {
    "left": 0.1,
    "top": 0.2,
    "width": 0.5,
    "height": 0.6,
},
```

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
python test_alpha_matte.py
python test_vision.py
python test_service.py
```

Expected: FAIL because `VisibleBounds`, `AlphaStats.visible_bounds`, and `StandardizedImage.visible_bounds` do not exist.

- [ ] **Step 3: Implement the minimal canonical types and propagation**

In `stylee/contracts.py`:

```python
from dataclasses import dataclass, field, asdict
import math


@dataclass(frozen=True)
class VisibleBounds:
    left: float
    top: float
    width: float
    height: float

    def __post_init__(self) -> None:
        values = (self.left, self.top, self.width, self.height)
        if not all(math.isfinite(value) for value in values):
            raise ValueError("visible bounds must be finite")
        if self.left < 0 or self.top < 0 or self.width <= 0 or self.height <= 0:
            raise ValueError("visible bounds must be positive and in range")
        if self.left + self.width > 1 or self.top + self.height > 1:
            raise ValueError("visible bounds exceed source image")

    def to_dict(self) -> dict[str, float]:
        return asdict(self)
```

Add to `StandardizedImage`:

```python
visible_bounds: VisibleBounds | None = None
```

In `stylee/vision/alpha_matte.py`, add `visible_bounds` to `AlphaStats` and construct it from the decoded PNG dimensions:

```python
visible_bounds=VisibleBounds(
    left=left / width,
    top=top / height,
    width=(right + 1 - left) / width,
    height=(bottom + 1 - top) / height,
),
```

In `stylee/ingest.py`, propagate:

```python
visible_bounds=matte_output.stats.visible_bounds,
```

In `stylee/service/adapter.py`, serialize only when present:

```python
**(
    {"visible_bounds": si.visible_bounds.to_dict()}
    if si.visible_bounds is not None
    else {}
),
```

Update mock constructors with a deterministic full-image bound:

```python
VisibleBounds(0.0, 0.0, 1.0, 1.0)
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
python test_alpha_matte.py
python test_vision.py
python test_service.py
```

Expected: all three scripts exit `0`.

- [ ] **Step 5: Run the complete canonical root suite**

Run:

```bash
for test_file in test_*.py; do python "$test_file"; done
```

Expected: every root test script exits `0` with no unhandled traceback.

- [ ] **Step 6: Commit the canonical contract**

```bash
git add stylee/contracts.py stylee/vision/alpha_matte.py stylee/ingest.py \
  stylee/vision/mock.py stylee/service/adapter.py \
  test_alpha_matte.py test_vision.py test_service.py
git commit -m "feat(standardize): expose visible garment bounds"
```

---

### Task 2: App visible-bounds parsing and persistence

**Files:**

- Create: `src/lib/outfitImageMetrics.ts`
- Create: `src/lib/outfitImageMetrics.test.ts`
- Modify: `src/lib/styleeMapping.ts`
- Modify: `src/lib/standardizationPolicy.ts`
- Modify: `src/lib/standardizationPolicy.test.ts`
- Modify: `src/lib/imageUploadPolicy.test.ts`

**Interfaces:**

- Consumes: Task 1 `/standardize.visible_bounds` object.
- Produces: `OutfitVisibleBounds`.
- Produces: `parseOutfitVisibleBounds(value: unknown): OutfitVisibleBounds | undefined`.
- Produces: `visibleBoundsFromAttrs(attrs): OutfitVisibleBounds | undefined`.
- Produces: `StandardizationMetadata.visible_bounds?: OutfitVisibleBounds`.
- Consumed by: Tasks 3, 4, and 6.

- [ ] **Step 1: Write failing pure parsing tests**

Create `src/lib/outfitImageMetrics.test.ts`:

```ts
import assert from 'node:assert';
import { test } from 'node:test';
import {
  parseOutfitVisibleBounds,
  visibleBoundsFromAttrs,
} from './outfitImageMetrics.ts';

test('accepts normalized visible bounds', () => {
  assert.deepEqual(parseOutfitVisibleBounds({
    left: 0.1, top: 0.2, width: 0.5, height: 0.6,
  }), { left: 0.1, top: 0.2, width: 0.5, height: 0.6 });
});

test('rejects malformed visible bounds without partial output', () => {
  for (const value of [
    null,
    { left: 0, top: 0, width: 0, height: 1 },
    { left: 0.8, top: 0, width: 0.3, height: 1 },
    { left: Number.NaN, top: 0, width: 1, height: 1 },
  ]) assert.equal(parseOutfitVisibleBounds(value), undefined);
});

test('reads bounds from existing JSON metadata only', () => {
  assert.deepEqual(visibleBoundsFromAttrs({
    visible_bounds: { left: 0, top: 0.1, width: 1, height: 0.8 },
  }), { left: 0, top: 0.1, width: 1, height: 0.8 });
  assert.equal(visibleBoundsFromAttrs(undefined), undefined);
});
```

Extend `standardizationPolicy.test.ts`:

```ts
test('success metadata preserves only valid visible bounds', () => {
  const acceptance = acceptTransparentStandardization({
    ...valid,
    visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  });
  assert.deepEqual(
    buildStandardizationMetadata(acceptance, 'https://storage/original.jpg', 'flatlay').visible_bounds,
    { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  );
});

test('invalid bounds do not reject an otherwise valid transparent PNG', () => {
  const acceptance = acceptTransparentStandardization({
    ...valid,
    visible_bounds: { left: 0.9, top: 0, width: 0.2, height: 1 },
  });
  assert.equal(acceptance.ok, true);
  assert.equal(
    buildStandardizationMetadata(acceptance, 'https://storage/original.jpg', 'flatlay').visible_bounds,
    undefined,
  );
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
node --experimental-strip-types --test \
  src/lib/outfitImageMetrics.test.ts \
  src/lib/standardizationPolicy.test.ts \
  src/lib/imageUploadPolicy.test.ts
```

Expected: FAIL because the metrics module and metadata field do not exist.

- [ ] **Step 3: Implement minimal parsing and persistence**

Create `src/lib/outfitImageMetrics.ts`:

```ts
export interface OutfitVisibleBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const finite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

export function parseOutfitVisibleBounds(value: unknown): OutfitVisibleBounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const { left, top, width, height } = raw;
  if (!finite(left) || !finite(top) || !finite(width) || !finite(height)) return undefined;
  if (left < 0 || top < 0 || width <= 0 || height <= 0) return undefined;
  if (left + width > 1 || top + height > 1) return undefined;
  return { left, top, width, height };
}

export function visibleBoundsFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
): OutfitVisibleBounds | undefined {
  return parseOutfitVisibleBounds(attrs?.visible_bounds);
}
```

Add `visible_bounds?: OutfitVisibleBounds` to `StandardizeResp` and
`StandardizationMetadata`. In `buildStandardizationMetadata`, include:

```ts
const visibleBounds = acceptance.ok
  ? parseOutfitVisibleBounds(acceptance.response.visible_bounds)
  : undefined;

return {
  // existing metadata
  ...(visibleBounds ? { visible_bounds: visibleBounds } : {}),
};
```

Do not include bounds in fallback metadata.

- [ ] **Step 4: Run tests to verify GREEN**

Run the Step 2 command.

Expected: all listed tests pass.

- [ ] **Step 5: Commit App parsing and persistence**

```bash
git add src/lib/outfitImageMetrics.ts src/lib/outfitImageMetrics.test.ts \
  src/lib/styleeMapping.ts src/lib/standardizationPolicy.ts \
  src/lib/standardizationPolicy.test.ts src/lib/imageUploadPolicy.test.ts
git commit -m "feat(images): persist visible garment bounds"
```

---

### Task 3: Deterministic preset image metrics

**Files:**

- Modify: `scripts/check-outfit-fixture-alpha.py`
- Create: `src/data/outfitCanvasImageMetrics.generated.ts`
- Modify: `package.json`
- Modify: `.github/workflows/design-system.yml`
- Test: `src/lib/outfitImageMetrics.test.ts`

**Interfaces:**

- Consumes: Task 2 `OutfitVisibleBounds`.
- Produces: `PRESET_OUTFIT_IMAGE_METRICS` keyed by normalized `/preset-items/...` path.
- Produces: `presetOutfitImageMetrics(uri: string | null | undefined)`.
- Consumed by: Task 6 caller wiring.

- [ ] **Step 1: Write failing preset lookup tests**

Append:

```ts
import { presetOutfitImageMetrics } from './outfitImageMetrics.ts';

test('resolves generated preset bounds from absolute and base-prefixed URLs', () => {
  const direct = presetOutfitImageMetrics('/preset-items/black-tshirt.png');
  const preview = presetOutfitImageMetrics('/preview/outfit-19/preset-items/black-tshirt.png');
  assert.ok(direct?.visibleBounds);
  assert.deepEqual(preview, direct);
  assert.ok(Math.abs((direct?.visibleBounds.width ?? 0) - 0.851) <= 0.01);
});

test('does not guess metrics for arbitrary remote images', () => {
  assert.equal(presetOutfitImageMetrics('https://storage.example/user.png'), undefined);
});
```

- [ ] **Step 2: Run tests and checker to verify RED**

Run:

```bash
node --experimental-strip-types --test src/lib/outfitImageMetrics.test.ts
python3 scripts/check-outfit-fixture-alpha.py --check
```

Expected: FAIL because the generated map and CLI mode do not exist.

- [ ] **Step 3: Extend the alpha checker into a deterministic generator**

Use a stable asset list containing:

```python
ASSETS = (
    "black-tshirt.png",
    "black-trousers.png",
    "beige-shorts.png",
    "a-line-skirt.png",
    "khaki-trench.png",
    "black-dress.png",
    "womens-loafers.png",
    "beige-scarf.png",
    "black-backpack.png",
)
```

For each RGBA PNG, emit full source aspect and normalized alpha bbox. Render a
sorted TypeScript module with this shape:

```ts
// Generated by scripts/check-outfit-fixture-alpha.py. Do not edit.
export const PRESET_OUTFIT_IMAGE_METRICS = {
  '/preset-items/black-tshirt.png': {
    sourceAspectRatio: 1,
    visibleBounds: { left: 0.0747, top: 0.0885, width: 0.8506, height: 0.8242 },
  },
} as const;
```

CLI behavior:

```bash
python3 scripts/check-outfit-fixture-alpha.py --write  # writes generated TS
python3 scripts/check-outfit-fixture-alpha.py --check  # exits 1 on drift
```

Add App helpers:

```ts
import { PRESET_OUTFIT_IMAGE_METRICS } from '@/data/outfitCanvasImageMetrics.generated';

export interface OutfitImageMetrics {
  sourceAspectRatio?: number;
  visibleBounds?: OutfitVisibleBounds;
}

export function presetOutfitImageMetrics(uri?: string | null): OutfitImageMetrics | undefined {
  if (!uri) return undefined;
  const marker = '/preset-items/';
  const index = uri.indexOf(marker);
  if (index < 0) return undefined;
  const key = uri.slice(index).split(/[?#]/, 1)[0];
  return PRESET_OUTFIT_IMAGE_METRICS[key as keyof typeof PRESET_OUTFIT_IMAGE_METRICS];
}
```

- [ ] **Step 4: Add CI and package commands**

Add:

```json
"outfit-metrics:build": "python3 scripts/check-outfit-fixture-alpha.py --write",
"outfit-metrics:check": "python3 scripts/check-outfit-fixture-alpha.py --check"
```

In `design-system.yml`, include the script and generated file in path filters,
then add:

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.11"

- name: Install image metric dependency
  run: python -m pip install -r model-service/requirements.txt

- name: Verify outfit image metrics
  run: npm run outfit-metrics:check
```

- [ ] **Step 5: Generate metrics and verify GREEN**

Run:

```bash
python3 -m pip install -r model-service/requirements.txt
npm run outfit-metrics:build
npm run outfit-metrics:check
node --experimental-strip-types --test src/lib/outfitImageMetrics.test.ts
```

Expected: checker prints the nine asset metrics and exits `0`; Node tests pass.

- [ ] **Step 6: Commit preset metrics**

```bash
git add scripts/check-outfit-fixture-alpha.py \
  src/data/outfitCanvasImageMetrics.generated.ts \
  src/lib/outfitImageMetrics.ts src/lib/outfitImageMetrics.test.ts package.json \
  .github/workflows/design-system.yml
git commit -m "feat(layout): add preset visible image metrics"
```

---

### Task 4: Visible-subject layout and gap enforcement

**Files:**

- Modify: `src/lib/outfitCanvasLayout.ts`
- Modify: `src/lib/outfitCanvasLayout.test.ts`

**Interfaces:**

- Consumes: Task 2 `OutfitVisibleBounds` and `OutfitImageMetrics`.
- Extends: `OutfitCanvasLayoutItem.visibleBounds?: OutfitVisibleBounds`.
- Produces: placements whose `left/top/width/height` describe visible subject rectangles.
- Produces: `visibleContentAspect(item): number | null`.
- Produces: `sourceImageGeometryForVisiblePlacement(placement)` for Task 5 rendering.

- [ ] **Step 1: Replace frame-gap tests with failing visible-geometry tests**

Add metric-backed items:

```ts
const metricItem = (
  id: string,
  role: OutfitCanvasRole,
  sourceAspectRatio: number,
  visibleBounds: OutfitVisibleBounds,
): OutfitCanvasLayoutItem => ({
  id,
  name: id,
  category: role,
  layoutRole: role,
  imageUri: `${id}.png`,
  imageAspectRatio: sourceAspectRatio,
  visibleBounds,
});

const shirt = metricItem('shirt', 'base', 1, {
  left: 0.0747, top: 0.0885, width: 0.8506, height: 0.8242,
});
const trousers = metricItem('trousers', 'bottom', 1, {
  left: 0.3353, top: 0.0757, width: 0.3299, height: 0.8505,
});
const shoesWithMetrics = metricItem('shoes', 'shoes', 1, {
  left: 0.2243, top: 0.3181, width: 0.7009, height: 0.2459,
});
```

Add assertions:

```ts
test('visible shirt and trousers use role envelopes and preserve a real gap', () => {
  const layout = buildOutfitCanvasLayout([shirt, trousers, shoesWithMetrics]);
  const upper = placement(layout, 'shirt');
  const lower = placement(layout, 'trousers');
  const shoes = placement(layout, 'shoes');
  const dressingGap = lower.top - (upper.top + upper.height);
  const footGap = shoes.top - (lower.top + lower.height);
  assert.ok(dressingGap >= 2 && dressingGap <= 4, `${dressingGap}`);
  assert.ok(footGap >= 5 && footGap <= 8, `${footGap}`);
  assert.ok(upper.width / lower.width < 2, `${upper.width / lower.width}`);
  assert.ok(lower.height > upper.height);
});
```

Add equivalent shorts, skirt, outer-layer, and legal 2/3/4/5/6 fixture tests.

- [ ] **Step 2: Run focused layout tests to verify RED**

```bash
node --experimental-strip-types --test src/lib/outfitCanvasLayout.test.ts
```

Expected: FAIL because placements still represent image frames, visible gaps
overlap, and `visibleBounds` is ignored.

- [ ] **Step 3: Implement visible role envelopes**

Replace scale-first core geometry with visible envelopes:

```ts
const VISIBLE_ENVELOPE: Record<OutfitCanvasRole, { width: number; height: number }> = {
  base: { width: 44, height: 30 },
  mid: { width: 44, height: 30 },
  outer: { width: 58, height: 70 },
  dress: { width: 56, height: 70 },
  bottom: { width: 38, height: 46 },
  shoes: { width: 25, height: 18 },
  bag: { width: 22, height: 24 },
  hat: { width: 18, height: 15 },
  scarf: { width: 18, height: 26 },
  accessory: { width: 12, height: 12 },
};

export function visibleContentAspect(item: OutfitCanvasLayoutItem): number | null {
  const sourceAspect = item.imageAspectRatio;
  const bounds = item.visibleBounds;
  if (!sourceAspect || !bounds) return sourceAspect ?? null;
  return sourceAspect * bounds.width / bounds.height;
}

function fitVisibleAspect(role: OutfitCanvasRole, aspect: number | null) {
  const envelope = VISIBLE_ENVELOPE[role];
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return envelope;
  const envelopeAspect = envelope.width / envelope.height;
  return aspect > envelopeAspect
    ? { width: envelope.width, height: envelope.width / aspect }
    : { width: envelope.height * aspect, height: envelope.height };
}
```

Anchor the bottom from the maximum visible upper bottom plus `DRESSING_GAP`.
Anchor shoes from the maximum visible core bottom plus `FOOT_GAP`. Keep existing
semantic peripheral candidates and occupancy maps.

Update global fit/center to union rotated visible rectangles directly. Do not
apply `garmentImageScale` to a placement that already represents visible size.

- [ ] **Step 4: Implement source-image geometry mapping**

Add:

```ts
export function sourceImageGeometryForVisiblePlacement(
  entry: OutfitCanvasPlacement,
) {
  const bounds = entry.item.visibleBounds;
  if (!bounds || !entry.item.imageAspectRatio) {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  return {
    left: -bounds.left / bounds.width * 100,
    top: -bounds.top / bounds.height * 100,
    width: 100 / bounds.width,
    height: 100 / bounds.height,
  };
}
```

The component will apply these percentages inside the visible placement.

- [ ] **Step 5: Run layout tests to verify GREEN**

Run the Step 2 command.

Expected: all visible ratio, gap, center, safety, and semantic-zone tests pass.

- [ ] **Step 6: Commit visible geometry**

```bash
git add src/lib/outfitCanvasLayout.ts src/lib/outfitCanvasLayout.test.ts
git commit -m "fix(layout): size and separate visible garment subjects"
```

---

### Task 5: Web dimensions and image-error fallback

**Files:**

- Create: `src/lib/outfitCanvasImageState.ts`
- Create: `src/lib/outfitCanvasImageState.test.ts`
- Modify: `src/design-system/StyleeOutfitCanvas.tsx`
- Modify: `src/design-system/outfitCanvasComponent.test.ts`

**Interfaces:**

- Consumes: Task 4 visible placements and source geometry.
- Produces: `requestOutfitImageAspect(uri, getSize): Promise<number>`.
- Produces: `OutfitCanvasImageStatusRegistry` keyed by item ID and source key.
- Produces: placeholder rendering on load failure without item mutation.

- [ ] **Step 1: Write failing image-state tests**

Create:

```ts
import assert from 'node:assert';
import { test } from 'node:test';
import {
  markOutfitCanvasImageError,
  outfitCanvasImageHasError,
  requestOutfitImageAspect,
} from './outfitCanvasImageState.ts';

test('remote size adapter resolves an aspect ratio', async () => {
  const ratio = await requestOutfitImageAspect('https://image.test/a.png', (uri, ok) => {
    assert.equal(uri, 'https://image.test/a.png');
    ok(600, 1200);
  });
  assert.equal(ratio, 0.5);
});

test('remote size adapter rejects invalid dimensions', async () => {
  await assert.rejects(
    requestOutfitImageAspect('https://image.test/a.png', (_uri, ok) => ok(0, 1200)),
  );
});

test('image errors are scoped to the source key', () => {
  const state = markOutfitCanvasImageError({}, 'item', 'old.png');
  assert.equal(outfitCanvasImageHasError(state, 'item', 'old.png'), true);
  assert.equal(outfitCanvasImageHasError(state, 'item', 'new.png'), false);
});
```

Update the component source contract test to require `Image.getSize`, `onError`,
`sourceImageGeometryForVisiblePlacement`, and placeholder rendering for an error.

- [ ] **Step 2: Run tests to verify RED**

```bash
node --experimental-strip-types --test \
  src/lib/outfitCanvasImageState.test.ts \
  src/design-system/outfitCanvasComponent.test.ts
```

Expected: FAIL because the helper and error state do not exist.

- [ ] **Step 3: Implement pure image state helpers**

```ts
export type ImageGetSize = (
  uri: string,
  success: (width: number, height: number) => void,
  failure?: (error: unknown) => void,
) => void;

export function requestOutfitImageAspect(uri: string, getSize: ImageGetSize) {
  return new Promise<number>((resolve, reject) => {
    getSize(uri, (width, height) => {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        reject(new Error('invalid image dimensions'));
        return;
      }
      resolve(width / height);
    }, reject);
  });
}
```

Use `{ sourceKey: string; status: 'error' }` entries for the immutable error
registry. Source-key mismatch automatically clears a historical error.

- [ ] **Step 4: Wire Web metrics and fallback into the component**

In `StyleeOutfitCanvas`:

```ts
useEffect(() => {
  let cancelled = false;
  const remotes = preparedItems.filter(entry => (
    entry.originalItem.imageUri && !entry.layoutItem.imageAspectRatio
  ));
  remotes.forEach(entry => {
    void requestOutfitImageAspect(entry.originalItem.imageUri!, Image.getSize)
      .then(aspect => {
        if (cancelled) return;
        setLoadedImageAspects(current => rememberOutfitCanvasImageAspect(
          current, entry.originalItem.id, entry.sourceKey, aspect, 1,
        ));
      })
      .catch(() => undefined);
  });
  return () => { cancelled = true; };
}, [preparedItems]);
```

Render the mapped full image inside the visible placement:

```tsx
const geometry = sourceImageGeometryForVisiblePlacement(entry);
const hasError = outfitCanvasImageHasError(imageErrors, entry.item.id, preparedItem.sourceKey);

{source && !hasError ? (
  <Image
    source={source}
    onError={() => setImageErrors(current => markOutfitCanvasImageError(
      current, entry.item.id, preparedItem.sourceKey,
    ))}
    style={[styles.image, {
      left: percent(geometry.left),
      top: percent(geometry.top),
      width: percent(geometry.width),
      height: percent(geometry.height),
    }]}
    resizeMode="stretch"
  />
) : (
  <View style={styles.placeholder}>
    <Text numberOfLines={2} style={styles.placeholderText}>{entry.item.name}</Text>
  </View>
)}
```

Set `styles.image.position = 'absolute'`. Preserve the Pressable accessibility
label and hit slop.

- [ ] **Step 5: Run tests to verify GREEN**

Run the Step 2 command.

Expected: all image-state and component-contract tests pass.

- [ ] **Step 6: Commit Web dimensions and fallback**

```bash
git add src/lib/outfitCanvasImageState.ts src/lib/outfitCanvasImageState.test.ts \
  src/design-system/StyleeOutfitCanvas.tsx \
  src/design-system/outfitCanvasComponent.test.ts
git commit -m "fix(canvas): handle Web image size and load failure"
```

---

### Task 6: Caller metric wiring and focused App verification

**Files:**

- Modify: `src/lib/outfitImageMetrics.ts`
- Modify: `src/app/outfit/result.tsx`
- Modify: `src/app/outfit-layout-demo.tsx`
- Modify: `src/lib/outfitResultRole.test.ts`
- Modify: `src/lib/outfitLayoutDemoRoute.test.ts`
- Modify: `src/design-system/README.md`

**Interfaces:**

- Consumes: persisted bounds, preset metrics, Task 4 layout item fields.
- Produces: `outfitImageMetricsForWardrobeItem(item): OutfitImageMetrics | undefined`.
- Produces: every owned canvas item carrying optional `imageAspectRatio` and `visibleBounds`.

- [ ] **Step 1: Write failing caller-path tests**

Add source/data assertions that result and demo callers use the shared resolver:

```ts
assert.match(resultSource, /outfitImageMetricsForWardrobeItem\(oi\.item\)/);
assert.match(demoSource, /outfitImageMetricsForWardrobeItem\(entry\.item\)/);
```

Add pure resolver coverage:

```ts
test('persisted bounds override preset metrics while preset aspect fills missing values', () => {
  const metrics = outfitImageMetricsForWardrobeItem({
    image_url: '/preset-items/black-tshirt.png',
    ai_recognized_attrs: {
      visible_bounds: { left: 0.1, top: 0.1, width: 0.8, height: 0.8 },
    },
  });
  assert.deepEqual(metrics?.visibleBounds, { left: 0.1, top: 0.1, width: 0.8, height: 0.8 });
  assert.equal(metrics?.sourceAspectRatio, 1);
});
```

- [ ] **Step 2: Run focused tests to verify RED**

```bash
node --experimental-strip-types --test \
  src/lib/outfitImageMetrics.test.ts \
  src/lib/outfitResultRole.test.ts \
  src/lib/outfitLayoutDemoRoute.test.ts
```

Expected: FAIL because callers do not provide visible metrics.

- [ ] **Step 3: Implement shared WardrobeItem metric resolution**

```ts
export function outfitImageMetricsForWardrobeItem(
  item: Pick<WardrobeItem, 'image_url' | 'ai_recognized_attrs'> | null | undefined,
): OutfitImageMetrics | undefined {
  if (!item) return undefined;
  const preset = presetOutfitImageMetrics(item.image_url);
  const persisted = visibleBoundsFromAttrs(item.ai_recognized_attrs);
  if (!preset && !persisted) return undefined;
  return {
    sourceAspectRatio: preset?.sourceAspectRatio,
    visibleBounds: persisted ?? preset?.visibleBounds,
  };
}
```

Wire both callers:

```ts
const metrics = outfitImageMetricsForWardrobeItem(oi.item);
return {
  // existing item fields
  imageAspectRatio: metrics?.sourceAspectRatio,
  visibleBounds: metrics?.visibleBounds,
};
```

Do the same for demo owned items. Recommended source-less items remain unchanged.

- [ ] **Step 4: Run all focused App tests**

```bash
node --experimental-strip-types --test \
  src/lib/outfitImageMetrics.test.ts \
  src/lib/standardizationPolicy.test.ts \
  src/lib/imageUploadPolicy.test.ts \
  src/lib/outfitCanvasLayout.test.ts \
  src/lib/outfitCanvasImageState.test.ts \
  src/design-system/outfitCanvasComponent.test.ts \
  src/lib/outfitResultRole.test.ts \
  src/lib/outfitLayoutDemoRoute.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Run App static verification**

```bash
npm run outfit-metrics:check
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 6: Commit caller integration**

```bash
git add src/lib/outfitImageMetrics.ts src/app/outfit/result.tsx \
  src/app/outfit-layout-demo.tsx src/lib/outfitResultRole.test.ts \
  src/lib/outfitLayoutDemoRoute.test.ts src/design-system/README.md
git commit -m "feat(app): render persisted visible garment metrics"
```

---

### Task 7: Canonical release and governed App mirror sync

**Files:**

- Canonical branch: `codex/visible-bounds-standardization`
- Generated App mirror: `model-service/**`
- Modify through sync only: `model-service/UPSTREAM_COMMIT`

**Interfaces:**

- Consumes: Task 1 canonical commit.
- Produces: merged canonical `main` SHA.
- Produces: byte-identical governed App mirror pinned to that SHA.

- [ ] **Step 1: Re-run canonical full verification from a clean status**

```bash
git status --short --branch
for test_file in test_*.py; do python "$test_file"; done
python scripts/release_smoke.py --help >/dev/null
git diff --check
```

Expected: clean worktree, all tests pass.

- [ ] **Step 2: Push canonical branch and create a Draft PR**

```bash
git push -u origin codex/visible-bounds-standardization
gh pr create --repo fitzw/style-model --draft \
  --base main \
  --head codex/visible-bounds-standardization \
  --title "feat: expose standardized garment visible bounds" \
  --body "Adds optional normalized visible_bounds to /standardize. The field is backward compatible, stores no user data, and is covered by alpha, ingest, adapter, and full root tests. App PR #19 consumes the merged contract."
```

The PR body lists contract compatibility, tests, no persistence mutation, and
the App PR #19 dependency.

- [ ] **Step 3: Review and merge checkpoint**

```bash
gh pr checks --repo fitzw/style-model codex/visible-bounds-standardization
gh pr view --repo fitzw/style-model codex/visible-bounds-standardization \
  --json state,isDraft,mergeable,mergeStateStatus,statusCheckRollup,url
```

Expected: required checks pass and merge state is clean. Mark ready for review,
then stop for the user to merge the canonical PR.

- [ ] **Step 4: Fetch the merged canonical SHA**

```bash
git -C /Users/bytedance/Documents/style-model fetch origin main
git -C /Users/bytedance/Documents/style-model pull --ff-only origin main
git -C /Users/bytedance/Documents/style-model rev-parse HEAD
```

Expected: HEAD is the canonical visible-bounds merge commit.

- [ ] **Step 5: Sync the App mirror from canonical main**

From the App worktree:

```bash
./scripts/sync-model-service.sh /Users/bytedance/Documents/style-model
./scripts/check-model-service-sync.sh /Users/bytedance/Documents/style-model
```

Run every generated mirror test:

```bash
for test_file in model-service/test_*.py; do python "$test_file"; done
```

Expected: strict sync passes and every mirror test exits `0`.

- [ ] **Step 6: Commit the governed mirror pin**

```bash
git add model-service
git commit -m "chore(model-service): sync visible-bounds contract"
```

---

### Task 8: Real preview validation and preview cleanup

**Files:**

- Temporary until cleanup: `.github/workflows/deploy-outfit-preview.yml`
- Temporary until cleanup: `.stylee-preview-action`
- Temporary until cleanup: `scripts/preview-pages.sh`
- Temporary until cleanup: `scripts/test-preview-pages.sh`
- Remove from final PR: all four paths above

**Interfaces:**

- Consumes: merged canonical mirror and completed App canvas.
- Produces: accepted screenshots for legal 2–6 item fixtures and two real error/success paths.
- Produces: PR #19 without preview-only files and Pages without `/preview/outfit-19`.

- [ ] **Step 1: Run full pre-preview verification**

```bash
node --experimental-strip-types --test $(find src -name '*.test.ts' -print)
npm run outfit-metrics:check
npm run check
npm run build:web
./scripts/check-model-service-sync.sh /Users/bytedance/Documents/style-model
git diff --check
```

Expected: all Node tests pass, build succeeds, strict sync passes.

- [ ] **Step 2: Deploy the isolated same-origin preview**

Ensure `.stylee-preview-action` contains `deploy`, commit only if a deployment
trigger is needed, push PR #19, and wait for `Temporary outfit layout preview`.

```bash
git push origin codex/outfit-quality-semantic-layout
gh run list --repo yiguo2026/stylee_mvp_v2 \
  --branch codex/outfit-quality-semantic-layout --limit 5
```

Expected: preview workflow succeeds without replacing the production root.

- [ ] **Step 3: Capture fixture screenshots at all widths**

For each width `320`, `375`, `393`, `430`, and `768`, capture:

```text
2-item dress
3-item base/trousers/shoes
4-item outer/base/trousers/shoes
5-item scarf
6-item scarf/bag
```

Acceptance per screenshot:

```text
all visible subjects inside safe inset
upper/lower gap visibly non-negative and within 2%-4%
lower/shoe gap within 5%-8%
T-shirt/trousers visible width ratio below 2.0
composition visually centered
no accessory collision or accessory beside shoes
```

- [ ] **Step 4: Run real success and failure paths**

Use the authenticated preview account:

```text
Success: add or replace one test garment, verify transparent standardization,
         using `public/preset-items/white-shirt.png`, name it
         `Codex Visible Bounds Test Shirt`, generate an outfit with preset
         counterparts, and capture the result.
Failure: use the existing `黑色短袖Polo针织衫` broken-image result, confirm the
         semantic placeholder, and confirm the wardrobe row remains unchanged.
```

Delete or restore only the explicitly created test item after evidence is
captured. Do not modify unrelated wardrobe items.

- [ ] **Step 5: Trigger Pages preview cleanup**

Change only the action marker to `cleanup`, commit, and push:

```bash
git add .stylee-preview-action
git commit -m "chore(preview): clean outfit audit deployment"
git push origin codex/outfit-quality-semantic-layout
```

Wait for the preview workflow and verify the exact preview directory is gone:

```bash
gh run list --repo yiguo2026/stylee_mvp_v2 \
  --branch codex/outfit-quality-semantic-layout --limit 5
curl -I https://yiguo2026.github.io/preview/outfit-19/
```

Expected: cleanup workflow succeeds and the preview URL returns `404`.

- [ ] **Step 6: Remove preview-only files from PR #19**

Use `apply_patch` to delete:

```text
.github/workflows/deploy-outfit-preview.yml
.stylee-preview-action
scripts/preview-pages.sh
scripts/test-preview-pages.sh
```

Commit:

```bash
git add -A -- .github/workflows/deploy-outfit-preview.yml \
  .stylee-preview-action scripts/preview-pages.sh scripts/test-preview-pages.sh
git commit -m "chore(preview): remove temporary outfit audit"
```

- [ ] **Step 7: Run final release verification**

```bash
node --experimental-strip-types --test $(find src -name '*.test.ts' -print)
npm run outfit-metrics:check
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
./scripts/check-model-service-sync.sh /Users/bytedance/Documents/style-model
for test_file in model-service/test_*.py; do python "$test_file"; done
git diff --check
git status --short --branch
gh pr view 19 --repo yiguo2026/stylee_mvp_v2 \
  --json state,isDraft,mergeable,mergeStateStatus,statusCheckRollup,url
```

Expected:

```text
all tests and builds pass
strict mirror sync passes
no preview-only file remains in the PR diff
PR #19 is OPEN, Draft, CLEAN, and MERGEABLE
```

- [ ] **Step 8: Push final branch and hand off readiness decision**

```bash
git push origin codex/outfit-quality-semantic-layout
gh pr checks 19 --repo yiguo2026/stylee_mvp_v2
```

Report accepted screenshots, exact canonical merge SHA, App head SHA, and any
deferred items. Ask the user before marking PR #19 ready for review.
