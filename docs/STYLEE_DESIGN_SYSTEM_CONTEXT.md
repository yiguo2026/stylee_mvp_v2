# Stylee Design System — Current Context and Handoff

Last verified: 2026-07-29  
Current released baseline: Stylee Design System v3.7  
Active implementation candidate: Stylee Design System v3.8  
Repository: `https://github.com/yiguo2026/stylee_mvp_v2`

This is the continuity document for new Codex conversations and future team
members. Read it before changing UI, Figma assets, tokens, shared components,
or screen styling.

## 1. Source-of-truth precedence

When sources disagree, use this order:

1. The user's explicit decision in the current task.
2. `design-tokens/stylee-v3.8.tokens.json` — canonical machine-readable tokens.
3. The GitHub-connected Tokens Studio data in the Figma file.
4. `src/design-system/` — released production component contracts.
5. `../stylee-design-system-v3.7.html` — human-readable reference.
6. Older root-level HTML, JSON, SVG, PNG, PDF, and historical Direction B
   material — reference only.

Important:

- Root files `stylee-design-tokens-v3.7.json` and
  `stylee-figma-tokens-v3.7.tokens.json` are historical handoff artifacts, not
  the current canonical source.
- Older documents may describe a warmer Paper/Cocoa palette. The current
  repository JSON uses the released v3.7 neutral/oxblood/moss semantic model.
  Never silently mix the two systems. A major redesign must explicitly update
  the canonical JSON and version/migration notes.
- `src/design-system/tokens.ts` is generated. Never edit it by hand.

## 2. Verified Git and GitHub state

- Default branch: `main`
- Verified `origin/main`: `58559ba`
- `58559ba`: merge of PR #12, Design Token governance
- PR #12: `chore(design-system): automate token governance`
- PR URL: `https://github.com/yiguo2026/stylee_mvp_v2/pull/12`
- Both `Design System Guard` checks passed before merge.
- Token working branch: `tokens-sync`
- Verified remote `tokens-sync`: `70a48bf`
- UI migration commits:
  - `3e8e7a1` — apply Stylee Design System v3.7 P0
  - `490c7a1` — migrate home and wardrobe to DS v3.7
- Token governance author:
  `MUSE0609 <yz3434@columbia.edu>`

The local checkout may still be on `tokens-sync` and its configured fetch
refspec may track only `main`. At the beginning of a new coding task:

```bash
git status --short --branch
git fetch origin --prune
git log --oneline -5 origin/main
```

Preserve unrelated user changes. Do not reset or discard a dirty worktree.

## 3. Figma and Tokens Studio state

Current Figma file name before the v3.8 Pull: `Stylee Design System v3.7`

Known pages:

- `00 References`
- `01 Components`

Tokens Studio for Figma was connected successfully and pulled all four sets:

- `Primitives`
- `Semantic Light`
- `Typography`
- `Components`

GitHub sync configuration:

```text
Provider: GitHub
Repository: yiguo2026/stylee_mvp_v2
Branch: tokens-sync
Storage: File
File path after the v3.8 branch is published:
design-tokens/stylee-v3.8.tokens.json
Base URL: blank
```

Rules:

- Pull before beginning design work.
- On first connection always Pull; never overwrite the remote file with an
  unreviewed local Figma copy.
- Push real approved token changes only. Do not create test commits by changing
  values unnecessarily.
- PAT remains inside Tokens Studio. Never place it in chat, `.env`, design
  files, documentation, or the repository.
- The checked Token sets are active. `Theme: None` is expected because the
  current free single-file setup does not use Pro theme switching.
- After a real Pull that changes tokens, export/update Figma Variables and
  Styles deliberately; do not create duplicate collections.

Figma component progress:

- `Action/Button` exists as a component set.
- Primary variants were created and the Instance `State` selector was tested:
  `Default`, `Pressed`, and `Disabled`.
- The primary button baseline is 52 pt high, radius 12, horizontal padding 16,
  and uses the relevant component/semantic variables.
- Imported reference SVG/PNG sheets are locked reference images. They are not
  production Figma components. SVG text overlap/wrapping is an import artifact;
  do not repair every reference vector before productive component work.
- The rest of the Figma library is incomplete. Do not claim all code P0
  components already exist as editable Figma components.

Reference/build documents in the workspace:

- `../Stylee DS v3.7 - Figma Library Build Spec.md`
- `../Stylee Design System v3.7 - Adoption & Governance.md`
- `../stylee-design-system-v3.7.html`
- `../stylee-v3.7-p0-component-sheet.svg`
- `../stylee-v3.7-reference-result-393.svg`

These describe intent and build guidance but do not override the canonical
repository tokens.

## 4. Production implementation state

Canonical/generated files for the v3.8 candidate:

- `design-tokens/stylee-v3.8.tokens.json`
- `scripts/generate-design-tokens.mjs`
- `src/design-system/tokens.ts`

Released code components:

- `StyleeButton`
- `StyleeIconButton`
- `StyleeStatusBadge`
- `StyleeInlineStatus`
- `StyleeOutfitItemCard`
- `StyleeNavigationBar`
- `StyleeStickyDecisionBar`
- App Tab Bar and Toast are migrated to v3.7 semantics.

v3.8 candidate components:

- `StyleeChoiceChip`
- `StyleePageHeader`
- `StyleeSearchField`
- `StyleeWardrobeCard`
- `StyleeWardrobeGrid`

The wardrobe home screen now consumes these shared contracts. Its former local
1:1 cover card, 12 pt row gap, and floating add button have been removed.

Migrated screens include the recommendation result pilot, home, wardrobe, Tab
Bar, and Toast work represented by commits `3e8e7a1` and `490c7a1`.

Read before implementation:

- `design-tokens/README.md`
- `src/design-system/README.md`

Required commands:

```bash
npm run tokens:build
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

Current automated guard:

- rejects newly added raw Hex/RGB/HSL colors in `src/app` and `src/components`;
- rejects newly added legacy `Colors`/`Spacing`/`Radius`/`Shadow` usage;
- rejects common numeric padding/gap and border-radius additions;
- verifies generated `tokens.ts`;
- runs TypeScript and the web build in GitHub Actions.

Intentional exceptions require:

```ts
// ds-exception: explain the reason and migration plan
```

The exception must also be described in the PR.

## 5. Workflow for the upcoming large redesign

Do not update every screen in one uncontrolled batch. Work in reviewable
vertical slices so design decisions, tokens, components, and implementation
stay aligned.

For each redesign batch:

1. **Define scope and success criteria**
   - Name the user flow and affected screens.
   - Capture current screenshots and identify the specific UX problems.
   - Separate information architecture/interaction changes from visual polish.

2. **Inventory the system**
   - Reuse existing semantic tokens and released components where they fit.
   - Classify missing needs as a token, component variant, reusable pattern, or
     page-only composition.
   - Avoid adding a global token for a one-off decoration.

3. **Design component-first**
   - Pull Tokens Studio.
   - Update/add tokens only after the decision is approved.
   - Build missing reusable Figma variants before composing the final page.
   - Cover default, pressed/focused, loading, disabled, empty, error, and
     selected states when applicable.

4. **Sync token changes**
   - Push from Tokens Studio to `tokens-sync` with a descriptive message.
   - Open `tokens-sync` to `main` PR.
   - Regenerate `src/design-system/tokens.ts` in the same delivery.
   - Never directly edit generated token code.

5. **Implement component-first**
   - Update `src/design-system/` before feature-screen composition.
   - Feature screens own data and orchestration, not private clones of shared
     buttons/cards/navigation/status patterns.
   - Use imports from `@/design-system` and semantic tokens.

6. **Verify and release**
   - Check relevant states and widths: 320, 375, 393, 430, and 768 pt.
   - Verify touch targets are at least 44 × 44 pt.
   - Provide Figma link and before/after screenshots in the PR.
   - Run the required commands and require `Design System Guard`.
   - Obtain design review for token/shared-component changes.

Recommended first action in a new redesign conversation:

> Audit the selected flow against v3.7, list UX/IA issues separately from
> visual-system issues, then propose the smallest coherent redesign batch.

Do not start by adjusting individual pixels across the whole app.

## 6. Governance still to complete

The code-side guard exists, but the following GitHub settings cannot be assumed
until verified:

- protect `main`;
- require PRs before merge;
- require `validate / Design System Guard`;
- require conversation resolution;
- add `.github/CODEOWNERS` for `design-tokens/` and `src/design-system/`;
- make `MUSE0609` a repository collaborator before requiring that account as a
  reviewer.

Suggested ownership:

```text
/design-tokens/      @MUSE0609
/src/design-system/  @MUSE0609
```

Visual regression/Storybook coverage is planned but not currently implemented.
The existing checker catches common code drift; it does not prove screen-level
layout, hierarchy, copy, responsive behavior, or Figma fidelity.

## 7. Local preview and security

Local Expo preview requires values in the untracked `.env`:

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_STYLEE_API=...
```

Never commit `.env` or secrets. Expo client code may use only public
anon/publishable values. Supabase service-role keys and model-provider secrets
must remain server-side. The current `src/lib/supabase.ts` uses the anon key;
do not reintroduce an admin/service-role client.

## 8. New-conversation startup checklist

At the start of the next design task:

1. Read this file.
2. Read `design-tokens/README.md` and `src/design-system/README.md`.
3. Inspect `git status`, current branch, and latest `origin/main`.
4. Ask which user flow or page is the first redesign batch.
5. Review the current App and Figma frame before proposing changes.
6. Keep P0 delivery focused; postpone decorative micro-polish unless it affects
   usability, accessibility, consistency, or implementation risk.

Do not repeat the completed Tokens Studio setup unless the connection is broken.

## 9. Active UI adjustment decisions

These decisions were approved after the v3.7 baseline and should be preserved
while the next design-system release is assembled.

### Compact choice chips — 2026-07-28

- Filter tags and category selectors use the shared `StyleeChoiceChip`.
- Default visual minimum height: 32 pt.
- Horizontal padding: 12 pt; vertical padding: 4 pt; radius: 8 pt.
- Gap between adjacent chips: 8 pt.
- Selected chips use the semantic primary action surface and inverse text.
- The visible control stays compact, while 6 pt vertical hit slop on each side
  preserves a 44 pt touch target.
- This rule does not shrink primary buttons, segmented navigation, list rows,
  or standalone circular checkmarks; those retain their own interaction
  contracts.

### Four-level product typography — 2026-07-29

The previous collection of display, page-title, section-title, body, small
body, button, label, caption, and micro sizes is consolidated into four roles:

| Role | Font / size / line | Functional scope |
|---|---|---|
| Display | Display Semibold · 24/30 | Page title, major empty-state title |
| Heading | Display Medium · 18/24 | Sheet title, section title, grouped-context heading |
| Content | UI Regular · 15/22 | Card title, button, tab, chip, input, primary value |
| Support | Body Regular · 12/18 | Description, metadata, label, help and status text |

Rules:

- Text with the same function uses the same role across every screen.
- Selection, disabled, destructive, and positive states may change semantic
  color or opacity, but not typography role.
- Feature screens must not introduce raw `fontSize`, `lineHeight`,
  `letterSpacing`, or `fontFamily` declarations.
- The Stylee wordmark is a brand asset and may retain its italic display face.
  Icon fonts, emoji, and graphical numerals are not product-text levels.
- In `AddClothingSheet`, “补充衣橱” and “更多方式” are both Heading;
  “相册导入”, “快速添加推荐单品”, and “心愿单” are all Content; their
  descriptions are all Support.

### v3.8.1 regression correction — 2026-07-31

- Content uses Regular rather than Medium so functional UI stays light and
  editorial instead of reading as a wall of bold labels.
- `StyleeWardrobeGrid` measures its rendered container with `onLayout`.
  Browser window width must never be used for card geometry because the web
  build may render inside a narrower desktop phone stage.

### Wardrobe six-card density — 2026-07-29

- The wardrobe home reference viewport is 393 × 852 pt at the default text size.
- Its stable state shows two columns by three fully visible rows between the
  page controls and Tab Bar.
- Page padding is 16 pt; grid column and row gaps are 8 pt.
- Header and search are each 44 pt high. The category row uses the approved
  32 pt `StyleeChoiceChip`.
- Wardrobe card media uses a 4:3 `contain` frame. The 48 pt information area
  contains a one-line Content item name and one-line Support metadata.
- The add action moves to the header trailing position with a 44 × 44 pt touch
  target. A floating action button must not cover wardrobe cards.
- The six-card rule is a density target for the stable default-size layout, not
  an accessibility override. Temporary banners, the keyboard, Dynamic Type,
  and shorter viewports may reduce the number of complete visible rows.
- Canonical values live under `Components.wardrobeGrid`; detailed acceptance
  criteria live in `docs/STYLEE_WARDROBE_GRID_SPEC.md`.
