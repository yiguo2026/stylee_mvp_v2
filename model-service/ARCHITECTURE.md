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
4. The service rate-limits by user id. `/register` is the only unauthenticated
   mutation and is rate-limited by source address.
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
| Image standardization | `POST /standardize` | DashScope Qwen Image Edit + visual verification |
| Outfit recommendation | `POST /recommend` | B0-B6 constraints/RAG + DeepSeek |
| Intent and reasons | `POST /intent`, `/reason` | DeepSeek |
| Product extraction | `POST /product-extract` | DeepSeek |
| Try-on helpers | `POST /tryon-suggestion`, `/tryon-image` | DeepSeek / DashScope |
| Server-side registration | `POST /register` | Supabase Admin API |

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
SUPABASE_SECRET_KEY
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

The Supabase publishable key is not a provider secret, but it remains service
configuration because the service uses it to validate user tokens. The
`sb_secret_...` key is used only in the `apikey` header for Supabase Admin/REST
calls and is never sent as a Bearer token. Legacy anon/service-role names remain
temporarily compatible for migration only.

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

## 5. Runtime and deployment

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

## 6. Repository ownership and synchronization

`fitzw/style-model` is the single source of truth for Python source, HTTP
contracts, provider adapters, deployment files and shared tests. The App repo
vendors the same files so local App/model integration works from one checkout.

Change procedure:

1. Implement or mirror the change in both repositories in the same work item.
2. Run all offline Python tests in both copies.
3. From the App repo run
   `./scripts/check-model-service-sync.sh /path/to/style-model`.
4. Open linked PRs in both repositories and merge the canonical model PR first.
5. Re-run the sync check after rebasing either PR.

The App copy intentionally adds generated Garments2Look index files. Canonical
`style-model` does not commit large generated data; it falls back to keyword RAG
until an index is built or fetched from controlled artifact storage. README text
may be repository-specific, but this architecture file and executable service
surface must remain identical.

## 7. Rotation and incident response

If a model or Supabase secret is exposed:

1. Revoke it at the provider; deleting a GitHub variable is not revocation.
2. Create a per-environment replacement with spend caps and billing alerts.
3. Store it only in the deployment secret manager/local ignored `.env`.
4. Remove public build variables and redeploy both service and client.
5. Review usage, invoices and request/IP evidence for the exposure window.
6. Treat historical Git copies as permanently exposed unless history cleanup is
   coordinated; rotation is required regardless of cleanup.

## 8. Verification gates

Before merge or deployment:

- TypeScript typecheck and Expo Web production export pass.
- All offline model tests pass in both repositories.
- Vendored sync check passes.
- Built client assets contain no provider/service-role key names or values.
- Production `/health` passes over HTTPS.
- Authenticated recognition, standardization and recommendation smoke tests pass
  with newly rotated provider keys.
- Provider dashboards show expected model, token cap and request volume.
