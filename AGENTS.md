# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

# Stylee design work continuity

Before any UI, UX, Figma, design-token, shared-component, or visual migration
work, read `docs/STYLEE_DESIGN_SYSTEM_CONTEXT.md` completely.

That file records the verified Design System v3.8 implementation state, the
Figma/Tokens Studio GitHub connection, source-of-truth precedence, delivery
workflow, and known gaps. Do not infer current design decisions from old HTML,
SVG, PDF, or root-level token exports when they conflict with the canonical
repository token file.

# Model service mirror

`model-service/` is a generated, SHA-pinned mirror of the canonical
`fitzw/style-model` repository. Make governed runtime, deployment, script,
test, and RAG-data changes in the canonical repository first, then run:

```bash
./scripts/sync-model-service.sh /path/to/style-model
./scripts/check-model-service-sync.sh /path/to/style-model
```

Do not edit governed mirror files directly. The App-owned
`model-service/UPSTREAM.md` and `model-service/README.md`, App UI code, and App
root workflows are outside the generated mirror and must be preserved.
Canonical workflow sources under `model-service/.github/workflows/` are
governed, inert test context; never copy them into the App root `.github`.
