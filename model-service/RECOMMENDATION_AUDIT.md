# Recommendation pipeline audit

The complete cross-repository audit is stored in the Stylee app repository at
`docs/recommendation-pipeline-audit-2026-07-14.md`. This file records the model-service
decisions that must remain true when the standalone `fitzw/style-model` repository changes.

## Confirmed defects

1. `n=3` over-generates six drafts, after a separate sequential intent-model call.
2. Gap items previously trusted the model-generated `role`; `role=accessory` with
   `category=下装` allowed a second pair of shorts to bypass slot validation.
3. Outfit signatures previously contained only owned item IDs. All-gap outfits therefore
   shared the empty signature and collapsed to one result, forcing “换一套” to call the model again.
4. Adapter names used `"补:" + gap.desc`, leaking long purchasing sentences into UI labels.
5. Recommended gap items do not yet resolve to a catalog item or image URL.

## Invariants

- Derive owned slots from the authoritative wardrobe item.
- Derive gap slots from `CATEGORY_SLOT[gap.category]`; never trust a model role for validation.
- A recommended dress covers both torso and bottom.
- Outfit signatures cover both owned IDs and canonical gap category/name.
- `gap.desc` is a concise noun phrase, and the adapter enforces a compact display name.
- The service owns business validity; the client may add defense in depth but must not be
  the only layer preventing duplicate core slots.

## Next performance and image work

- Add per-stage request timings and a request ID to trace.
- Remove or merge the sequential B0 call, reduce over-generation, and enforce a fast deadline.
- Resolve gap needs against a curated catalog in the main Supabase and return
  `catalog_item_id` plus `image_url`; do not let the LLM invent URLs.

