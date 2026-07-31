# Stylee Design System v3.8 Migration

Status: implementation candidate  
Date: 2026-07-29  
Previous released baseline: v3.7

## Scope

v3.8 formalizes three approved system changes:

1. compact choice chips with a 32 pt visual height and 44 pt touch target;
2. four semantic typography roles: Display, Heading, Content, and Support;
3. the wardrobe six-card density contract at the 393 × 852 pt reference viewport.

## Canonical source

The canonical file is:

`design-tokens/stylee-v3.8.tokens.json`

`src/design-system/tokens.ts` is generated and must never be edited directly.

The Tokens Studio GitHub provider must be updated from the v3.7 path to:

`design-tokens/stylee-v3.8.tokens.json`

Publish the branch before changing the Figma provider path, then Pull from
GitHub. Do not Push an older local Figma token copy over the v3.8 file.

## Shared implementation

Product screens should use:

- `StyleeChoiceChip` for compact filter/category selection;
- `StyleePageHeader` for left-aligned page titles with a trailing action;
- `StyleeSearchField` for product search;
- `StyleeWardrobeCard` for wardrobe-item media and metadata;
- `StyleeWardrobeGrid` for mobile/tablet wardrobe layout.

The wardrobe screen owns data, filtering, animation, and navigation. It must not
redeclare card ratio, card information height, grid columns, or grid gaps.

## Verification

Required before release:

```bash
npm run tokens:build
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

Manual visual checks:

- 320, 375, 393, 430, and 768 pt widths;
- 393 × 852 pt default text size shows six complete loaded cards;
- Dynamic Type does not overlap text, even when fewer rows fit;
- garments use `contain`;
- the header add action is reachable and no floating button covers the grid.

For an account-independent local preview:

```bash
EXPO_PUBLIC_DESIGN_SYSTEM_PREVIEW=1 npm run build:web
python3 -m http.server 8082 -d dist
```

Open `/wardrobe-preview`. Without the environment flag, the route remains
behind the normal authentication redirect.

## Delivery sequence

1. Review the local v3.8 screen and component implementation.
2. Commit and push `tokens-sync`.
3. Run and pass the Design System Guard.
4. Update the Tokens Studio storage path and Pull v3.8.
5. Update Figma Variables/Styles and build the new components without duplicates.
6. Open a pull request from `tokens-sync` to `main` with before/after screenshots.
