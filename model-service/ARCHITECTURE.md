# Stylee Model Service architecture

Status: accepted. `fitzw/style-model` is the canonical implementation; the
`stylee_mvp_v2/model-service` directory is a vendored integration copy.

## 1. Decision and trust boundary

All clothing recognition, image standardization, outfit recommendation and
model-backed helper features go through this service. The App/Web bundle never
calls DeepSeek or DashScope directly and never receives provider credentials.

```text
App / Web
  | Supabase user access token
  | HTTPS + JSON
  v
Stylee model service
  |-- verifies the user with Supabase Auth
  |-- applies exact-origin CORS, body-size and per-subject rate limits
  |-- runs deterministic constraints, RAG, validation and scoring
  |-- calls DeepSeek / DashScope with server-only keys
  v
Model providers + Supabase
```

The service is a security boundary, not only a convenience proxy. A public Web
deployment therefore requires a public HTTPS service URL. `localhost` is only
valid for local development: a user's browser cannot reach a server running on
the developer's machine, and an HTTPS page cannot safely depend on an HTTP API.

## 2. Request and identity flow

1. The client signs in through Supabase and receives a user access token.
2. The client sends `Authorization: Bearer <user-access-token>` to the service.
3. `TokenVerifier` validates the token through Supabase Auth and caches the
   resulting user id for 60 seconds.
4. The service rate-limits every model request by user id.
5. The HTTP adapter converts App payloads into the model contracts.
6. The model pipeline invokes providers with server-only environment variables.
7. Deterministic validation and scoring reject invalid model output before the
   response reaches the client.

Production controls:

- `STYLEE_REQUIRE_AUTH=true` is mandatory.
- `STYLEE_ALLOWED_ORIGINS` contains exact comma-separated origins; `*` is not
  used with credentials.
- `STYLEE_RATE_LIMIT_PER_MINUTE` defaults to 20 per user/source.
- `STYLEE_MAX_BODY_BYTES` defaults to 15 MiB.
- Provider errors are returned without provider credentials.
- Secret values must never be logged, committed or included in client builds.

## 3. Model capability routing

| Capability | HTTP endpoint | Pipeline/model |
|---|---|---|
| Clothing recognition | `POST /recognize`, `/recognize-multi` | DashScope Qwen VL |
| Transparent garment master | `POST /standardize` | WEB direct alpha matte fast path, otherwise Qwen Image Edit preparation + Pillow alpha matte + visual verification |
| Outfit recommendation | `POST /recommend` | B0-B6 constraints/RAG + DeepSeek |
| Intent and reasons | `POST /intent`, `/reason` | DeepSeek |
| Product extraction | `POST /product-extract` | DeepSeek |
| Try-on helpers | `POST /tryon-suggestion`, `/tryon-image` | DeepSeek / DashScope |

The recommendation path keeps deterministic work in code:

```text
B0 intent -> B1 constraint filter -> B2 RAG examples -> B3 model generation
          -> B4 hard validation/soft scoring -> B5 diversity/ranking
```

DeepSeek Flash is the default for B0 and B3. `LLM_MAX_TOKENS=2048` caps the
default response cost. A more expensive generation model is an explicit,
measured configuration change, not a client choice.

When the service has no provider key, local development may use mock providers
and keyword RAG. When production service calls fail, the App may fall back to
mock/predefined UX, but it must never fall back to calling a provider directly.

## 4. Secret and configuration ownership

Server-only variables:

```text
DEEPSEEK_API_KEY
DASHSCOPE_API_KEY
```

Service configuration:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
STYLEE_ALLOWED_ORIGINS
STYLEE_REQUIRE_AUTH=true
STYLEE_RATE_LIMIT_PER_MINUTE=20
LLM_MAX_TOKENS=2048
```

The Supabase URL and publishable key are the same public authentication
configuration already present in the App. The model service uses them only to
validate access tokens through Supabase Auth; it does not manage users or read
Stylee profile/wardrobe tables. Registration remains in the App's existing
Supabase Auth boundary, with a database trigger creating the profile row. The
model service must never receive a Supabase secret/service-role key.

### Clothing import contract

The App imports a garment through one controlled path:

```text
local image -> /recognize-multi -> normalized attributes + photo_type
            -> /standardize -> transparent PNG alpha validation -> bounded VL verification
            -> App copies the verified transparent PNG to Supabase Storage
            -> wardrobe_items + ai_recognized_attrs
```

`photo_type` uses `flatlay|on_body|web|angled`; legacy `flat` and `product`
aliases are normalized at both HTTP boundaries. Unknown values use `on_body`
and set `needs_review`, rather than incorrectly selecting the destructive
cutout path. Multi-item recognition returns a deterministic completeness
confidence and review flag; the App persists these with style/photo metadata
in `ai_recognized_attrs` and persists sleeve length in its typed column.

The canonical `/standardize` success contract is a transparent PNG data URI:
`mime=image/png`, `background=transparent`, `alpha_verified=true`, and
`verified=true`. The complete response fields are `image_ref`, `mime`, `method`,
`verified`, `background`, `alpha_verified`, `matte_provider`, and
`failure_stage`; `server.py` additionally assigns `provider` and `trace`.

Routing is fixed. `web` first attempts alpha matte directly and only falls back
to `img2img` preparation plus matte if direct processing fails. `flatlay` uses
`cutout` preparation plus matte; `on_body`, `angled`, and unknown normalized
types use `img2img` preparation plus matte. Visual verification always receives
the transparent data URI, never the white preparation output. Only successful
alpha validation with no visual drift sets `verified=true`. Terminal failure
returns the original `image_ref`, `method=cropped_fallback`, both verification
flags false, and the first failed stage; a white preparation image is never a
successful response.

Pillow 12.3.0 is installed from `requirements.txt`. Alpha processing accepts
only base64 PNG/JPEG data URIs or HTTP(S) references. Encoded input is limited
to 20 MiB, decoded input to 16,000,000 pixels, processing to a 1600-pixel longest
edge, and encoded PNG output to 8 MiB. Alpha validation requires at least 5%
pixels with alpha <=16, at least 5% with alpha >=32, at least 90% transparent
border pixels, and a non-empty visible bounding box. The four processing trace
stages are `A2.source_image_download`, `A2.alpha_matte`, `A2.png_encode`, and
`A2.alpha_validate`; `A2.image_edit` and `A2.visual_verify` appear when those
route steps run. Traces and logs include provider names and timings, never image
references, secrets, image bytes, or data URIs.

The App must copy the verified transparent PNG to its own Storage bucket before
inserting the wardrobe row. If that copy fails, it uploads the original image;
if the original upload also fails, the
insert is stopped so a device-local or expiring URL is never stored.

Routes that require preparation are sequential. Production defaults bound
image edit to 60s (`IMG_EDIT_TIMEOUT_SECONDS`) and verification to 20s
(`VL_VERIFY_TIMEOUT_SECONDS`); the App request deadline is 90s.

The client receives only:

```text
EXPO_PUBLIC_STYLEE_API=https://<model-service-host>
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Anything prefixed `EXPO_PUBLIC_` is considered public. A provider key or
Supabase secret/service-role key must never use that prefix.

API usage monitoring is a separate, optional data sink. It uses
`STYLEE_SUPABASE_URL` / `STYLEE_SUPABASE_KEY`, never the authentication variables
above. If they are unset, usage is printed locally and no remote monitoring
request is made; the service must not contain a hard-coded monitoring project.

## 5. Gamma direct-model experiment

Gamma is an opt-in path beside the production B0-B6/RAG engine. It keeps the
same security boundary—the App sends an authenticated request to model-service
and provider keys remain server-side—but intentionally removes intermediate
retrieval, candidate ranking and visual verification:

```text
Gamma import: image -> one Qwen VL recognition -> one Qwen image edit
Gamma outfit: instruction + wardrobe -> one DeepSeek JSON completion
                                      -> parallel Qwen images for recommended gaps
Gamma try-on: body photo + outfit + scene -> one Qwen multi-image edit
```

The HTTP contracts are `POST /gamma/import`, `POST /gamma/outfit` and
`POST /gamma/tryon`. Outfit
actions are `generate`, `replace_item` and `replace_all`; replacement requests
carry the previous outfit so the model can preserve or replace the correct
scope. Existing wardrobe items retain their real `item_id` and image. Only
newly recommended items trigger image generation.

Gamma try-on uses the body photo as image 1 and, within Qwen's three-input-image
limit, selects up to two garment images by visual importance. Every outfit item
is also included in the text instruction. The service does not persist the body
photo; the authenticated request is forwarded directly to Qwen and only the
temporary generated image URL is returned.

Gamma does not replace or call the production pipeline. It has separate App
routes and can be disabled by removing its navigation entry without changing
the existing import or recommendation flows. Provider image URLs are still
temporary: the App copies any Gamma image into Stylee Storage before inserting
a wardrobe row. Partial failures are explicit: import can return recognized
attributes without a standardized image, and an outfit remains usable when one
of its generated item images fails.

Gamma uses the existing server-side `DEEPSEEK_API_KEY` and
`DASHSCOPE_API_KEY`. Optional model overrides are `GAMMA_TEXT_MODEL`,
`GAMMA_VL_MODEL`, `GAMMA_EDIT_MODEL`, `GAMMA_IMAGE_MODEL` and
`GAMMA_TRYON_MODEL`.

## 6. Runtime and deployment

The production artifact is the repository `Dockerfile`. It starts the stdlib
HTTP server on `0.0.0.0:$PORT`, exposes `/health`, and runs as a non-root user.
`render.yaml` describes the first supported deployment:

1. Render builds the canonical `style-model` repository as a Docker Web Service.
2. Secrets marked `sync: false` are entered in the Render Dashboard.
3. Render assigns `https://<service>.onrender.com`.
4. The App repository GitHub Variable `EXPO_PUBLIC_STYLEE_API` is set to that
   URL and the Web app is rebuilt.
5. `/health`, authenticated API calls and provider usage are smoke-tested before
   production traffic is enabled.

The Dockerfile is portable to another container host. Render is a deployment
choice, not an application dependency.

## 7. Repository ownership and synchronization

`fitzw/style-model` is the single source of truth for Python source, HTTP
contracts, provider adapters, deployment files and shared tests. The App repo
vendors the same files so local App/model integration works from one checkout.

Canonical-first change procedure:

1. Edit model behavior only in canonical `fitzw/style-model` and add or update
   its canonical tests.
2. Run canonical offline tests, the RAG manifest check, and the canonical CI
   Docker build before generating a mirror sync. This Mac does not have Docker;
   the canonical GitHub CI Docker-build job is therefore mandatory production
   image verification.
3. Generate the Stylee mirror from the tested canonical revision; never
   independently edit the mirror's model behavior, tests, deployment files, or
   governed RAG data.
4. Run all offline Python tests in both copies. From the App repo run
   `./scripts/check-model-service-sync.sh /path/to/style-model`.
5. Open linked PRs in both repositories and merge the canonical model PR first.
6. Re-run the sync check after rebasing either PR.

The deploy workflow uses the GitHub secret `RENDER_DEPLOY_HOOK_URL`; its value
is configured only in GitHub and is never committed or printed. Optional
automated authenticated smoke coverage may use dedicated
`STYLEE_SMOKE_ACCOUNT_EMAIL` and `STYLEE_SMOKE_ACCOUNT_PASSWORD` GitHub
secrets, also by name only.

The governed 3000-entry Garments2Look index artifact and its manifest are
versioned in canonical `style-model`; the raw source corpus remains excluded.
Keyword RAG fallback is runtime safety only: release validation requires the
governed artifact to be available. README text may be repository-specific, but
this architecture file and executable service surface must remain identical.

## 8. Rotation and incident response

If a model or Supabase secret is exposed:

1. Revoke it at the provider; deleting a GitHub variable is not revocation.
2. Create a per-environment replacement with spend caps and billing alerts.
3. Store it only in the deployment secret manager/local ignored `.env`.
4. Remove public build variables and redeploy both service and client.
5. Review usage, invoices and request/IP evidence for the exposure window.
6. Treat historical Git copies as permanently exposed unless history cleanup is
   coordinated; rotation is required regardless of cleanup.

## 9. Verification gates

Before merge or deployment:

- TypeScript typecheck and Expo Web production export pass.
- All offline model tests pass in both repositories.
- Vendored sync check passes.
- Built client assets contain no provider/service-role key names or values.
- Production `/health` passes over HTTPS.
- Production `/health` reports the exact CI-tested `main` SHA, the expected
  contract version, and an available RAG artifact before the App release moves.
- Authenticated recognition, standardization and recommendation smoke tests pass
  with newly rotated provider keys.
- Provider dashboards show expected model, token cap and request volume.
