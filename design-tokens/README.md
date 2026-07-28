# Stylee Design Tokens

`stylee-v3.7.tokens.json` is the canonical Tokens Studio source for Stylee Design System v3.7.

## Sync settings

- Provider: GitHub
- Repository: `yiguo2026/stylee_mvp_v2`
- Branch: `tokens-sync`
- Storage: `File`
- Path: `design-tokens/stylee-v3.7.tokens.json`

Pull from GitHub when connecting a Figma file for the first time. Do not push a
local Figma copy until the remote Tokens have been loaded and reviewed.

## Engineering commands

```bash
npm run tokens:build
npm run tokens:check
npm run design-system:check
npm run check
```

Generated code lives in `src/design-system/tokens.ts` and must not be edited
directly.
