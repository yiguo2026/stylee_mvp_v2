# Stylee Outfit Canvas Visible-Bounds Repair Design

Date: 2026-08-27  
Status: Approved in chat; written spec pending user review  
Repositories:

- Canonical service: `fitzw/style-model`
- App integration: `yiguo2026/stylee_mvp_v2`

## 1. Problem

PR #19 correctly constrains outfit structure and places semantic accessory
roles, but the canvas still sizes and separates garments using the full image
rectangle. Transparent padding inside that rectangle is ignored.

The shipped fixture demonstrates the failure:

- `black-tshirt.png` visible alpha width: about `0.851` of the square image.
- `black-trousers.png` visible alpha width: about `0.330` of the square image.
- Both source images report a `1:1` aspect ratio.
- Current role scales are nearly equal: `base=1.62`, `bottom=1.58`.
- The resulting visible shirt width is about `2.57x` the trousers without an
  outer layer and `2.34x` with an outer layer.
- The configured `3%` dressing gap is a frame gap. After image scaling, the
  visible shirt and trousers overlap by roughly `8%` of canvas height.

The alpha-matte service already computes `visible_bbox`, but this value is
dropped before the standardization contract reaches the App. On Web, remote
image dimensions also remain unknown because React Native Web does not expose
`Image.resolveAssetSource` and its load event does not provide
`nativeEvent.source.width/height`.

Separately, when an image URI exists but cannot be rendered, the canvas has no
`onError` state and displays an empty slot instead of a useful fallback.

## 2. Goals

This repair will:

1. Size upper and lower garments from the visible subject, not transparent
   canvas padding.
2. Enforce upper/lower and lower/shoe spacing on visible subject bounds.
3. Center the visible composition rather than only centering image frames.
4. Show a semantic placeholder when an image fails to load.
5. Resolve remote image dimensions on Web without relying on unsupported load
   event fields.
6. Preserve the current semantic accessory zones and legal `n`-item behavior.
7. Remove temporary preview-only files and the deployed preview directory after
   final validation.

## 3. Non-goals

This repair will not:

- bulk reprocess or overwrite historical wardrobe images;
- add a database column or migration;
- build a catalog image resolver for recommended gap items;
- tune model latency or recommendation relevance;
- finish the Figma audit board;
- change model outfit legality, layer limits, or accessory-count policy;
- change try-on generation or save/record interactions;
- globally redesign Stylee tokens or shared typography.

New issues discovered outside these boundaries are recorded as follow-up TODOs
instead of expanding this repair.

## 4. Chosen approach

Use a small optional visible-bounds contract. Do not rewrite all transparent
PNGs and do not compensate with global role-scale hacks.

### Rejected approach: global scale constants

Reducing the upper scale or increasing the lower scale cannot work across
trousers, shorts, and skirts. Their shipped alpha widths range from about
`0.330` to `0.847`, so one bottom multiplier would fix one item and break
another.

### Rejected approach: rewriting every image asset

Tight-cropping every stored master would change the behavior of wardrobe cards,
detail screens, and existing user records. It also conflicts with the decision
not to bulk rewrite historical data.

### Selected approach: optional normalized visible bounds

The service returns normalized visible-subject bounds for newly standardized
images. The App stores them in existing JSON metadata. Shipped preset assets use
a checked-in generated metrics manifest. Historical images without metrics keep
a conservative compatibility path.

## 5. Contract design

### 5.1 Normalized shape

Both repositories use the same optional logical shape:

```text
visible_bounds = {
  left:   number in [0, 1),
  top:    number in [0, 1),
  width:  number in (0, 1],
  height: number in (0, 1]
}
```

Required invariants:

- `left + width <= 1`
- `top + height <= 1`
- every value is finite
- malformed or missing bounds are treated as unavailable, never partially used

The contract is optional for backward compatibility.

### 5.2 Canonical service

`AlphaStats.visible_bbox` remains the pixel-level internal result. The
alpha-validation stage converts it to normalized bounds using the decoded PNG
width and height.

`StandardizedImage` gains optional `visible_bounds`. `std_to_app` serializes it
only when valid. Existing clients that ignore the field remain compatible.

The service does not store user data and does not change recommendation
payloads in this repair.

### 5.3 App standardization metadata

`StandardizeResp` and `StandardizationMetadata` gain optional
`visible_bounds`. `persistGarmentMaster` writes it into the existing
`ai_recognized_attrs` JSON object alongside current standardization metadata.

No Supabase schema migration is required.

Replacement-photo and new-import paths preserve the field through their current
metadata merge. Historical rows remain untouched.

### 5.4 Preset asset metrics

Extend `scripts/check-outfit-fixture-alpha.py` to generate or verify a checked-in
preset metrics file keyed by stable preset image path. The file contains source
aspect ratio and normalized visible bounds.

The same metrics are used by the demo fixtures and by wardrobe items whose
`image_url` resolves to a shipped preset path. This fixes the current fixture
and any existing record that still references the same public preset URL
without mutating the row.

The script is the source of truth; hand-edited metric drift fails CI.

## 6. App image-metric resolution

For each canvas item, resolve metrics in this order:

1. Explicit `visibleBounds` and `imageAspectRatio` already supplied by the
   caller.
2. Persisted `ai_recognized_attrs.visible_bounds` for newly standardized or
   replaced items.
3. Shipped preset metrics matched by normalized asset path.
4. Full-image aspect ratio from static asset metadata or remote size lookup.
5. Conservative unknown-metrics fallback.

Never infer bounds from item name, color, or model prose.

### Web dimension resolution

- Bundled numeric assets may use `Image.resolveAssetSource` when available.
- Remote URI images use `Image.getSize(uri, success, failure)` in an effect.
- Native `onLoad` dimensions remain a secondary source on platforms that
  provide them.
- Dimension callbacks are keyed by item ID plus source key; stale responses do
  not update a replacement image.
- Resolution failure changes only the metric state, not the wardrobe row.

## 7. Visible geometry

### 7.1 Role envelopes

The placement model describes the visible garment subject. The initial role
envelopes for the current repair are:

| Role | Max visible width | Max visible height |
|---|---:|---:|
| base | 44 | 30 |
| mid | 44 | 30 |
| bottom | 38 | 46 |
| outer | 58 | 70 |
| dress | 56 | 70 |

Accessory and shoe visible-size ranges remain as currently approved. Shoe size
polish is deferred unless the repaired fit violates the existing test range.

Within an envelope, the visible subject preserves its content aspect ratio:

```text
content_aspect = source_aspect * visible_bounds.width / visible_bounds.height
```

The visible subject is fitted with `contain` into the role envelope. This lets
long trousers use more height while shorts and skirts naturally use more width,
without a subtype-specific multiplier table.

### 7.2 Visible gaps

For ordinary separates:

- visible upper-to-lower gap: `2%` to `4%` of canvas height
- visible lower-to-shoe gap: `5%` to `8%` of canvas height

Dress-plus-shoe behavior remains separate. Layered upper garments may overlap
one another, but the lowest visible upper bound still controls the lower-garment
anchor.

Gap tests operate on visible rectangles after scale, not placement frames.

### 7.3 Global fit and center

Global fit and centering use visible rectangles plus rotation. The algorithm:

1. Builds semantic core and accessory zones as today.
2. Resolves each item's visible content aspect and role envelope.
3. Positions lower and shoe roles using visible gaps.
4. Applies global scaling only when the visible union exceeds the safe inset.
5. Centers the visible union on both axes.

Transparent full-image margins may extend beyond a visible rectangle, but they
do not affect fit, collision, or centering.

### 7.4 Source-to-visible mapping

The renderer maps the full source image into the target visible rectangle using
normalized bounds. It derives full image size and offset so the alpha subject
lands exactly in the visible rectangle while preserving source aspect ratio.

Images without visible bounds use the conservative full-image fallback and are
never treated as equivalent evidence for visible-gap tests.

## 8. Image failure behavior

Canvas image state is tracked per item and source key:

- `unknown/loading`
- `loaded`
- `error`

When an image errors:

- preserve the semantic layout slot;
- replace the image with the existing category/name placeholder;
- keep the accessible item label;
- do not retry in a render loop;
- do not mutate or delete the wardrobe item;
- do not count the failed image as loaded metric evidence.

A source-less recommended item continues to use the same placeholder path.

## 9. Tests

### 9.1 Canonical service

Add tests for:

- normalized bounds conversion from known pixel bbox and PNG size;
- strict range and finite-value validation;
- optional `visible_bounds` serialization through `std_to_app`;
- backward compatibility when bounds are absent;
- mock and live-fixture response shape parity.

### 9.2 App policy and persistence

Add tests for:

- `StandardizeResp` acceptance preserving valid bounds;
- malformed bounds being discarded without rejecting an otherwise valid PNG;
- persisted standardization metadata carrying bounds through add and replacement
  paths;
- no Supabase schema-column dependency.

### 9.3 Preset metrics

The alpha checker verifies at least:

- black T-shirt
- black trousers
- representative shorts
- representative skirt
- trench
- loafers
- scarf
- backpack

Checked-in metrics must match decoded alpha bounds within `0.01`.

### 9.4 Layout

Add visible-geometry assertions for:

- base + trousers + shoes
- base + shorts + shoes
- base + skirt + shoes
- outer + base + trousers + shoes
- legal 2/3/4/5/6-item fixtures

Required assertions:

- all items preserved
- safe inset respected
- visible union centered
- upper/lower visible gap is `2%` to `4%`
- lower/shoe visible gap is `5%` to `8%`
- no non-layer accessory collision
- T-shirt/trousers visible width ratio is below `2.0`
- bottom visible height exceeds base visible height for long trousers

### 9.5 Component

Add component-level tests for:

- remote Web dimensions using the `Image.getSize` adapter;
- stale dimension callback invalidation;
- image error switching to a placeholder;
- changing URI clearing the prior error state;
- visible-bounds mapping being passed to layout;
- accessibility label retained in loaded and error states.

## 10. Verification

### Canonical repository

- all canonical Python tests
- release-smoke fixtures
- `/health` contract compatibility

### App repository

- focused visible-bounds, mapper, persistence, and canvas component tests
- full Node test suite
- `npm run tokens:check`
- `npm run design-system:check`
- `npm run wardrobe-density:check`
- `npm run check`
- `npm run build:web`
- strict canonical/App mirror check
- preset alpha/metrics checker

### Visual acceptance

Capture and inspect:

- 2-item dress fixture
- 3-item T-shirt/trousers/shoes fixture
- 4-item outer/base/trousers/shoes fixture
- 5-item scarf fixture
- 6-item scarf/bag fixture
- one newly standardized garment combined with preset counterparts
- one broken historical image showing a placeholder without row mutation

Required widths: `320`, `375`, `393`, `430`, and `768` pt.

## 11. Delivery sequence

1. Create a new canonical service branch and Draft PR for the optional
   `visible_bounds` standardization contract.
2. Merge the canonical PR after its tests and contract checks pass.
3. Sync the generated App `model-service/` mirror and pin the merged SHA.
4. Implement App persistence, preset metrics, visible geometry, Web dimensions,
   and error fallback in PR #19.
5. Rebuild the isolated same-origin preview and run visual acceptance.
6. Remove preview-only workflow, marker, scripts, and tests from PR #19.
7. Remove the deployed `preview/outfit-19` directory from the Pages repository.
8. Re-run full verification, then mark PR #19 ready for review.

## 12. Deferred TODOs

- bulk historical-image reprocessing
- catalog image resolution for recommended gaps
- recommendation latency and p50/p95 targets
- soft scene-quality tuning
- final shoe-size polish outside the approved range
- Figma audit completion
- unrelated analytics table/schema warnings

These do not expand the current repair.

## 13. Completion criteria

The repair is complete only when:

- canonical and App contracts agree on optional normalized visible bounds;
- no database migration is introduced;
- the fixture T-shirt is no more than `2.0x` the visible trousers width;
- visible upper/lower and lower/shoe gaps meet their ranges;
- broken images render a semantic placeholder instead of blank space;
- Web remote dimensions no longer depend on `nativeEvent.source`;
- 2–6 item fixtures remain safe, centered, and collision-free;
- the real new-import preview passes;
- temporary preview artifacts are removed before PR #19 is marked ready.
