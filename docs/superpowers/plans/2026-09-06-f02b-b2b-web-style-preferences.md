# F02B-B2B Web versioned style-preference consumer implementation plan

> Date: 2026-09-06. Status: implementation-ready plan on stacked branch `codex/f02b-b2-web-preferences`; no Web code change yet.
> Base is the exact reviewed F02B-A2 candidate `ee422ef761019ea69b7eb41c96e4cbb8c2a2421c` / tree `2e575d745e7f51b3e3b8f23cefad369fbedbfa11`, not the dirty root checkout and not Web `main`.

**Goal:** replace the two legacy Web style-preference write paths with the reviewed shared versioned controller/RPC, make the confirmed controller snapshot the only Web preference source for editing, profile summary and recommendation model input, and deliver a stacked Draft PR with immutable package provenance and no production/deployment action.

**Architecture:** the merged stymobile contracts/core/api-client packages remain the platform-independent authority. Web adds only a browser pending-operation store, crypto UUID provider, Supabase client binding, React composition and navigation. One retained controller is reset by the existing `AccountScope` registry before a replacement account is published. Both routes render one shared feature screen; recommendation reads only confirmed `snapshot.server.selected[].modelValue`. There is no client-side taxonomy write and no delete-all/per-row preference write.

**Technology boundary:** current Web remains Expo SDK 54 / React Native Web; this slice does not upgrade it. The repository-required [Expo SDK 55 reference](https://docs.expo.dev/versions/v55.0.0/) was re-read on 2026-09-06: SDK 55 targets React Native 0.83 / React 19.2 / React Native Web 0.21 and minimum Node 20.19, but those upgrade differences are outside this stacked consumer. Node stays `22.22.1`, npm stays `11.12.1`.

---

## 1. Fixed inputs and non-negotiable boundaries

### 1.1 Web source and stacked PR

- Web repository: `https://github.com/yiguo2026/stylee_mvp_v2`.
- Live-read Draft PR #26: `https://github.com/yiguo2026/stylee_mvp_v2/pull/26`.
- Refreshed state at planning: `Draft / Open / CLEAN / MERGEABLE`, base `main@7daf6f96a1cb4283aaf27789841b924fbd4c667a`, head `codex/f02b-account-scope@ee422ef761019ea69b7eb41c96e4cbb8c2a2421c`.
- Existing successful checks: Design System Guard run `33956026014` / job `101279421557`; Shared Core Consumer run `33956026092` / job `101279421908`.
- B2B starts from exact `ee422ef` and opens a **Draft stacked PR whose base is `codex/f02b-account-scope`**. Do not retarget to `main` until PR #26 is separately authorized, merged and its resulting base is reconciled.
- Merging Web `main` triggers the production GitHub Pages workflow. This plan authorizes code, local validation, review, push and stacked Draft PR/CI only. It does **not** authorize merging either Web PR, deploying Web, or changing production.

### 1.2 Canonical merged package source

- stymobile PR: `https://github.com/fitzw/stymobile/pull/8`.
- PR head: `152ade1a4c278ab13a5718a7ea3726a8aadb7328`.
- merged `main` source: `a2c1342878aa5fcd1ad21651085d319bda19a3e1`.
- source tree: `03814cceb1084c94c33898d1e315c035a441d045`.
- post-merge CI: run `34028194565`, exact head `a2c1342`, conclusion `success`:
  - `check` job `101472836414` success;
  - `database` job `101472836301` success;
  - `local-auth` job `101472836382` success;
  - `preferences` job `101472836391` success.
- The final package values below were produced twice from `git archive a2c1342`, after a fully offline locked install and one build. Each A/B pair was byte-equal and prohibited paths were `0`. They were independently calculated before comparison with the earlier candidate.

| Package | Version / dependencies | Filename | size / unpacked / files | npm shasum | npm integrity | SHA-256 | source `package.json` SHA-256 |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `@stymobile/contracts` | `0.3.0` / `{}` | `stymobile-contracts-0.3.0.tgz` | `3828 / 11505 / 10` | `6e3938f2d63ffb1b132047ab5cc426b6e338134d` | `sha512-lb0Zrd8Z9A4qchX3zkeaBVTz500l18uhzhXS5mUHg37EKvooNSiYbQ3/n6ArGBiDeeO1PZhs3UIaFeJ7+UQs+w==` | `1749daf8244819cf25753c74c8fb00e4a3b1481153c86b66fb15107b33e0fd3e` | `8e535015bfa9788dfc1ce77e49309de7b244894cde9544aa7fa89f747c7d9e3c` |
| `@stymobile/core` | `0.3.0` / contracts `0.3.0` | `stymobile-core-0.3.0.tgz` | `4921 / 18086 / 14` | `4c5044289ad39e9294344bb4e8d4637f955e5871` | `sha512-bTr5m4dBv5LBQrnjycwUc6B2zapGaGIDbhJK6fG5WipQp/qyjjPVs4n2vI6DaR9Xf24Mjd7KjDtb/i6CjbuL6g==` | `d1f1ad8c765ad7e6143192778de96ec90ae26f56f9eaf755e907542732f341f7` | `3e318728aaaeaa3acb926810e084da032b22fc97e37dfcc132653eb4e23c1ded` |
| `@stymobile/api-client` | `0.2.1` / contracts+core `0.3.0` | `stymobile-api-client-0.2.1.tgz` | `19813 / 85875 / 28` | `c20e8bb6c6c987a6fe156e34277c350ed6e4e279` | `sha512-RfEZlJL7YUC5N9Wf5cn1Jb/Q2liEANkDUbSruUZUOlGTk9ICUrE+ocT4fBoGjmNl+Eao8hsTPAJOJsaOKY0PSg==` | `eb89413a29a011003dc6ca0637403d60c0c0191a0e63496ae374d50c9dd997cf` | `76096ee165fec8f081a2614f392465cd266e3a47556d3c2c4731c60481e8648f` |

Exact package file lists are fixed by Task 1 below and must be copied literally into provenance/tests. No placeholder SHA, hash, integrity or filename is allowed.

### 1.3 Product and data semantics

- Catalog is server-owned `stylee-style-v1`, exact 19 options/order/display/model values.
- UI expresses only positive selection. `selected` requires at least one active selection; zero selection is a distinct `skipped` command.
- Legacy selected tags are displayed and may be retained/removed, never guessed, renamed or newly invented by Web.
- A read failure may be bypassed for the current onboarding visit only; it is not a durable skip.
- A real `skipped` state is recorded only after the server confirms `controller.skip()`.
- Saving uses one operation. Unknown results query/retry the same operation. A revision conflict is read-only until explicit user confirmation creates a new operation.
- Query text remains primary. Confirmed preference `modelValue` strings supplement it; preferences never replace or rewrite the user's current Query.

### 1.4 Design source and visual boundary

- Canonical source: `design-tokens/stylee-v3.8.tokens.json`, metadata v3.8.1.
- Reuse existing `StyleeChoiceChip`, `StyleePageHeader`, `StyleeNavigationBar`, `StyleeButton`, `StyleeInlineStatus`, and `StyleeStickyDecisionBar`.
- No token/Figma change and no new visual direction. Do not copy the legacy 47% private cards/check bubble or add raw color/type/spacing/radius values.
- Selected options use the real Feather check icon as a visible non-color cue plus `accessibilityState.checked` from `StyleeChoiceChip`.
- Validate 320, 375, 393, 430 and 768 px Web viewports, default/selected/loading/read-error/save-error/confirming/conflict/legacy states, short height and keyboard focus. All controls remain at least 44 × 44 px by existing component contracts.
- Capture exact-base screenshots before deleting legacy screens using a disposable `ee422ef` copy with synthetic in-memory account data; never use production user data. Capture final screenshots at the same viewport/state. Compose baseline and final side-by-side, inspect the combined image, fix visible clipping/hierarchy/spacing/focus defects, then compare again. Screenshots alone are not a pass.

### 1.5 Explicit non-goals

- No production/hosted Supabase read or write, migration deploy, grants change or production data audit.
- No Web PR #26 merge, no B2B merge/deploy, no GitHub Pages production action.
- No B3 direct-DML enforcement migration. Old-bundle permission denial remains a B3/production-adoption gate because B1 intentionally preserves legacy DML.
- No registry publish; packages remain `private: true`, `UNLICENSED`, file-vendored.
- No Expo upgrade, native dependency/config/generated path, Android work, iPhone build, EAS/TestFlight, signing or App Store action.
- No notification, privacy/AI-consent, account-deletion, model/RAG, quota or unrelated 40-item finding change.

---

## 2. Baseline evidence

On exact stacked base `ee422ef`, before plan/code edits:

- `npm run check`: pass;
  - vendor tests `14/14` and two-package isolated consumer pass;
  - account-scope pure tests `115/115`;
  - actual Store integration `13/13`;
  - mounted RootLayout `7/7`;
  - tokens/design-system/wardrobe-density/TypeScript pass.
- `npm run build:web`: pass, `970 modules`, HTML patch complete.
- Existing warnings remain evidence, not failures: repeated shell startup `no oauth token found for github.com`, React test-renderer deprecation, and Expo `NO_COLOR`/`FORCE_COLOR` warning.

The legacy defects are present and must be proven by behavior/source guards before removal:

- `/onboarding/step2-style`: delete-all plus unchecked per-row upsert.
- `/profile/style`: ordinary client `tags.upsert`, delete-all plus per-row upsert.
- `userStore.fetchProfile`: raw `user_style_preferences` + `tags(*)` join and second preference state source.
- `outfit/result`: recommendation strings from raw `tag.tag_name`.
- both route files separately implement selection, write, error and layout logic.

---

## 3. Task sequence

Every task uses strict behavior RED → minimum GREEN, an exact task report under ignored `.superpowers/sdd/2026-09-06-f02b-b2b-web-style-preferences/`, a clean commit, task-scoped review and fixes for every valid Critical/Important before proceeding. Do not parallelize tasks that share files/interfaces.

### Task 1: Vendor the exact merged three-package set and strengthen provenance

**Files:**
- Create: `vendor/stymobile/a2c1342878aa5fcd1ad21651085d319bda19a3e1/provenance.json`
- Create binary artifacts in that directory: the three exact `.tgz` filenames above
- Modify: `package.json`, `package-lock.json`
- Modify: `scripts/stymobile-vendor-contract.mjs`
- Modify: `scripts/stymobile-vendor-contract.test.mjs`
- Modify if output text changes: `scripts/verify-stymobile-vendor.mjs`
- Preserve byte-for-byte: `vendor/stymobile/5b9b51adfb1dc9c10c61f13244087f6ecf54d34d/**`

**RED first:** update vendor tests to require source commit/tree, schema v2 provenance, exactly three active packages, exact versions/dependencies/hashes/integrities/sizes/unpacked sizes/file lists/source-manifest hashes, and a real isolated API-client runtime/type consumer. Require failures for missing API-client, SHA-1/SHA-256/integrity/size/unpacked/file-list/source-manifest/dependency drift, symlinks, unexpected nested `@stymobile/*`, wrong source/tree/toolchain and workspace/ancestor escapes. Run the tests before copying new artifacts; expected failure is missing/new-source mismatch, not syntax/module setup.

**Implementation:** regenerate the three files only from `git archive a2c1342` using the already-proven offline, empty-userconfig, task-cache procedure; compare the regenerated files with the frozen metadata before copying. Add new immutable directory; never edit/delete the old directory. Generalize verifier expectations per package instead of hard-coding every installed version to `0.1.0` or special-casing only Core. Verify raw tarball size/SHA-1/SHA-256/SHA-512, summed unpacked bytes, manifest hash, exact safe paths and exact dependencies. The isolated consumer must import all three package roots, compile with `skipLibCheck:false`, run a valid controller command and prove a noncanonical generated UUID returns fixed `preference_save_failed` with zero pending write/replace/query.

Update root dependencies to exact file URLs under the new merge SHA and add API-client. Regenerate lock metadata with npm `11.12.1`; inspect that only the three intended stymobile dependency/install records change. No registry package or unrelated integrity may drift.

Exact file lists:

- contracts `10`: `README.md`, `dist/auth.d.ts`, `dist/auth.js`, `dist/command-result.d.ts`, `dist/command-result.js`, `dist/index.d.ts`, `dist/index.js`, `dist/style-preferences.d.ts`, `dist/style-preferences.js`, `package.json`.
- core `14`: `README.md`, `dist/account-scope.d.ts`, `dist/account-scope.js`, `dist/entity-revision.d.ts`, `dist/entity-revision.js`, `dist/index.d.ts`, `dist/index.js`, `dist/scoped-command.d.ts`, `dist/scoped-command.js`, `dist/scoped-read.d.ts`, `dist/scoped-read.js`, `dist/style-preference-aggregate.d.ts`, `dist/style-preference-aggregate.js`, `package.json`.
- api-client `28`: `README.md`, `package.json`, and `.d.ts/.js` pairs for `auth-controller`, `auth-flight`, `auth-port`, `auth-profile`, `auth-validation`, `index`, `style-preference-controller`, `style-preference-decode`, `style-preference-port`, `supabase-auth-decode`, `supabase-auth-port`, `supabase-auth-types`, `supabase-style-preference-port` under `dist/`.

**GREEN:** vendor tests/verifier, isolated consumer, `npm ci --ignore-scripts --offline` in a clean external copy, TypeScript and full `npm run check`. Commit: `build(web): vendor B2A preference SDK`.

### Task 2: Add the browser pending-operation store and retained controller runtime

**Files:**
- Create: `src/lib/stylePreferencePendingStore.ts`
- Create: `src/lib/stylePreferencePendingStore.test.ts`
- Create: `src/lib/webStylePreferenceRuntime.ts`
- Create: `src/lib/webStylePreferenceRuntime.test.ts`
- Modify: `src/lib/privateStateReset.ts`
- Modify: `src/lib/privateStateReset.test.ts`
- Modify: `src/lib/webPrivateResetters.ts`
- Modify: `src/app/_layout.tsx`
- Modify: RootLayout fixtures/tests as required
- Modify: `package.json` test scripts

**Store contract:** one bounded browser descriptor under a versioned key, no raw provider/storage prose. Operations are globally serialized across Fast Refresh/controllers. `read(accountId)` cleans invalid/cross-owner data before returning; `remove(accountId)` removes invalid or same-owner data but must never let a stale A cleanup delete a valid B record. Storage/JSON/quota failures map to one fixed adapter error. No `AsyncStorage` or native dependency is added.

**Operation ID:** production uses `globalThis.crypto.randomUUID()` only. Missing/throwing/noncanonical output fails through the shared controller before storage/RPC. Never use time/`Math.random` fallback.

**Runtime:** construct one retained `createStylePreferenceController` with `createSupabaseStylePreferencePort(supabase)`, `webAccountScope`, the browser store and crypto provider. Register `controller.reset` in the ordered private reset registry before user/profile cache publication. Root authenticated account effect starts `controller.load()` alongside the profile read without blocking navigation. Refresh-only signals do not create another account epoch or duplicate write.

**RED cases:** invalid/cross-owner/over-size storage; localStorage read/write/remove exceptions; stale A remove after B write; A→B/reset with late read/write/error/finally; same-account signout/relogin; unknown result recovery from stored operation; missing crypto; load exactly once per epoch; reset failure blocks B publication. Assert fixed public state and exact RPC/store order/counts.

**GREEN:** focused store/runtime/mounted Root tests, account-scope suite, TypeScript, vendor verifier, full check/build. Commit: `feat(web): bind preference controller to account scope`.

### Task 3: Remove the legacy preference state source and define confirmed selectors

**Files:**
- Modify: `src/stores/userStore.ts`
- Modify: `src/lib/privateStateReset.ts` and affected tests
- Modify or replace: `src/lib/storeReadPolicy.ts`, `src/lib/storeReadPolicy.test.ts`
- Create: `src/lib/stylePreferenceSelectors.ts`
- Create: `src/lib/stylePreferenceSelectors.test.ts`
- Modify: `src/app/(tabs)/profile.tsx`

Remove `stylePreferences` and `setStylePreferences` from `UserState`; `fetchProfile` reads only the user profile and no longer queries `user_style_preferences` or `tags`. Simplify the profile patch/read tests without losing independent failure, cache or account-fence behavior.

Selectors accept only a `StylePreferenceControllerSnapshot` and return:

- confirmed display names for the profile summary;
- confirmed model values for recommendation;
- `loading/read-failed/unseen/skipped/selected` summary state.

Selectors use `server.selected`, never `draftTagIds`; a saving/failed/conflict draft cannot leak into recommendation before confirmed revision. Legacy entries use the server-decoded display/model values exactly. Profile summary subscribes to the shared controller and shows finite loading/error/unseen/skipped copy without reading raw joins.

**RED cases:** failed/saving/conflict draft differs from server but selector remains confirmed; selected order/model values; legacy; skipped/unseen/error; A late snapshot after reset cannot render for B; userStore source guard finds no preference table/join.

**GREEN:** selectors/user/profile/store tests plus account-scope, TypeScript, full check/build. Commit: `refactor(web): use one confirmed preference source`.

### Task 4: Build one shared preference experience and migrate both routes

**Files:**
- Create: `src/components/StylePreferenceScreen.tsx`
- Create: `src/lib/stylePreferenceViewModel.ts` and tests, or equivalent pure presentation policy
- Create mounted route/component fixtures and tests under `src/lib/test-fixtures/stylePreferences/` and `src/lib/stylePreferenceRoutes.integration.test.*`
- Modify: `src/app/onboarding/step2-style.tsx`
- Modify: `src/app/profile/style.tsx`
- Modify: `src/design-system/StyleeStickyDecisionBar.tsx` only for a tested `primaryDisabled` pass-through if required
- Create/modify a focused shared-component contract test if that API changes
- Modify: `package.json` test scripts

One screen owns options/draft/status/actions; route wrappers own only navigation/outcome differences:

- onboarding confirmed save → `/onboarding/step3-wardrobe`;
- onboarding confirmed `暂不设置` → `/(tabs)`;
- onboarding read failure `先进入首页` → `/(tabs)` for this visit only, with no server write;
- profile confirmed save → back when available, otherwise `/(tabs)/profile`;
- profile has no fake local skip.

The component captures the current account stamp/controller at action start and rechecks mounted/current identity plus exact confirmed message before navigation/toast. A late A result, unmount, account switch, failed/unknown save or unconfirmed conflict cannot navigate B.

Render only server options in exact order. Cover active choices, separately labelled legacy selections, conflict-preserved draft, latest confirmed selection, removed legacy disclosure, read retry, same-operation confirmation, explicit conflict overwrite and fixed save failure with draft retained. Normal save is disabled with zero active selection; onboarding skip remains available. Do not expose raw Supabase/storage error prose.

Use canonical components and semantic tokens. Onboarding uses `StyleePageHeader`; profile uses `StyleeNavigationBar`. Selection uses `StyleeChoiceChip` with Feather check trailing content. Actions use `StyleeStickyDecisionBar`/`StyleeButton`; status uses `StyleeInlineStatus`. No legacy 47% cards, raw colors or private typography/spacing/radius.

**RED/mounted cases:** both routes render the same 19 ordered labels; selected has checkbox state + visible icon; double action dispatches once; selected/skipped navigation only after confirmed result; read failure retry/bypass distinction; unknown queries same ID; conflict cannot toggle/save until explicit overwrite; legacy retain/remove; A→B late completion cannot navigate or show A; 320px content/actions remain reachable by scroll/keyboard focus.

**GREEN:** focused pure/mounted tests, design-system guard, TypeScript, full check/build. Commit: `feat(web): share versioned preference screen`.

### Task 5: Feed recommendation only confirmed `modelValue` and install a no-legacy-write guard

**Files:**
- Modify: `src/app/outfit/result.tsx`
- Modify/add: `src/lib/styleeMapping.test.ts` only where contract coverage is relevant
- Create: `src/lib/stylePreferenceSourceBoundary.test.ts`
- Modify: `package.json` test membership

At each recommendation attempt, read the current shared controller snapshot and pass joined confirmed `selected[].modelValue` through the existing `stylePreferences` context field. Preserve user `query`, explicit tags, weather and quota semantics. If no confirmed selected snapshot exists, send empty preference context; never use draft/fallback UI names or raw `tags.tag_name`.

The executable source-boundary test must reject:

- `tags.upsert` in either preference route/shared feature;
- `user_style_preferences` delete/upsert or per-row loops in those paths;
- raw preference join/state in `userStore`;
- `tag.tag_name` preference consumption in recommendation;
- duplicated route-local controller/write logic.

It must require both routes to consume the same shared component/runtime and require the recommendation helper to use `modelValue`. Source guards supplement, not replace, behavior tests.

**RED/GREEN:** first run against the legacy source and capture the expected violations; implement the minimum replacement, then run selector/recommendation/source-boundary tests and full check/build. Commit: `fix(web): use confirmed preference model values`.

### Task 6: Capture and inspect responsive visual evidence

**Files:**
- Create only if needed and feature-gated: `src/app/style-preference-preview.tsx`
- Modify only if needed: `src/app/_layout.tsx` and its mounted public-preview contract
- Create: `docs/quality/2026-09-06-f02b-b2b-style-preference-visual.md`
- Store screenshot/contact-sheet files under an ignored evidence directory; do not commit user data or browser state.

If an account-independent preview route is necessary, it must require `EXPO_PUBLIC_DESIGN_SYSTEM_PREVIEW=1`, use the real shared component with synthetic in-memory controller states, perform no Supabase/Auth/private read, and be covered by the existing Root public-preview denial tests. Do not leave an unguarded mock route.

Capture exact legacy-base and final states at 320/375/393/430/768 widths and matching heights. Include at least default selected, loading, read error, fixed save error, confirming, conflict and legacy. Compose each baseline/final pair into one comparison input and inspect it for clipping, unreachable sticky actions, incorrect wrapping, raw/private geometry, focus order, 44px targets, status truncation and non-color selection cues. Fix and recapture until clean. Record what is visually verified versus what still requires a live authenticated browser/backend. No Figma action because the user did not request one and no token/component visual contract changes.

Commit evidence/guarded preview only after review: `test(web): verify preference responsive states`.

### Task 7: Final review, cold verification and stacked Draft PR

**Files:**
- Create: `docs/quality/2026-09-06-f02b-b2b-web-style-preferences-verification.md`
- Modify: `README.md` only if consumer/release instructions need the new package/runtime boundary
- Modify implementation files only for valid review findings

Run task-scoped review after every task, then one fresh whole-branch review of exact `ee422ef..HEAD`. Fix every valid Critical/Important and rerun affected/full gates. Documentation Minors that blur source, CI, production or visual evidence must also be fixed.

Final exact-tree commands:

```bash
npm run test:vendor
npm run vendor:check
npm run test:style-preferences
npm run test:account-scope
npm run test:account-scope-integration
npm run test:consumer-control
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npx tsc --noEmit
npm run check
npm run build:web
git diff --check ee422ef761019ea69b7eb41c96e4cbb8c2a2421c..HEAD
```

Perform a clean external offline install from the exact final candidate commit with empty npm user/global configs and only an approved task cache. Require the three vendored packages to resolve beneath that clean consumer; run full check and placeholder Web build there. Scan tracked files and bundle output for `.env`, credentials/signing material, service-role/model keys, raw provider error prose and old vendor path resolution.

Verification document must record exact base/head/tree, commits/files, package provenance, RED/GREEN and mutation evidence, local/cold counts, warnings, visual comparisons, scope exclusions, open production/backend gates and rollback. It must say Web source is a candidate only.

Push `codex/f02b-b2-web-preferences` and open a **Draft** PR with base `codex/f02b-account-scope`. Require exact-head Design System Guard and Shared Core Consumer success. Do not merge or retarget. Record PR URL/head/base/run/job conclusions. An author cannot approve their own PR; record GitHub's rule rather than switching identity.

After Hosted CI, stop at these explicit gates:

1. production prepare audit/deploy authorization for the additive B1 migration/RPC;
2. separate authorization to merge PR #26, then reconcile/retarget this stacked PR;
3. separate authorization to merge/deploy B2B Web;
4. production readback of deployed SHA, package versions, exact RPC usage and legacy-bundle compatibility window;
5. later B3 enforcement design/approval after drain evidence.

No local/Hosted check substitutes for those production decisions.

---

## 4. Plan self-review

- **Mainline:** this closes the Web consumer portion of F02B without changing the approved iOS/Android shared contracts or skipping production gates.
- **Single source:** editor, profile summary and recommendation all consume the same account-fenced confirmed controller snapshot; old raw-join state is removed.
- **Compatibility:** the old 0.1.0 vendor directory remains immutable, while active dependencies atomically move to the exact three-package merge set.
- **Failure semantics:** storage, network, unknown result, conflict, stale account and malformed DTO paths fail closed without raw error leakage or false navigation.
- **Visual continuity:** canonical v3.8.1 components/tokens are reused; no new design system or Figma claim.
- **Release truth:** stacked Draft PR/Hosted CI is not Web adoption; migration prepare, PR #26 merge, B2B merge/deploy and B3 enforcement remain separate gates.
