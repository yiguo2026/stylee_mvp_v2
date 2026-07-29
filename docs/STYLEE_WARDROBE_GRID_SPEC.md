# Stylee Wardrobe Grid Density Specification

Status: approved vNext adjustment  
Approved: 2026-07-29  
Applies to: wardrobe home, grid view

## 1. Outcome

Increase useful information density without making touch targets harder to use.
At the reference viewport, users can compare six complete wardrobe cards before
scrolling.

## 2. Reference composition

Acceptance viewport: **393 × 852 pt**, default text size, stable loaded state,
keyboard closed, no temporary import or confirmation banner.

From top to bottom:

1. Page header: 44 pt minimum.
   - “衣橱” uses Display.
   - Add is a trailing icon action with a 44 × 44 pt touch target.
   - Do not show a floating add button over the grid.
2. Search: 44 pt high.
   - Search text and placeholder use Content.
3. Category rail: 32 pt visible height.
   - Use `StyleeChoiceChip`.
   - Counts use Support and must not increase the chip height.
4. Wardrobe grid:
   - 2 columns × 3 complete rows visible above the Tab Bar.
   - 16 pt horizontal screen padding.
   - 8 pt column gap and 8 pt row gap.
5. System Tab Bar:
   - Keep the current safe-area-aware system contract.
   - The grid must not be covered by the Tab Bar.

Use an 8 pt vertical rhythm between the header, search, category rail, and grid
unless the safe-area/navigation implementation already supplies the separation.

Reference arithmetic:

- card width: `(393 - 2 × 16 - 8) / 2 = 176.5 pt`;
- media height: `176.5 / (4/3) ≈ 132.4 pt`;
- minimum card height: `132.4 + 48 ≈ 180.4 pt`;
- three card rows plus two gaps: `3 × 180.4 + 2 × 8 ≈ 557.2 pt`;
- header, search, category rail, and their gaps: `44 + 8 + 44 + 8 + 32 + 8 = 144 pt`.

The stable content composition therefore requires about 701.2 pt between the
top safe-area edge and the Tab Bar. Runtime layout must use the measured safe
areas rather than hard-coding a status-bar or Tab Bar height.

## 3. Wardrobe card

| Property | Specification |
|---|---|
| Surface | semantic card surface |
| Width | `(viewport width - 2 × 16 - 8) / 2` |
| Radius | 12 pt |
| Media | 4:3 frame (`aspectRatio: 1.333333`) |
| Media fit | `contain`; never crop the garment to fill the frame |
| Information area | 48 pt minimum |
| Information padding | 8 pt horizontal, 4 pt vertical |
| Item name | Content, one line, ellipsis |
| Metadata | Support, one line, ellipsis |
| Row gap | 8 pt |

The entire card is the interactive target. Card height may grow for Dynamic
Type, but text must not overlap or be clipped.

## 4. States

- Loading and import skeleton cards use the same grid geometry to avoid layout
  jumps.
- Empty state replaces the grid and is not required to preserve the six-card
  composition.
- A temporary import/confirmation banner may reduce visible rows. It must not
  compress the cards below this specification.
- Search results and category filters keep the same card geometry.
- Selected/pressed state may change surface, border, opacity, or shadow, but
  must not change card size.

## 5. Responsive and accessibility rules

- Keep two columns on 320–599 pt widths.
- At 600 pt and above, use the existing tablet grid strategy; do not stretch
  wardrobe cards to oversized media.
- The six-card acceptance target is specific to 393 × 852 pt at the default
  text size.
- On shorter viewports or with Dynamic Type, preserve readable text and 44 pt
  touch targets even if fewer than six cards are fully visible.
- Image content must have an accessible item label through the card control.

## 6. Canonical tokens

Use `ds.component.wardrobeGrid`, generated from
`Components.wardrobeGrid` in
`design-tokens/stylee-v3.8.tokens.json`.

Feature screens must not duplicate these dimensions as raw values.

## 7. Acceptance checklist

- [ ] At 393 × 852 pt, six complete loaded cards are visible before scrolling.
- [ ] No card is covered by the Tab Bar or an add button.
- [ ] Header add action has a 44 × 44 pt touch target.
- [ ] Search height is 44 pt and choice-chip visual height is 32 pt.
- [ ] Garments are shown with `contain`, including wide shoes and tall trousers.
- [ ] Item name and metadata use Content and Support respectively.
- [ ] 320, 375, 393, 430, and 768 pt widths have no horizontal clipping.
- [ ] Dynamic Type can grow without text overlap.
- [ ] Loading skeletons use the same grid geometry as loaded cards.
