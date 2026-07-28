# Stylee Design System v3.7

This directory is the implementation source for released Stylee UI foundations and components.

## Source of truth

- Use `tokens.ts` for color, spacing, size, radius, typography, shadow, and component measurements.
- Product components consume semantic tokens (`surface`, `text`, `border`, `action`, `status`).
- Primitive colors are only for defining semantic tokens.
- Existing values in `constants/theme.ts` remain a compatibility layer while screens migrate.

## Released P0 components

- `StyleeButton`
- `StyleeIconButton`
- `StyleeStatusBadge`
- `StyleeInlineStatus`
- `StyleeOutfitItemCard`
- `StyleeNavigationBar`
- `StyleeStickyDecisionBar`
- Existing app Tab Bar and Toast are migrated to v3.7 semantics.

## Engineering rules

1. Do not add raw hex colors or one-off button/card geometry to product screens.
2. Reuse a released component before creating a new page-local equivalent.
3. New reusable APIs must include disabled/loading/pressed behavior and accessibility labels.
4. Interactive targets are at least 44 × 44 pt.
5. Validate changed screens at 320, 375, 393, 430, and 768 pt widths.
6. A component change and its consuming screen ship in the same pull request.

## Migration order

1. Recommendation result (pilot)
2. Outfit generation/input
3. Wardrobe list and item details
4. Record and profile
5. Onboarding and authentication
