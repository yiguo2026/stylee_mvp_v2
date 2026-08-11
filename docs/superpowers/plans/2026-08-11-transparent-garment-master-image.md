# Transparent Garment Master Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every successful future garment standardization persist one verified transparent PNG, then render that same asset over semantic scene backgrounds without migrating historical wardrobe images.

**Architecture:** Implement bounded white-background alpha matting in the canonical `fitzw/style-model` service, return a verified PNG data URI from `/standardize`, and mirror the canonical service into the App repository. The App strictly accepts only the new transparent contract, uploads the PNG to Supabase, falls back to the original image on any failure, and renders wardrobe assets through a shared semantic-background media component.

**Tech Stack:** Python 3.12, Pillow 12.3.0, stdlib HTTP and script-style tests, Expo SDK 54 / React Native 0.81, TypeScript 5.8, Node 22 `node --test`, Supabase Storage, Stylee Design System v3.8.

## Global Constraints

- Read `https://docs.expo.dev/versions/v55.0.0/` before App code, as required by `AGENTS.md`; do not upgrade Expo SDK 54 in this feature.
- Read `docs/STYLEE_DESIGN_SYSTEM_CONTEXT.md`, `design-tokens/README.md`, and `src/design-system/README.md` before shared UI edits.
- Preserve `scripts/patch-html.js` and `.codex-pet-runs/`; never stage them.
- Change `/Users/bytedance/Documents/style-model` first on branch `codex/transparent-garment-master`, then mirror governed files into this App repository.
- Pin the sole new service dependency to `Pillow==12.3.0`.
- Reject input bytes above 20 MiB, decoded images above 16 megapixels, PNG output above 8 MiB, and App data URIs above 12 MiB.
- Success requires `verified`, `alpha_verified`, `background: "transparent"`, `mime: "image/png"`, and a bounded PNG data URI.
- Never persist a white-background generated result as a successful master image.
- Never put secrets, image bytes, or data URIs in Git, App code, logs, analytics, or JSONB metadata.
- Do not add database columns, migrate old records, generate SVG, bake scene colors into pixels, add retry UI, or change try-on generation.
- Use only Design System v3.8 semantic background tokens and keep garment media `contain`.
- Preserve the wardrobe grid geometry and two-column density.
- Use TDD and make one narrowly scoped commit per task.

---

## File and responsibility map

Canonical model repository:

- `requirements.txt`, `Dockerfile` — pinned Pillow runtime.
- `stylee/vision/alpha_matte.py` — bounded decode/download, connected-background masking, PNG encoding, and alpha validation.
- `stylee/vision/base.py`, `stylee/vision/mock.py` — matte interface and deterministic test provider.
- `stylee/vision/dashscope.py` — uniform shadow-free white preparation prompt.
- `stylee/contracts.py`, `stylee/ingest.py` — transparent result contract and photo-type routing.
- `stylee/service/server.py`, `stylee/service/adapter.py` — processor wiring, trace stages, and response serialization.
- `test_alpha_matte.py`, `test_vision.py`, `test_service.py` — processor, route, fallback, and endpoint tests.

App repository:

- `model-service/**`, `scripts/check-model-service-sync.sh` — governed canonical mirror.
- `src/lib/styleeMapping.ts`, `standardizationPolicy.ts`, `styleeService.ts`, `ai.ts` — strict client contract and request path.
- `src/lib/imageUploadPolicy.ts`, `uploadImage.ts`, import/add/edit files — PNG persistence and fallback metadata.
- `src/design-system/garmentMediaTone.ts`, `StyleeGarmentMedia.tsx`, released cards — shared scene-background contract.
- Wardrobe/outfit/try-on screens — semantic garment rendering only where the URI belongs to a wardrobe item.
- `scripts/styleeSmoke.ts` and READMEs — safe smoke assertions and rollout documentation.

---

### Task 1: Canonical bounded alpha-matte processor

**Files:**
- Create: `/Users/bytedance/Documents/style-model/requirements.txt`
- Create: `/Users/bytedance/Documents/style-model/stylee/vision/alpha_matte.py`
- Create: `/Users/bytedance/Documents/style-model/test_alpha_matte.py`
- Modify: `/Users/bytedance/Documents/style-model/Dockerfile`

**Interfaces:**
- Consumes: encoded image bytes or PNG/JPEG data/HTTP references.
- Produces: `AlphaMatteOutput`, `matte_image_bytes(data, stage_timer=None)`, `validate_alpha_png(data)`, and `read_image_ref(ref, timeout_seconds=20)`.

- [ ] **Step 1: Prepare the canonical checkout**

If the repository is absent:

```bash
git clone https://github.com/fitzw/style-model.git /Users/bytedance/Documents/style-model
```

Then:

```bash
git -C /Users/bytedance/Documents/style-model fetch origin --prune
git -C /Users/bytedance/Documents/style-model switch -c codex/transparent-garment-master origin/main
```

Expected: clean branch. If the checkout exists or is dirty, use `superpowers:using-git-worktrees`; never reset it.

- [ ] **Step 2: Add and install Pillow**

Create `requirements.txt`:

```text
Pillow==12.3.0
```

Add before `USER stylee` in `Dockerfile`:

```dockerfile
RUN python3 -m pip install --no-cache-dir -r requirements.txt
```

Run:

```bash
/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m venv /Users/bytedance/Documents/style-model/.venv
/Users/bytedance/Documents/style-model/.venv/bin/python -m pip install -r /Users/bytedance/Documents/style-model/requirements.txt
```

Expected: Pillow reports version 12.3.0.

- [ ] **Step 3: Write failing processor tests**

Create generated fixtures in `test_alpha_matte.py`:

```python
import base64
import io
from PIL import Image, ImageDraw
from stylee.vision.alpha_matte import AlphaMatteError, matte_image_bytes, read_image_ref, validate_alpha_png

def fixture_png(background=(255, 255, 255), white_center=False):
    image = Image.new("RGB", (100, 100), background)
    draw = ImageDraw.Draw(image)
    draw.rectangle((25, 20, 75, 80), fill=(25, 40, 55))
    if white_center:
        draw.rectangle((40, 35, 60, 65), fill=(255, 255, 255))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()

def test_connected_border_is_transparent_but_internal_white_survives():
    result = matte_image_bytes(fixture_png(white_center=True))
    png = base64.b64decode(result.data_uri.split(",", 1)[1])
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    assert image.getpixel((0, 0))[3] <= 16
    assert image.getpixel((50, 50))[3] >= 32
    assert result.alpha_verified is True

def test_off_white_canvas_fails_validation():
    try:
        matte_image_bytes(fixture_png((220, 220, 220)))
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.alpha_validate"

def test_data_uri_round_trip():
    raw = fixture_png()
    ref = "data:image/png;base64," + base64.b64encode(raw).decode()
    assert read_image_ref(ref) == raw
    stats = validate_alpha_png(base64.b64decode(matte_image_bytes(raw).data_uri.split(",", 1)[1]))
    assert stats.transparent_ratio >= 0.05
    assert stats.visible_ratio >= 0.05
    assert stats.transparent_border_ratio >= 0.90

def test_exact_input_limits_fail_closed():
    import stylee.vision.alpha_matte as matte
    oversized = base64.b64encode(b"x" * (matte.MAX_INPUT_BYTES + 1)).decode()
    try:
        read_image_ref("data:image/png;base64," + oversized)
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

    original_limit = matte.MAX_OUTPUT_BYTES
    matte.MAX_OUTPUT_BYTES = 1
    try:
        matte_image_bytes(fixture_png())
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.png_encode"
    finally:
        matte.MAX_OUTPUT_BYTES = original_limit

    large = Image.new("RGB", (4001, 4000), (255, 255, 255))
    out = io.BytesIO()
    large.save(out, format="PNG")
    try:
        matte_image_bytes(out.getvalue())
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

def main():
    test_connected_border_is_transparent_but_internal_white_survives()
    test_off_white_canvas_fails_validation()
    test_data_uri_round_trip()
    test_exact_input_limits_fail_closed()
    print("ok")

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Verify the tests fail for the missing module**

```bash
cd /Users/bytedance/Documents/style-model
.venv/bin/python test_alpha_matte.py
```

Expected: `ModuleNotFoundError` for `stylee.vision.alpha_matte`.

- [ ] **Step 5: Implement the processor**

Define these constants and types in `alpha_matte.py`:

```python
MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_INPUT_PIXELS = 16_000_000
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_EDGE = 1600
TRANSPARENT_ALPHA_MAX = 16
VISIBLE_ALPHA_MIN = 32
MIN_TRANSPARENT_RATIO = 0.05
MIN_VISIBLE_RATIO = 0.05
MIN_TRANSPARENT_BORDER_RATIO = 0.90
MATTE_PROVIDER = "pillow-border-connected-v1"

class AlphaMatteError(RuntimeError):
    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage

@dataclass(frozen=True)
class AlphaStats:
    transparent_ratio: float
    visible_ratio: float
    transparent_border_ratio: float
    visible_bbox: tuple[int, int, int, int]

@dataclass(frozen=True)
class AlphaMatteOutput:
    data_uri: str
    mime: str
    alpha_verified: bool
    provider: str
    stats: AlphaStats
```

Decode with Pillow, reject exact limits, convert to RGBA, and resize the longest edge to at most 1600. Flood only border-connected 4-neighbor pixels satisfying `min(r,g,b) >= 235` and channel spread `<= 20`. Set visited alpha with:

```python
def soft_alpha(r: int, g: int, b: int) -> int:
    whiteness = (r + g + b) / 3
    return max(0, min(255, round((250 - whiteness) * 255 / 15)))
```

`matte_image_bytes(data, stage_timer=None)` must wrap mask construction, validation, and encoding with `A2.alpha_matte`, `A2.alpha_validate`, and `A2.png_encode` when a timer factory is supplied. Encode optimized PNG, enforce 8 MiB, validate all three ratios and a non-empty visible bounding box, then construct the PNG data URI. `read_image_ref` must size-bound data URIs and HTTP(S) streams and reject every other scheme.

- [ ] **Step 6: Run tests and Docker build**

```bash
cd /Users/bytedance/Documents/style-model
.venv/bin/python test_alpha_matte.py
docker build -t stylee-model-transparent:test .
```

Expected: test prints `ok`; Docker build exits 0.

- [ ] **Step 7: Commit**

```bash
git -C /Users/bytedance/Documents/style-model add requirements.txt Dockerfile stylee/vision/alpha_matte.py test_alpha_matte.py
git -C /Users/bytedance/Documents/style-model commit -m "feat(vision): add bounded transparent PNG matting"
```

---

### Task 2: Canonical transparent pipeline and response contract

**Files:**
- Modify: `/Users/bytedance/Documents/style-model/stylee/vision/base.py`
- Modify: `/Users/bytedance/Documents/style-model/stylee/vision/mock.py`
- Modify: `/Users/bytedance/Documents/style-model/stylee/vision/dashscope.py`
- Modify: `/Users/bytedance/Documents/style-model/stylee/contracts.py`
- Modify: `/Users/bytedance/Documents/style-model/stylee/ingest.py`
- Modify: `/Users/bytedance/Documents/style-model/stylee/service/server.py`
- Modify: `/Users/bytedance/Documents/style-model/stylee/service/adapter.py`
- Modify: `/Users/bytedance/Documents/style-model/test_vision.py`
- Modify: `/Users/bytedance/Documents/style-model/test_service.py`
- Modify: `/Users/bytedance/Documents/style-model/README.md`
- Modify: `/Users/bytedance/Documents/style-model/ARCHITECTURE.md`

**Interfaces:**
- Consumes: `AlphaMatteOutput`, `ImageStandardizer`, `VisionProvider`, and `RequestTrace.stage`.
- Produces: extended `StandardizedImage` and `/standardize` JSON with transparent verification fields.

- [ ] **Step 1: Write failing routing and contract tests**

Add to `test_vision.py`:

```python
class _FakeMatte:
    name = "pillow-border-connected-v1"
    def __init__(self, fail_first=False):
        self.refs = []
        self.fail_first = fail_first
    def process(self, image_ref, stage_timer=None):
        self.refs.append(image_ref)
        if self.fail_first and len(self.refs) == 1:
            from stylee.vision.alpha_matte import AlphaMatteError
            raise AlphaMatteError("A2.alpha_validate", "not transparent")
        from stylee.vision.alpha_matte import AlphaMatteOutput, AlphaStats
        return AlphaMatteOutput(
            "data:image/png;base64,AAAA", "image/png", True, self.name,
            AlphaStats(0.5, 0.5, 1.0, (1, 1, 2, 2)),
        )

def test_web_uses_direct_matte_before_edit():
    matte = _FakeMatte()
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://web", item, PhotoType.WEB, _FakeVP({}), _BoomStd(), matte)
    assert matte.refs == ["orig://web"]
    assert si.method == "direct_matte" and si.alpha_verified is True

def test_web_direct_failure_falls_back_to_edit_then_matte():
    from stylee.vision.mock import MockImageStandardizer
    matte = _FakeMatte(fail_first=True)
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://web", item, PhotoType.WEB, _FakeVP({}), MockImageStandardizer(), matte)
    assert matte.refs == ["orig://web", "mock://std/img2img"]
    assert si.method == "img2img_alpha" and si.verified is True

def test_terminal_failure_never_verifies_white_output():
    item = WardrobeItem(id="i", category=Category.TOP)
    si = standardize_item("orig://x", item, PhotoType.FLATLAY, _FakeVP({}), _BoomStd(), _FakeMatte())
    assert si.verified is False and si.alpha_verified is False
    assert si.failure_stage == "A2.image_edit"
```

Update `test_service.py::test_std_to_app` to assert every new response field. Update endpoint smoke assertions to require transparent mock output.

Add all new test functions to the existing `main()` call lists in `test_vision.py` and `test_service.py`; these files are executed directly, not through pytest discovery.

- [ ] **Step 2: Verify focused tests fail**

```bash
cd /Users/bytedance/Documents/style-model
.venv/bin/python test_vision.py
.venv/bin/python test_service.py
```

Expected: failures for the missing matte argument and missing dataclass fields.

- [ ] **Step 3: Define interface and contract**

Add to `base.py`:

```python
class AlphaMatteProcessor(ABC):
    name: str
    @abstractmethod
    def process(self, image_ref: str, stage_timer=None):
        raise NotImplementedError
```

Implement `PillowAlphaMatteProcessor.process` in `alpha_matte.py`, wrapping work in `A2.source_image_download`, `A2.alpha_matte`, `A2.alpha_validate`, and `A2.png_encode`. Add `MockAlphaMatteProcessor` that creates a deterministic 4×4 PNG with transparent border and opaque center.

Extend `StandardizedImage`:

```python
@dataclass
class StandardizedImage:
    image_ref: str
    method: str
    verified: bool = False
    mime: str = ""
    background: str = ""
    alpha_verified: bool = False
    matte_provider: str = ""
    failure_stage: str | None = None
```

- [ ] **Step 4: Implement exact routing and fallback**

Change `standardize_item` to consume `matte_processor: AlphaMatteProcessor`.

1. `WEB`: direct matte first; on failure record `A2.direct_matte`, run `img2img`, then matte again.
2. `FLATLAY`: `cutout` preparation then matte; success method `cutout_alpha`.
3. Other types: `img2img` preparation then matte; success method `img2img_alpha`.
4. Run visual verification against the transparent data URI.
5. Only alpha success plus no visual drift yields `verified=True`.
6. Terminal failure returns original `image_ref`, `cropped_fallback`, both verification flags false, and the first failed stage.

Update DashScope preparation prompts to require `均匀纯白 #FFFFFF 背景，无投影、无地面、无人物、无文字` while preserving color, material, silhouette, and prints.

- [ ] **Step 5: Wire server and adapter**

Use mock matte with mock standardizer and Pillow matte otherwise. Annotate only provider names and stage timings; never log `image_ref`.

Serialize:

```python
def std_to_app(si) -> dict:
    return {
        "image_ref": si.image_ref,
        "mime": si.mime,
        "method": si.method,
        "verified": si.verified,
        "background": si.background,
        "alpha_verified": si.alpha_verified,
        "matte_provider": si.matte_provider,
        "failure_stage": si.failure_stage,
    }
```

Keep `provider` and `trace` assignment in `server.py`.

- [ ] **Step 6: Update canonical docs and run every offline test**

Replace white-background and zero-dependency claims with the transparent contract, web fast path, Pillow install, exact limits, and four trace stages. Then run:

```bash
cd /Users/bytedance/Documents/style-model
for t in test_*.py; do .venv/bin/python "$t"; done
```

Expected: every script prints `ok`; none prints a complete data URI.

- [ ] **Step 7: Commit**

```bash
git -C /Users/bytedance/Documents/style-model add stylee test_vision.py test_service.py README.md ARCHITECTURE.md
git -C /Users/bytedance/Documents/style-model commit -m "feat(vision): return verified transparent garment masters"
```

---

### Task 3: Mirror and verify the vendored model service

**Files:**
- Create: `model-service/requirements.txt`
- Create: `model-service/stylee/vision/alpha_matte.py`
- Create: `model-service/test_alpha_matte.py`
- Modify: corresponding governed files under `model-service/`
- Modify: `scripts/check-model-service-sync.sh`

**Interfaces:**
- Consumes: canonical commits from Tasks 1–2.
- Produces: a governed App vendor copy matching `/Users/bytedance/Documents/style-model`.

- [ ] **Step 1: Mirror canonical files with `apply_patch`**

Mirror `requirements.txt`, `Dockerfile`, `ARCHITECTURE.md`, `stylee/`, `test_alpha_matte.py`, `test_vision.py`, and `test_service.py`. Preserve App-specific README commands and `model-service/data/garments2look/`.

- [ ] **Step 2: Extend drift detection**

Add `requirements.txt` to the governed deployment loop and `test_alpha_matte.py` to the governed test loop in `scripts/check-model-service-sync.sh`.

- [ ] **Step 3: Verify tests and governed sync**

```bash
cd /Users/bytedance/Documents/styleetest1/model-service
for t in test_*.py; do /Users/bytedance/Documents/style-model/.venv/bin/python "$t"; done
cd /Users/bytedance/Documents/styleetest1
./scripts/check-model-service-sync.sh /Users/bytedance/Documents/style-model
```

Expected: all scripts print `ok`; sync checker reports `model-service vendored copy matches style-model`.

- [ ] **Step 4: Commit only vendor files**

```bash
git add model-service scripts/check-model-service-sync.sh
git commit -m "chore(model): sync transparent garment standardization"
```

Verify the staged list excludes `scripts/patch-html.js`, `.codex-pet-runs/`, and unrelated App files.

---

### Task 4: Strict App response policy

**Files:**
- Create: `src/lib/standardizationPolicy.ts`
- Create: `src/lib/standardizationPolicy.test.ts`
- Modify: `src/lib/styleeMapping.ts`

**Interfaces:**
- Consumes: `StandardizeResp`.
- Produces: `acceptTransparentStandardization(response)` and JSONB-safe `buildStandardizationMetadata(...)`.

- [ ] **Step 1: Extend `StandardizeResp`**

```ts
export interface StandardizeResp {
  image_ref: string;
  method: string;
  verified: boolean;
  mime?: string;
  background?: string;
  alpha_verified?: boolean;
  matte_provider?: string;
  failure_stage?: string | null;
  provider?: string;
  trace?: ModelServiceTrace;
}
```

- [ ] **Step 2: Write failing strict-policy tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { acceptTransparentStandardization, buildStandardizationMetadata } from './standardizationPolicy.ts';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const valid = {
  image_ref: png, method: 'cutout_alpha', verified: true, mime: 'image/png',
  background: 'transparent', alpha_verified: true,
  matte_provider: 'pillow-border-connected-v1', failure_stage: null,
};

test('accepts only verified transparent PNG data URIs', () => {
  assert.equal(acceptTransparentStandardization(valid).ok, true);
  assert.equal(acceptTransparentStandardization({ ...valid, verified: false }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, background: 'white' }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, mime: 'image/jpeg' }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: 'https://provider/x.png' }).ok, false);
});

test('rejects malformed and oversized PNG data URIs', () => {
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: 'data:image/png;base64,***' }).ok, false);
  const oversized = 'data:image/png;base64,' + 'A'.repeat(12 * 1024 * 1024);
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: oversized }).ok, false);
});

test('metadata never contains PNG bytes', () => {
  const metadata = buildStandardizationMetadata(
    acceptTransparentStandardization(valid), 'https://storage/original.jpg', 'flatlay',
  );
  assert.equal(metadata.standardization_ok, true);
  assert.equal(metadata.transparent_background, true);
  assert.equal(JSON.stringify(metadata).includes('iVBOR'), false);
});
```

- [ ] **Step 3: Verify failure**

```bash
node --test src/lib/standardizationPolicy.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 4: Implement the pure policy**

```ts
export const MAX_STANDARDIZED_DATA_URI_LENGTH = 12 * 1024 * 1024;
const PNG_DATA_URI = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export type TransparentAcceptance =
  | { ok: true; uri: string; response: StandardizeResp }
  | { ok: false; reason: 'missing' | 'unverified' | 'not_transparent' | 'not_png' | 'malformed' | 'oversize'; response?: StandardizeResp };
```

Check URI length before regex. Failure metadata uses `fallback_original`, both verification booleans false, and the response failure stage or acceptance reason. Success metadata contains method, booleans, matte provider, original URI, and photo type but never `image_ref`.

- [ ] **Step 5: Verify and commit**

```bash
node --test src/lib/standardizationPolicy.test.ts
npm run check
git add src/lib/styleeMapping.ts src/lib/standardizationPolicy.ts src/lib/standardizationPolicy.test.ts
git commit -m "feat(app): validate transparent standardization responses"
```

Expected: both commands exit 0.

---

### Task 5: Detailed request path and no-skip behavior

**Files:**
- Modify: `src/lib/styleeService.ts`
- Modify: `src/lib/styleeService.test.ts`
- Modify: `src/lib/recognitionPolicy.ts`
- Modify: `src/lib/recognitionPolicy.test.ts`
- Modify: `src/lib/ai.ts`

**Interfaces:**
- Consumes: `acceptTransparentStandardization` and `StandardizeResp`.
- Produces: `serviceStandardizeDetailed(...)` and `GarmentStandardizationResult`.

- [ ] **Step 1: Write failing service and web-policy tests**

Add a `styleeService.test.ts` case that calls `serviceStandardizeDetailed('QUJD', 'image/png', 'web', '上装')` and asserts `/standardize`, `photo_type: 'web'`, a generated `X-Request-ID`, and response trace preservation.

Replace the current skip test with:

```ts
test('all future image types request transparent standardization', async () => {
  const policy = await import('./recognitionPolicy.ts');
  for (const photoType of ['web', 'product', 'flatlay', 'on_body', 'angled', undefined]) {
    assert.equal(policy.shouldStandardizePhotoType(photoType), true);
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
node --test src/lib/styleeService.test.ts src/lib/recognitionPolicy.test.ts
```

Expected: detailed method is missing and web/product assertions fail.

- [ ] **Step 3: Add the detailed method and strict AI result**

```ts
export async function serviceStandardizeDetailed(
  b64: string, mime: string, photoType: string, category: string,
  extras?: { color?: string; material?: string; description?: string },
): Promise<ServiceResult<StandardizeResp>> {
  return _postJsonDetailed<StandardizeResp>(
    '/standardize',
    { image_b64: b64, mime, photo_type: photoType, item: { category, ...extras } },
    90000,
  );
}
```

Make `serviceStandardize` delegate to `.data`. Make `shouldStandardizePhotoType` return true for all current or missing types.

Define:

```ts
export interface GarmentStandardizationResult {
  url: string | null;
  meta: AIMeta;
  skipped: false;
  acceptance: TransparentAcceptance;
}
```

Remove the web/product early return in `aiStandardizeGarment`. Call the detailed service and strict policy. Populate `url` only from successful acceptance, `meta.source` as `model-service/<provider>/<method>`, and `failedStage` from `failure_stage` or detailed service error. Preserve request ID and duration without logging the data URI.

- [ ] **Step 4: Verify and commit**

```bash
node --test src/lib/styleeService.test.ts src/lib/recognitionPolicy.test.ts src/lib/standardizationPolicy.test.ts
npm run check
git add src/lib/styleeService.ts src/lib/styleeService.test.ts src/lib/recognitionPolicy.ts src/lib/recognitionPolicy.test.ts src/lib/ai.ts
git commit -m "feat(app): require transparent standardization for new images"
```

Expected: tests and type/design checks exit 0.

---

### Task 6: PNG persistence and exact failure metadata

**Files:**
- Create: `src/lib/imageUploadPolicy.ts`
- Create: `src/lib/imageUploadPolicy.test.ts`
- Modify: `src/lib/uploadImage.ts`
- Modify: `src/stores/importStore.ts`
- Modify: `src/app/wardrobe/add.tsx`
- Modify: `src/app/wardrobe/edit/[id].tsx`

**Interfaces:**
- Consumes: `GarmentStandardizationResult` and `buildStandardizationMetadata`.
- Produces: durable original and `.png` master Supabase URLs, JSONB-safe metadata, and exact fallback copy.

- [ ] **Step 1: Write failing upload policy tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { storageFormatFor } from './imageUploadPolicy.ts';

test('transparent data URI persists as PNG', () => {
  assert.deepEqual(storageFormatFor('data:image/png;base64,AAAA', 'image/png'), {
    extension: 'png', contentType: 'image/png',
  });
});

test('legacy JPEG behavior stays compatible', () => {
  assert.deepEqual(storageFormatFor('file:///photo.jpg', 'image/jpeg'), {
    extension: 'jpg', contentType: 'image/jpeg',
  });
});
```

- [ ] **Step 2: Verify module-not-found failure**

```bash
node --test src/lib/imageUploadPolicy.test.ts
```

- [ ] **Step 3: Implement and use the storage policy**

`storageFormatFor(uri, mime)` accepts `jpg`, `jpeg`, `png`, `gif`, `webp`, and `bmp`, normalizes `jpeg` to `jpg`, uses MIME before the path extension, and defaults to JPEG. Replace `uploadImage.ts::extensionFor` with this helper and pass its content type to Supabase.

- [ ] **Step 4: Persist transparent result metadata in all future image flows**

- `importStore.ts`: use `acceptance.ok`, always process web/product, merge `buildStandardizationMetadata`, and never store the transient data URI in `standardized_image_url`.
- `add.tsx`: keep the full `GarmentStandardizationResult` in state, merge recognition and standardization metadata on save, and fall back to original on processing or upload failure.
- `edit/[id].tsx`: apply the contract only after a replacement photo is selected, merge metadata into existing JSONB, and never reprocess an untouched stored image.

For a successful transparent master, first upload the source image to the existing bucket under subfolder `originals`, then upload the transparent PNG as the main image. Pass the durable original URL—not a `file:`, `blob:`, or provider-temporary URI—to `buildStandardizationMetadata`. On failure, the durable original URL is both `image_url` and `original_image_url`. Do not create background-color variants.

Use success copy `已更新为透明主图` and exact failure copy `透明主图生成失败，已保留原图`. Never display `标准化完成` for a rejected response.

- [ ] **Step 5: Verify and commit**

```bash
node --test src/lib/imageUploadPolicy.test.ts src/lib/standardizationPolicy.test.ts src/lib/recognitionPolicy.test.ts
npm run check
rg -n "data:image/png;base64" src/stores src/app
```

Expected: tests/check exit 0; the search finds no metadata, logging, or analytics assignment containing PNG bytes.

```bash
git add src/lib/imageUploadPolicy.ts src/lib/imageUploadPolicy.test.ts src/lib/uploadImage.ts src/stores/importStore.ts src/app/wardrobe/add.tsx 'src/app/wardrobe/edit/[id].tsx'
git commit -m "feat(wardrobe): persist transparent garment masters"
```

---

### Task 7: Shared semantic garment-media contract

**Files:**
- Create: `src/design-system/garmentMediaTone.ts`
- Create: `src/design-system/garmentMediaTone.test.ts`
- Create: `src/design-system/StyleeGarmentMedia.tsx`
- Modify: `src/design-system/StyleeWardrobeCard.tsx`
- Modify: `src/design-system/StyleeOutfitItemCard.tsx`
- Modify: `src/design-system/index.ts`
- Modify: `src/design-system/README.md`

**Interfaces:**
- Consumes: Design System semantic tokens and wardrobe image URIs.
- Produces: `GarmentMediaTone` and `StyleeGarmentMedia` with `contain` rendering.

- [ ] **Step 1: Write the failing tone-map test**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { garmentMediaBackgroundByTone } from './garmentMediaTone.ts';
import { ds } from './tokens.ts';

test('tones map only to semantic tokens', () => {
  assert.deepEqual(garmentMediaBackgroundByTone, {
    neutral: ds.color.semantic.surface.card,
    owned: ds.color.semantic.surface.input,
    recommended: ds.color.semantic.status.attentionSubtle,
    inverse: ds.color.semantic.surface.inverse,
  });
});
```

- [ ] **Step 2: Verify module-not-found failure**

```bash
node --test src/design-system/garmentMediaTone.test.ts
```

- [ ] **Step 3: Implement the component**

```ts
export type GarmentMediaTone = 'neutral' | 'owned' | 'recommended' | 'inverse';

export interface StyleeGarmentMediaProps {
  imageUri?: string | null;
  imageSource?: ImageSourcePropType;
  tone?: GarmentMediaTone;
  placeholder?: ReactNode;
  children?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}
```

Render a full-size `View` using the tested semantic map, then a full-size React Native `Image` with `resizeMode="contain"`, then overlays. Add no geometry or raw colors; consumers own aspect ratio and radius.

- [ ] **Step 4: Adopt in released cards**

Use `StyleeGarmentMedia tone="neutral"` inside `StyleeWardrobeCard`, preserving placeholder and loading overlay. Add optional `imageUri` and `mediaTone` to `StyleeOutfitItemCard`; derive owned/recommended default tone and keep the existing `media` prop as compatibility fallback.

- [ ] **Step 5: Verify and commit**

```bash
node --test src/design-system/garmentMediaTone.test.ts
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npx --no-install tsc --noEmit
git add src/design-system
git commit -m "feat(design-system): add semantic garment media"
```

Expected: all checks exit 0 and wardrobe geometry is unchanged.

---

### Task 8: Core wardrobe and outfit scene adoption

**Files:**
- Modify: `scripts/check-design-system.mjs`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/wardrobe/[id].tsx`
- Modify: `src/app/outfit/[id].tsx`
- Modify: `src/app/outfit/result.tsx`

**Interfaces:**
- Consumes: `StyleeGarmentMedia` and `StyleeOutfitItemCard.imageUri`.
- Produces: neutral wardrobe/detail and owned/recommended outfit rendering from the same master URL.

- [ ] **Step 1: Add a failing static migration guard**

Extend `check-design-system.mjs` for the four scoped files. Direct wardrobe-item images newly touched by this feature must use `StyleeGarmentMedia` or `StyleeOutfitItemCard imageUri`; `resizeMode="cover"` on `item.image_url`/`fi.image_url` fails. Exempt inspiration images and generated outfit covers.

- [ ] **Step 2: Verify the guard catches current direct garment renderers**

```bash
npm run design-system:check
```

Expected: FAIL listing direct wardrobe garment nodes in the four files.

- [ ] **Step 3: Migrate core scenes**

- Home wardrobe thumbnail and item detail: `neutral`.
- Saved outfit owned items: `owned`.
- Outfit result owned/flatlay/swap items: `owned`.
- Missing/recommended items: `recommended`.
- Pass `imageUri` directly to `StyleeOutfitItemCard`.

Preserve sizes, overlays, actions, navigation, and press targets. Do not change inspiration images or generated covers.

- [ ] **Step 4: Verify and commit**

```bash
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
git add scripts/check-design-system.mjs 'src/app/(tabs)/index.tsx' 'src/app/wardrobe/[id].tsx' 'src/app/outfit/[id].tsx' src/app/outfit/result.tsx
git commit -m "feat(ui): render garment masters on semantic scenes"
```

Expected: all commands exit 0.

---

### Task 9: Try-on and selection thumbnail adoption

**Files:**
- Modify: `scripts/check-design-system.mjs`
- Modify: `src/app/outfit/try-on.tsx`
- Modify: `src/app/outfit/try-on-result.tsx`
- Modify: `src/app/outfit/try-on-detail.tsx`
- Modify: `src/app/outfit/result.tsx`

**Interfaces:**
- Consumes: `StyleeGarmentMedia tone="owned"`.
- Produces: transparent-friendly wardrobe-item thumbnails without changing generated try-on images or selfies.

- [ ] **Step 1: Extend the guard and verify failure**

Add the three try-on files plus result swap/selection nodes to the Task 8 guard.

```bash
npm run design-system:check
```

Expected: FAIL only for direct wardrobe-item thumbnails; selfies, body images, generated try-on results, and outfit covers remain exempt.

- [ ] **Step 2: Replace only wardrobe-item thumbnails**

Use `StyleeGarmentMedia tone="owned"` for `item.image_url` and selected wardrobe items. Preserve `cover` for selfies and generated try-on output. Do not modify Gamma screens or model requests.

- [ ] **Step 3: Verify and commit**

```bash
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
git add scripts/check-design-system.mjs src/app/outfit/try-on.tsx src/app/outfit/try-on-result.tsx src/app/outfit/try-on-detail.tsx src/app/outfit/result.tsx
git commit -m "feat(ui): apply semantic backgrounds to garment thumbnails"
```

Expected: all commands exit 0.

---

### Task 10: Safe smoke test, full validation, and release handoff

**Files:**
- Modify: `scripts/styleeSmoke.ts`
- Modify: `README.md`
- Modify: `model-service/README.md`
- Modify: `src/design-system/README.md`

**Interfaces:**
- Consumes: local or deployed canonical service and completed App integration.
- Produces: safe smoke evidence, complete local verification, and an explicit deployment gate.

- [ ] **Step 1: Assert the contract without logging image bytes**

Replace the standardization log in `styleeSmoke.ts` with:

```ts
const std = await serviceStandardize(b64, 'image/png', rec?.photo_type ?? 'flatlay', rec?.category ?? '上装');
const safeStd = std ? {
  verified: std.verified,
  alpha_verified: std.alpha_verified,
  background: std.background,
  mime: std.mime,
  method: std.method,
  matte_provider: std.matte_provider,
  failure_stage: std.failure_stage,
  image_ref_kind: std.image_ref.startsWith('data:image/png;base64,') ? 'png_data_uri' : 'unexpected',
  image_ref_chars: std.image_ref.length,
} : null;
console.log('standardize:', safeStd);
if (!std?.verified || !std.alpha_verified || std.background !== 'transparent' ||
    std.mime !== 'image/png' || safeStd?.image_ref_kind !== 'png_data_uri') {
  throw new Error('transparent standardization contract failed');
}
```

- [ ] **Step 2: Update documentation**

Document transparent PNG masters, semantic scene backgrounds, exact fallback copy, no historical migration, all size limits, Pillow 12.3.0, canonical-first sync, and verification commands. Remove white-background endpoint and zero-dependency claims.

- [ ] **Step 3: Run every offline verification command fresh**

```bash
cd /Users/bytedance/Documents/style-model
for t in test_*.py; do .venv/bin/python "$t"; done
cd /Users/bytedance/Documents/styleetest1/model-service
for t in test_*.py; do /Users/bytedance/Documents/style-model/.venv/bin/python "$t"; done
cd /Users/bytedance/Documents/styleetest1
./scripts/check-model-service-sync.sh /Users/bytedance/Documents/style-model
node --test src/lib/*.test.ts src/design-system/*.test.ts
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

Expected: Python scripts print `ok`, sync matches, Node has zero failures, npm commands exit 0.

- [ ] **Step 4: Run two real-service quality smokes**

Start the canonical service with server-side keys. Run `scripts/styleeSmoke.ts` with one approved white garment and one patterned garment. Both must report `verified: true`, `alpha_verified: true`, `background: transparent`, `mime: image/png`, and `image_ref_kind: png_data_uri` without printing bytes or credentials.

Inspect each PNG on `neutral`, `inverse`, and `recommended` backgrounds. Reject white canvas, halos, missing cuffs/straps/holes, or category/color drift.

- [ ] **Step 5: Check responsive and historical compatibility**

At 320, 375, 393, 430, and 768 pt, inspect wardrobe grid, detail, outfit result, swap selection, and try-on item thumbnails. Confirm unchanged density, `contain`, touch targets, and untouched historical white-background images.

- [ ] **Step 6: Commit docs and smoke safety**

```bash
git add scripts/styleeSmoke.ts README.md model-service/README.md src/design-system/README.md
git commit -m "docs: document transparent garment master rollout"
```

- [ ] **Step 7: Stop at deployment gate**

Report both repositories' commit series and smoke evidence. Do not push, deploy Render, change `EXPO_PUBLIC_STYLEE_API`, or release the App without explicit user approval. When approved, deploy the canonical service first, smoke the HTTPS contract, then release the App.

---

## Plan self-review checklist

- Spec coverage: processor/limits → Tasks 1–2; canonical/vendor boundary → Task 3; strict client contract → Tasks 4–5; persistence/fallback/history → Task 6; semantic scenes → Tasks 7–9; testing/observability/release order → Task 10.
- Excluded: SVG, exported colored images, historical migration, retry queue, database migration, raw product colors, and try-on generation changes.
- Type chain: `StandardizedImage` → `StandardizeResp` → `TransparentAcceptance` → `GarmentStandardizationResult` → JSONB-safe metadata.
- Data URI lifetime: service response → transient App result → upload only; never logs, analytics, or database metadata.
- Every task includes a failing test/guard, passing verification, and scoped commit.
