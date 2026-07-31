## What changed

<!-- Describe the user-facing change and affected screens/components. -->

## Design System

- [ ] I reused components exported by `@/design-system` before creating a local equivalent.
- [ ] New colors, spacing, radii, typography, and control sizes use semantic Design System tokens.
- [ ] Interactive targets are at least 44 × 44 pt.
- [ ] Any `ds-exception` is documented below with a reason and migration plan.
- [ ] Changed screens were checked at relevant mobile/tablet widths.
- [ ] UI changes include a 393 × 852 screenshot or an explanation of why it is not applicable.
- [ ] Wardrobe changes preserve the six-card default-size density contract.
- [ ] Token changes include both the Tokens Studio JSON and generated `tokens.ts`.
- [ ] After token publication, Tokens Studio pulled the canonical GitHub file without creating duplicate Variables or Styles.

## Verification

- [ ] `npm run check`
- [ ] `npm run wardrobe-density:check`
- [ ] `npm run build:web`

## Design exceptions

None.
