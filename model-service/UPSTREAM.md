# Vendored from style-model

Canonical source: `https://github.com/fitzw/style-model`

This directory is a vendored copy for Stylee App local development. Model-service code must be changed in the canonical repository first (or mirrored there in the same change), then verified with:

```bash
./scripts/check-model-service-sync.sh /path/to/style-model
```

The App repository intentionally carries additional generated RAG index files under `data/garments2look/`. README text can also differ because the App copy documents monorepo commands. Python source, service contracts, deployment files, architecture decisions, and common tests must not drift.
