# Transparent Garment Master Image Design

Date: 2026-08-10  
Status: Approved for implementation planning

## 1. Context

Stylee currently standardizes a newly imported garment into a raster product
image on a pure white background. The App then copies the model provider's
temporary URL into Supabase Storage and uses that asset as the wardrobe item's
`image_url`.

The approved behavior changes the canonical standardized asset from a white
background image to a transparent PNG. Screens may place a semantic background
color behind that transparent asset at render time. They must not generate or
store separate image files for each scene color.

Although an SVG output was considered, the selected format is PNG with an
alpha channel. It preserves real fabric texture, prints, gradients, lace, and
soft edges more reliably than tracing a photographic garment into vector
paths.

## 2. Goals

- Generate one transparent PNG master image for every successful future
  garment standardization.
- Preserve the garment's category, main colors, material appearance, pattern,
  and silhouette.
- Treat a white-background image as a failed result, not a successful
  standardized asset.
- Let each UI scene choose a Design System semantic background behind the same
  transparent master image.
- Keep imports non-blocking when standardization or alpha processing fails.
- Preserve the original source image and failure metadata for diagnosis and a
  possible future retry feature.
- Keep existing wardrobe records and their stored images unchanged.

## 3. Non-goals

- Producing SVG garment assets.
- Exporting a new image with a scene background color baked into the pixels.
- Generating or storing one asset per scene or background color.
- Batch-migrating existing white-background wardrobe images.
- Adding a background-color picker for users in this release.
- Adding a background retry queue or a manual retry action in this release.
- Changing recommendation, try-on generation, or historical wardrobe data.

## 4. Selected approach

The system stores a transparent PNG as the canonical standardized garment
asset. Background color is a presentation concern owned by shared UI media
components.

The model service keeps its existing photo-type-aware standardization step,
then performs deterministic server-side alpha matting and alpha validation.
The App accepts the result only when both the existing visual verification and
the new alpha verification pass.

This design deliberately does not rely on a prompt alone to produce
transparency. Image-generation providers may return a white or flattened
background even when transparency is requested. The server must create and
verify the alpha channel before reporting success.

## 5. Architecture and data flow

```text
Source photo
  -> garment recognition
  -> photo-type routing
  -> clean product-image preparation when required
  -> connected-background alpha matting
  -> alpha validation
  -> category/color visual verification
  -> transparent PNG data response
  -> App upload to Supabase Storage
  -> wardrobe image_url
  -> shared media component + scene semantic background
```

### 5.1 Photo-type routing

- `web` / `product`: do not run an expensive image-edit operation first. Try
  direct alpha matting on the source product image. If its background cannot be
  isolated and validated, run the clean product-image preparation step and
  matte that output.
- `flatlay` / legacy `flat`: use the current cutout preparation mode, then
  alpha-matte the controlled background.
- `on_body`, `angled`, and unknown inputs: use the current image-to-image
  preparation mode to remove the person, hanger, and environment, then
  alpha-matte the controlled background.

This replaces the current client rule that skips all standardization work for
`web` / `product`. The web fast path remains cheaper because it attempts
matting before image editing.

### 5.2 Alpha-matting boundary

Introduce an `AlphaMatteProcessor` behind the model-service vision boundary.
Its first implementation uses Pillow and a border-connected background mask:

1. Decode the input with hard limits on byte size and pixel count.
2. Convert the image to RGBA.
3. Seed the background mask from near-white pixels connected to the canvas
   border.
4. Flood only the connected background; never replace every white pixel in
   the image, because that would erase white garments and printed details.
5. Feather the foreground boundary into a soft alpha edge to avoid white or
   dark halos.
6. Preserve the source canvas aspect ratio, cap the longest edge at 1600 px,
   and encode an optimized PNG.

The processor rejects compressed inputs above 20 MiB, images above 16
megapixels, and encoded PNG outputs above 8 MiB. The App rejects a returned
data URI above 12 MiB before decoding it. These limits bound memory use and
JSON response size on the current model-service deployment.

The controlled product-image preparation prompt must request a uniform white
background with no cast shadow or floor. That makes the deterministic matting
step predictable while keeping white garment pixels protected by connectivity.

Adding Pillow changes the canonical model service from a zero-pip-dependency
service. The canonical `fitzw/style-model` repository must add a pinned runtime
dependency and install it in its Docker image. The App repository's vendored
`model-service/` copy must then be synchronized and checked with
`scripts/check-model-service-sync.sh`.

### 5.3 Alpha validation

A result is successful only when all checks pass:

- decoded content is PNG with an alpha channel;
- at least 5% of pixels are transparent (`alpha <= 16`);
- at least 5% of pixels contain a visible subject (`alpha >= 32`);
- at least 90% of canvas-border pixels are transparent;
- the visible-subject bounding box is non-empty;
- the existing visual verifier reports no category or main-color drift.

These thresholds are named server constants so tests can cover them and a
future quality evaluation can tune them. A result that still contains a white
canvas, loses the subject, or drifts visually must have `verified: false`.

### 5.4 Service response contract

Keep the existing `/standardize` response shape compatible and extend it:

```json
{
  "image_ref": "data:image/png;base64,<png-bytes>",
  "mime": "image/png",
  "method": "direct_matte | cutout_alpha | img2img_alpha | cropped_fallback",
  "verified": true,
  "background": "transparent",
  "alpha_verified": true,
  "provider": "direct | qwen-image-edit",
  "matte_provider": "pillow-border-connected-v1",
  "failure_stage": null
}
```

On success, `image_ref` is a bounded PNG data URI so the service does not need
Supabase service-role credentials or another temporary public asset store. The
App uploads it immediately to the existing `wardrobe-images` bucket. On
failure, the service may keep the current fallback reference for diagnostics,
but `verified` and `alpha_verified` are false and the App must not persist that
reference as a standardized image. `failure_stage` contains the first failed
stage on an unsuccessful response and is `null` on success.

The App accepts a standardized result only when all of these are true:

- `verified === true`;
- `alpha_verified === true`;
- `background === "transparent"`;
- `mime === "image/png"`;
- `image_ref` is a valid bounded PNG data URI.

Provider HTTP URLs remain readable for backward compatibility, but they are
not accepted as successful output from the new transparent contract unless
the response also supplies the new verification fields.

### 5.5 Persistence and compatibility

- Continue storing the final Supabase public URL in `wardrobe_items.image_url`.
- Upload with `.png` and `image/png`.
- Keep the original source URL in `ai_recognized_attrs.original_image_url`.
- Record `standardization`, `standardization_ok`,
  `transparent_background`, `alpha_verified`, `photo_type`, and the failure
  stage in `ai_recognized_attrs`.
- Do not add a database column or run a data migration; the existing JSONB
  metadata field is sufficient.
- Do not reprocess existing records. All untouched historical `image_url`
  values continue to render as before.

The transparent-output invariant applies to future `/standardize` calls,
including new-item imports and a replacement photo chosen later for an
existing item. Merely viewing or editing metadata on an existing item never
reprocesses its stored image.

## 6. UI scene backgrounds

Transparent garment assets are rendered by a shared garment-media contract.
The component owns a closed set of semantic background variants instead of a
raw color prop. The initial variants are:

- `neutral`: default wardrobe list and detail media surface;
- `owned`: an owned item inside an outfit or selection flow;
- `recommended`: a missing or recommended item that needs visual distinction;
- `inverse`: a deliberately dark scene used to check light garments and edge
  quality.

Each variant maps to existing Design System v3.8 semantic tokens. Feature
screens select a variant; they do not pass Hex/RGB/HSL values. When a scene
does not specify a variant, the component uses `neutral`.

`StyleeWardrobeCard`, outfit item media, and selection/try-on thumbnails should
consume this shared contract rather than implement page-local background
rules. The garment image remains `contain` so the current wardrobe density and
full-garment visibility do not change.

No background choice is stored on the wardrobe item. Changing a scene mapping
therefore changes presentation only and never rewrites an image or database
record.

## 7. Failure behavior

- Image edit, download, decode, matting, alpha validation, visual verification,
  or upload failure makes standardization unsuccessful.
- The App falls back to the original source image so the garment can still be
  imported.
- The App shows: `透明主图生成失败，已保留原图`.
- A failed result must not show `标准化完成` and must not store a white
  generated image as the main image.
- Failure metadata records the stage and request ID when available.
- No automatic background retry queue or manual retry button is added in this
  release.

## 8. Testing and acceptance

### 8.1 Offline model-service tests

- Unit-test border-connected masking so white garments and internal white
  patterns remain visible.
- Test PNG alpha encoding, size limits, corrupt input, excessive pixel count,
  and non-image responses.
- Test each alpha-validation condition independently.
- Test `web` direct-matte success, `web` fallback-to-edit, `flatlay` cutout,
  and `on_body` image-to-image routing.
- Test the extended adapter and `/standardize` response contract.
- Test every failure stage returns `verified: false` and never returns a white
  asset as a verified result.

### 8.2 App tests

- Test response acceptance rejects legacy white-background success responses,
  missing alpha metadata, malformed data URIs, and unverified outputs.
- Test the upload helper preserves `.png` and `image/png` for data URIs.
- Test successful imports persist the transparent Supabase URL and new JSONB
  metadata.
- Test failures persist the original image and expose the correct user message.
- Test the `web` / `product` policy no longer skips transparent processing.
- Test scene variants map only to Design System semantic tokens and default to
  `neutral`.

### 8.3 Quality fixtures and manual checks

Use representative flatlay, on-body, angled, web-product, and multi-item source
photos, including:

- white and near-white garments;
- black and other dark garments;
- complex prints and gradients;
- lace, mesh, holes, straps, cuffs, and collars;
- soft shadows and visually busy original backgrounds.

For every accepted transparent master, inspect the same PNG on neutral, dark,
and accent-like semantic backgrounds. It must have no white canvas, obvious
white/black halo, missing garment regions, or material/color drift.

Check the wardrobe, detail, outfit result, selection, and try-on-thumbnail
contexts at 320, 375, 393, 430, and 768 pt widths. The existing two-column
wardrobe density and `contain` geometry must remain unchanged.

### 8.4 Required verification commands

Canonical model service:

```bash
for t in test_*.py; do python3 "$t"; done
```

App repository after synchronizing the vendored service:

```bash
./scripts/check-model-service-sync.sh /path/to/style-model
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

The final implementation also requires a real-service smoke test using at
least one white garment and one patterned garment. Secrets remain server-side,
and the smoke output must not print image data URIs or credentials.

## 9. Release and observability

- Keep the existing request ID across recognition, standardization, and App
  logs.
- Add distinct stages for source-image download, alpha matting, alpha
  validation, and PNG encoding to `trace.stage_ms`.
- Record the standardization method and failure stage in the existing import
  analytics metadata; never record image bytes or data URIs.
- Deploy the canonical model service first, validate the extended response,
  then release the App client that requires the transparent contract.
- Because the App rejects results without the new alpha verification fields,
  an older service safely falls back to the original image instead of storing
  a white-background result.

## 10. Acceptance summary

The feature is complete when a new import that passes standardization stores
one transparent PNG in Supabase, renders that same asset on multiple semantic
scene backgrounds, preserves garment fidelity, and never treats a white canvas
as successful. Failed processing remains non-blocking and uses the original
image with an explicit failure message. Existing wardrobe images are not
modified.
