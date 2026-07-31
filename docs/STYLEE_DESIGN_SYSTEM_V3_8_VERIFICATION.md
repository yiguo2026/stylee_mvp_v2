# Stylee Design System v3.8 Verification

## v3.8.1 regression correction

- Content weight: Regular (400), including buttons, chips, search, navigation,
  and wardrobe-card titles.
- Wardrobe card width: calculated from the rendered grid container, not the
  browser window, so the desktop phone stage still renders two complete
  columns.

Date: 2026-07-29  
Target: wardrobe home v3.8 vertical slice

## Automated checks

Passed:

```text
npm run tokens:check
npm run design-system:check
npm run wardrobe-density:check
npm run check
npm run build:web
```

The density contract calculates a 176.5 pt card width and a 701.1 pt stable
composition at the 393 × 852 pt reference viewport.

## Browser layout measurements

The account-independent preview used the real v3.8 shared components and the
real App Tab Bar.

| Viewport | Columns × rows | Card width | Six cards above Tab Bar | Horizontal clipping |
|---|---:|---:|---:|---:|
| 320 × 852 | 2 × 3 | 140 pt | yes | none |
| 375 × 852 | 2 × 3 | 167.5 pt | yes | none |
| 393 × 852 | 2 × 3 | 176.5 pt | yes | none |
| 430 × 852 | 2 × 3 | 194 pt | yes | none |
| 768 × 1024 | 3 × 2 | 218.7 pt | yes | none |

At 393 × 852:

- the sixth card ends at 702.6 px;
- the Tab Bar begins at 789 px;
- all six image elements load successfully;
- all images render through the shared `contain` contract;
- no floating add button covers the grid.

## Additional fix found during verification

The Web-only desktop phone shell previously remained as unstyled wrapper
content below the 960 px desktop breakpoint. That displaced mobile Web content
and made the Tab Bar appear in the middle of the screen. The shell wrappers now
use `display: contents` and hide the simulated status bar below 960 px. Native
iOS layout was not affected by this Web-shell issue.

## Remaining release actions

- Commit and push the `tokens-sync` branch.
- Update Tokens Studio storage path to
  `design-tokens/stylee-v3.8.tokens.json`, then Pull.
- Update Figma Variables/Styles and add editable v3.8 components.
- Open and review the pull request to `main`.
- Perform one final iOS Simulator or physical-device Dynamic Type pass.
