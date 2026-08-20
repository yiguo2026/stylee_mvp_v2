# Vendored from style-model

Canonical source: `https://github.com/fitzw/style-model`

This directory is a generated mirror for Stylee App local development. Model-service code, tests, deployment files, canonical scripts, and RAG artifacts must be changed in the canonical repository first. The mirror is pinned to the exact canonical Git SHA in `UPSTREAM_COMMIT`.

Regenerate and verify it with:

```bash
./scripts/sync-model-service.sh /path/to/style-model
./scripts/check-model-service-sync.sh /path/to/style-model
```

The governed paths are declared once in `scripts/model-service-governed-paths.txt`; root `test_*.py` files are discovered dynamically from the committed tree. Both commands capture canonical `HEAD` and materialize one temporary `git archive` snapshot for all comparisons, so ignored or otherwise non-HEAD checkout bytes can never be copied or certified under the pin. Unsupported committed symlinks, submodules, object types, and unsafe paths fail closed.

Sync refuses dirty or non-Git canonical checkouts, replaces only governed directories/files, removes stale governed tests, and copies binary artifacts byte-for-byte. Every destination component and every existing governed directory subtree is inspected without following links; any symlink at any depth fails before mirror mutation. The old pin remains in place while copied content is validated against the archive; only after parity succeeds is a temporary regular pin atomically renamed to `UPSTREAM_COMMIT` as the last operation.

Canonical workflow source is mirrored byte-for-byte under `model-service/.github/workflows/` because the canonical release tests read it as governed test context. It is inert there: GitHub activates workflows only from the App repository's root `.github/workflows/` directory.

`model-service/UPSTREAM.md`, `model-service/README.md`, App UI code, and App-root workflows are Stylee-owned and are never copied by the sync script. Do not edit generated mirror files directly.
