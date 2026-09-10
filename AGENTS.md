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
Sync/check provenance comes only from a temporary `git archive` of the captured
canonical SHA, never from live checkout bytes. The sync publishes
`UPSTREAM_COMMIT` atomically and last, after archive parity validation.

# GitHub CLI operation rule — 2026-09-09

Automated shell calls on this Mac must explicitly use `login: false`; shell
startup currently contains credential-export hooks. Do not run `gh auth token`,
print credential files or dump environment values when diagnosing Git access.
Use the normal approved host-execution path when GitHub requests cannot reach
the existing loopback proxy/keychain from the sandbox; never weaken sandbox,
proxy or TLS settings. `gh auth status` exit 1, "invalid token", or startup
"no oauth token" is not proof of expired credentials. Verify identity with
`gh api --hostname github.com user --jq .login` on the working approved path
before considering reauthentication; only a real identity API 401 supports it.
GitHub connector 403/404 is a separate grant, not CLI credential failure.
Keep the verified HTTPS remote plus gh credential helper. Do not switch to SSH,
logout, reset or ask the user to log in repeatedly as an error-handling shortcut.
For the local Mobile coordination workspace, use its read-only
`scripts/github-access.mjs --git` probe and GitHub-access runbook.
