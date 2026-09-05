# F02B-A2 Web account-scope candidate verification

Date: 2026-09-05. Status: local candidate source, **not production ADOPTED**.
The scoped Store/read target is FIXED in candidate source only. SEC-03 and
CF-10 remain OPEN. Web PR/Hosted CI and final independent whole-branch review
are pending controller work; no Web PR, push, merge, or deployment was performed
by this local task.

## Immutable source and candidate identity

- Fixed Web base: `7daf6f96a1cb4283aaf27789841b924fbd4c667a`.
- Tasks 1–8 implementation HEAD: `47cd2d2c14e8e6ba37e934c38aaa5a28e3886038`.
- Code/CI candidate HEAD verified here: `ea2c36ad2b52944e821428b2963b40b803f01cbe`.
  The subsequent documentation commit contains this record and README only;
  its full HEAD and repeated cold verification are recorded in the Task 9
  report. A document cannot embed its own containing commit hash.
- Core source: `fitzw/stymobile@5b9b51adfb1dc9c10c61f13244087f6ecf54d34d`.
  [A1 PR #4](https://github.com/fitzw/stymobile/pull/4) HEAD was
  `6990331e6bd47a469187d1c04720ce534d3d3bc6`; [merged main CI 33937689381](https://github.com/fitzw/stymobile/actions/runs/33937689381)
  passed `check` and `database`, as recorded by the controller's A1 readback.
  These historical Hosted results are not new A2 Hosted evidence.
- Toolchain: Node `22.22.1`, npm `11.12.1`; unchanged Web Expo SDK 54.
  The required [Expo v55 reference](https://docs.expo.dev/versions/v55.0.0/)
  was consulted; this task does not upgrade Expo.
- Canonical byte-level evidence: [provenance.json](../../vendor/stymobile/5b9b51adfb1dc9c10c61f13244087f6ecf54d34d/provenance.json).

| Artifact | Version | SHA-256 | Source package.json SHA-256 |
| --- | --- | --- | --- |
| @stymobile/contracts | 0.1.0 | `79745ee0ac9d8adf9272760d9c1203cf6f2e8c01669ea3081d2838db76738194` | `bb6d62b0b70ea3833cc55cd804b70619386a4853cb2ca37b7f24d2f35b1736ee` |
| @stymobile/core | 0.1.0 | `daa7a7dc4e2bd60e251bba6bc9f1e284b939c77ec3c715690ced92cfcd551b2b` | `3928ae3308e90084c3e60a73d55bc27d3a1c83bc728cf87caa2c70de91753492` |

Contracts npm integrity:
`sha512-FXZZJS39EbDqyFlXsLQ1QKW4P58zNwUJXoDoCd8QfHstpY5hMrG6xQccrqFs+Ifyl5/CFBTO4lqEMBi52mG7sA==`.
Core npm integrity:
`sha512-StrUUyaoHCTblQ73bwazeZSxAzi3uBa6E0Fysyz+k7WlubI8sqbdBFdYwKaQNRaUomjDArtW0N7sR0l21XqbkQ==`.

Exact contracts six-file pack list (including both command-result files):

```text
README.md
dist/command-result.d.ts
dist/command-result.js
dist/index.d.ts
dist/index.js
package.json
```

Exact Core twelve-file pack list:

```text
README.md
dist/account-scope.d.ts
dist/account-scope.js
dist/entity-revision.d.ts
dist/entity-revision.js
dist/index.d.ts
dist/index.js
dist/scoped-command.d.ts
dist/scoped-command.js
dist/scoped-read.d.ts
dist/scoped-read.js
package.json
```

## Historical RED/GREEN evidence, Tasks 1–8

The counts below are from each task's contemporaneous report, not claimed as
new runs on the final branch. `npm run test:account-scope` means the script at
that task's commit; its membership grew during implementation. Missing-module
RED is distinguished from executed behavioral regressions. Strict TypeScript
also ran for every task; the three `*.type-test.ts` files are compile-only.

| Task / commit | RED command and observation | GREEN command and count |
| --- | --- | --- |
| 1 `26325aa` | `node --test scripts/stymobile-vendor-contract.test.mjs`: missing contract module, exit 1 | `npm run test:vendor`: 5/5; `npm run vendor:check`, `npm run check`, placeholder `npm run build:web`: pass |
| 1 review `8d4f655` | `node --test --test-name-pattern="rejects an injected dependency" scripts/stymobile-vendor-contract.test.mjs`: Missing expected rejection | Same focused command 1/1; `npm run test:vendor` 6/6, `vendor:check`, `check`: pass |
| 2 `7bf4bfc` | `npm run test:account-scope` and `npx tsc --noEmit`: absent runtime/reset modules | Same runtime script 6/6; TypeScript, `check`, vendor 6/6 and verifier: pass |
| 3 `9c0e5ec` | `npm run test:account-scope` and `npx tsc --noEmit`: absent scoped read runner; previous six runtime cases pass | Runtime 13/13; TypeScript and vendor verifier: pass |
| 4 `05791a9` | `npm run test:account-scope` and `npx tsc --noEmit`: absent coordinator; prior cases pass | Runtime 27/27 (14 coordinator cases), focused marker-boundary test 1/1; TypeScript: pass |
| 5 `e15040f` | `npm run test:account-scope`: absent profile cache; loadable cases pass | Runtime 36/36; TypeScript and reset/hydration source gates: pass |
| 6 `219de4f` | `npm run test:account-scope`: missing storeReadPolicy, then missing temporary routeGenderCompatibility | Focused policy 6/6 and temporary compatibility 3/3; total 45/45; TypeScript/verifier/build: pass |
| 6 review `5f3f053` | Focused `wardrobeScopedRead.test.ts` Node run: missing scoped wardrobe helper | Focused 3/3, runtime 48/48; TypeScript/verifier/build: pass |
| 6 review `5138548` | Actual Store loader test with temporary early-overlay capture mutation: expected new edit, got old overlay, exit 1 | Restored actual Store 2/2; `test:account-scope` 48 pure + 2 Store; TypeScript/verifier/build: pass |
| 7 `a87397c` | `npm run test:account-scope`: missing secondary helper; actual Store suite before wiring: 7 expected failures, 1 independence control pass | Focused pure 7/7; final 55 pure + 13 actual Store; TypeScript, vendor 6/6, verifier, build: pass |
| 8 `47cd2d2` | Node effect/login tests: 2 missing-module failures; later coordinator/effect regression: 6 failures for route-intent identity | New effect/login 32/32; corrected coordinator/effect 37/37; final `test:account-scope` 90 pure + 13 Store; TypeScript, vendor 6/6, verifier/build: pass |

Focused Node commands use `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
--experimental-strip-types --test` followed by the named `src/lib/*.test.ts`.
Actual Store commands additionally use
`--import ./src/lib/test-fixtures/wardrobeStore/register.mjs` and the named
`wardrobeStore.integration.test.ts` / `secondaryStores.integration.test.ts`.

Task 7 mutation RED counts: shared try-on slots 2; omitted wishlist account
match 1; omitted try-on reset cancellation 1; omitted wishlist/outfit reset
cancellation and favorite-query error handling 3. Task 8 mutation RED counts:
post-gender eligibility removed 2; final pre-route stamp removed 2; preview
entry gate removed 1; retry every login error 9; ignore effect validator 3;
let `none` replace route intent 2; omit effect identity comparison 6. All
mutations were restored before GREEN and commit. Temporary route-gender
compatibility and `setSession` were removed in Task 8.

## What the tests establish

- A→B and signout→A invalidate earlier stamps; all eight synchronous resetters
  run while capture is anonymous, before publishing the next session. Reset
  failure runs remaining resetters, blocks the scope, and never publishes B.
- Listener-first/fallback-first deduplicate bootstrap; stale fallback is
  ignored. Boot-time refresh followed by INITIAL_SESSION loads once.
  Same-account token refresh preserves eligible pending reads.
- Stale success, error, and finally cannot overwrite B state or clear B's
  loading. Identity-based latest-read leases reject old same-account reads.
  Wardrobe reads consume current overlays only in eligible synchronous apply.
- Real Zustand wardrobe, wishlist, outfit-count and try-on actions are invoked
  through synthetic boundary fixtures; Supabase and network modules are not
  loaded. Try-on record/selfie slots remain independent and reset cancels them.
- Profile keys are account-specific. Root owns Auth publication/routing;
  synchronous Auth callbacks only reduce and schedule. Deferred route work
  checks account, preview, active lifetime and exact coordinator effect identity.
  Same-epoch recovery supersedes an older pending load without token refresh
  cancelling valid work.
- Login uses encoded-first credential fallback only, with generic credential
  errors. The obsolete anonymous users/profile lookup is removed.

This is pure, synthetic integration, type and build evidence. It does not
prove a live authenticated browser session or production RLS behavior.

## Task 9 gates and reproducible cold checks

Task 9 `node --test scripts/consumer-control.test.mjs` first failed 4/4:
missing consumer script/workflow, deploy Node 20, and missing npm selection.
After implementation it passed 4/4, including executing the actual consumer
script with failing command boundaries to prove short-circuit behavior.

The controller ruling recorded in control commit `699559b` keeps all
review-required tests: `test:account-scope` has 90 pure cases,
`test:account-scope-integration` has 13 real Store cases, and `check:consumer`
runs vendor tests, verifier, then both scripts. Root `check`, PR CI and deploy
preflight therefore all retain the same coverage. No compile-only test is run
as JavaScript.

The new PR/main workflow uses read-only contents permission, the stymobile
checkout/setup-node SHA pins, exact Node 22.22.1/npm 11.12.1, ignored install
scripts, full check and placeholder Web export. It has no production
environment, deployment step or secret reference. Existing deploy target,
action and secrets are preserved; its consumer check precedes deploy-env
validation. Existing design checks are preserved with npm 11.12.1 selection.

Clean local clone verification, candidate `ea2c36ad2b52944e821428b2963b40b803f01cbe`:

```bash
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache "$TASK_CACHE"
npm run test:consumer-control
npm run check
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=public-anon-placeholder \
EXPO_PUBLIC_STYLEE_API=https://example.com npm run build:web
git diff --check 7daf6f96a1cb4283aaf27789841b924fbd4c667a..HEAD
if git ls-files | rg '(^|/)(\.env($|\.)|[^/]+\.(p8|p12|mobileprovision)$)' | rg -v '(^|/)\.env\.example$'; then exit 1; fi
```

`TASK_CACHE` is a dedicated temporary cache prepared from local cached npm
content. No original checkout node_modules or env file is copied. The first
default-registry attempt failed with `ENOTFOUND bnpm.byted.org`; explicit
public-registry retry installed 753 packages successfully. This is an
environment correction, not a changed lockfile or a passing first attempt.

A second clean copy ran `npm ci --ignore-scripts --offline --no-audit --no-fund`
with that cache: 753 packages installed, `vendor:check` passed, account 90/90
and integration 13/13 passed. The verifier also creates its own fresh offline
two-package consumer with allowlisted environment, empty separate user/global
npm configs and no registry/GitHub credential, and tests real runtime plus
TypeScript 5.8 declarations with `skipLibCheck: false`.

Warnings are retained: npm deprecations for `inflight@1.0.6`, `rimraf@3.0.2`,
`glob@7.2.3` (repeated transitive copies), and `uuid@7.0.3`; the existing Web
export `NO_COLOR` ignored due to `FORCE_COLOR` warning is separate. Passing
checks do not mean warning-free or an audit-clean dependency tree.

## Residual inventory and release boundary

Page-local private reads remain in `src/app/(tabs)/record.tsx`,
`src/app/outfit/[id].tsx`, `src/app/outfit/try-on.tsx`,
`src/app/wardrobe/[id].tsx`, and `src/components/ItemOutfits.tsx`.
Residual writes include profile/gender, wardrobe edits/deletes/import,
wishlist add/remove/move, favorite/outfit saves and try-on generation/archive.
Style-page global `tags.upsert` is explicitly assigned to F02B-B after taxonomy
compatibility; it was not silently removed or made compatible here.

| Finding | Unfinished semantics |
| --- | --- |
| CF-02 | In-memory edit/delete false success presented as offline capability |
| CF-03 | Non-atomic outfit save |
| CF-05 | Saved/favorite state not bound to outfit and revision |
| CF-06 | Partial wishlist-to-wardrobe retry can duplicate insertion |
| CF-07 | Separate favorite-page logic ignores errors |
| CF-08 | Try-on generation, durable asset and archive states conflated |
| CF-09 | Import lacks process-death recovery and stage checkpoints |
| CF-10 | Same-account old fetch versus later edit needs entity revision/write adoption |

SEC-03/CF-10 remain OPEN. Latest read slots do not implement entity revisions.
There was no production Supabase access, real session, Web deployment,
registry publication, Mobile real business, EAS, Apple signing, TestFlight or
App Store action. Local stymobile synthetic DB reset/tests are distinct from
production. No generated model-service mirror files changed.

Before production, rollback is reverting the single eventual Web PR as a
unit: package manifest/lockfile, vendor pair/provenance and all adapters.
That restores the known account-isolation risk. A later production rollback
requires disabling private routes or an immediate forward fix; reverting does
not make the risk disappear. Merging Web main triggers GitHub Pages production
deployment and requires the separate release authorization.

## Changed-file and cleanliness evidence

The exact branch file list follows; Task 9 adds the verification document and
README to the code candidate list. Tracked env/signing-file scan found no
matches other than the excluded `.env.example`. The original dirty checkout's
`git status --short --branch` equals the controller preflight text byte for
byte. Caveat: the comparison file was transcribed during Task 9 from the
controller's earlier output; the file itself did not predate implementation.

```text
.github/workflows/consumer-control.yml
.github/workflows/deploy-web.yml
.github/workflows/design-system.yml
README.md
docs/quality/2026-09-05-f02b-a2-account-scope-verification.md
package-lock.json
package.json
scripts/consumer-control.test.mjs
scripts/stymobile-vendor-contract.mjs
scripts/stymobile-vendor-contract.test.mjs
scripts/verify-stymobile-vendor.mjs
src/app/(auth)/login.tsx
src/app/_layout.tsx
src/lib/accountScopeRuntime.test.ts
src/lib/accountScopeRuntime.ts
src/lib/accountScopeRuntime.type-test.ts
src/lib/authEffectRunner.test.ts
src/lib/authEffectRunner.ts
src/lib/authSessionCoordinator.test.ts
src/lib/authSessionCoordinator.ts
src/lib/authSessionCoordinator.type-test.ts
src/lib/loginAuthFlow.test.ts
src/lib/loginAuthFlow.ts
src/lib/privateStateReset.test.ts
src/lib/privateStateReset.ts
src/lib/profileCache.test.ts
src/lib/profileCache.ts
src/lib/scopedStoreRead.test.ts
src/lib/scopedStoreRead.ts
src/lib/scopedStoreRead.type-test.ts
src/lib/secondaryStoreReads.test.ts
src/lib/secondaryStoreReads.ts
src/lib/secondaryStores.integration.test.ts
src/lib/storeReadPolicy.test.ts
src/lib/storeReadPolicy.ts
src/lib/test-fixtures/wardrobeStore/bodyModelFixture.ts
src/lib/test-fixtures/wardrobeStore/loader.mjs
src/lib/test-fixtures/wardrobeStore/reactNativeFixture.ts
src/lib/test-fixtures/wardrobeStore/register.mjs
src/lib/test-fixtures/wardrobeStore/supabaseFixture.ts
src/lib/test-fixtures/wardrobeStore/typesFixture.ts
src/lib/wardrobeScopedRead.test.ts
src/lib/wardrobeScopedRead.ts
src/lib/wardrobeStore.integration.test.ts
src/lib/webAuthRuntime.ts
src/lib/webPrivateResetters.ts
src/stores/importStore.ts
src/stores/outfitStore.ts
src/stores/preferenceStore.ts
src/stores/tryonStore.ts
src/stores/userStore.ts
src/stores/wardrobeStore.ts
src/stores/wishlistStore.ts
vendor/stymobile/5b9b51adfb1dc9c10c61f13244087f6ecf54d34d/provenance.json
vendor/stymobile/5b9b51adfb1dc9c10c61f13244087f6ecf54d34d/stymobile-contracts-0.1.0.tgz
vendor/stymobile/5b9b51adfb1dc9c10c61f13244087f6ecf54d34d/stymobile-core-0.1.0.tgz
```

Cold results: all commands above exited 0 after the explicit registry retry;
CI guards 4/4, vendor 6/6, pure 90/90, actual Store 13/13, token/design/density
and TypeScript checks passed. Web export bundled 970 modules to
`entry-e0db09b0b832b900672b4d5155e81705.js`; HTML/lang/font/shell/404 patch passed.
Diff whitespace and tracked secret/signing filename scans passed. The cold
checkout remained tracked-clean.
