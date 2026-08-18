# Stylee Model Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `fitzw/style-model` the single deployable model-service source, ship the same RAG capability as the Stylee mirror, deploy an exact tested SHA to Render, and generate the Stylee mirror automatically from that deployed commit.

**Architecture:** Canonical runtime code, tests, deployment files, and the current 15 MB RAG index live in `style-model`. Render remains manual/CI-triggered, but GitHub Actions deploys the exact successful `main` SHA through a secret deploy hook and verifies version metadata from `/health`. Stylee keeps a generated mirror pinned by `model-service/UPSTREAM_COMMIT`; sync/check scripts and CI reject any code, test, data, or SHA drift.

**Tech Stack:** Python 3.12 stdlib HTTP service, Pillow 12.3.0, Bash, GitHub Actions, Render deploy hooks, Expo/TypeScript App repository.

**Spec:** `docs/superpowers/specs/2026-08-18-style-model-release-pipeline-design.md`

## Global Constraints

- `fitzw/style-model` is the only editable source for model-service runtime behavior.
- Stylee `model-service/` is generated from a pinned canonical commit and must not contain independent service changes.
- The three current RAG files are versioned in canonical Git while their total remains below 50 MB.
- No API key, deploy hook, Supabase password, access token, image base64, or provider response is logged or committed.
- Render deploys only an exact CI-tested SHA; App PRs remain blocked until health and real-provider smoke verify that SHA.
- Existing API response contracts remain backward compatible; `/health` only gains safe fields.
- All production behavior changes follow red-green-refactor TDD.

---

### Task 1: Create the canonical release worktree and establish a green baseline

**Files:**
- Worktree: `/Users/bytedance/Documents/styleetest1/.worktrees/style-model-release-pipeline`
- Branch: `codex/reliable-model-release`

**Interfaces:**
- Consumes: latest `fitzw/style-model:main`
- Produces: isolated canonical checkout used by Tasks 2–6

- [ ] **Step 1: Verify the source repository and ignored worktree directory**

Run:

```bash
git -C /Users/bytedance/Documents/styleetest1/.worktrees/style-model-canonical fetch origin main --prune
git -C /Users/bytedance/Documents/styleetest1 check-ignore -q .worktrees
```

Expected: fetch succeeds and `.worktrees` is ignored.

- [ ] **Step 2: Create the canonical worktree from latest main**

Run:

```bash
git -C /Users/bytedance/Documents/styleetest1/.worktrees/style-model-canonical \
  worktree add /Users/bytedance/Documents/styleetest1/.worktrees/style-model-release-pipeline \
  -b codex/reliable-model-release origin/main
```

Expected: named branch at current `origin/main` with a clean status.

- [ ] **Step 3: Run all 15 canonical test scripts**

Run:

```bash
cd /Users/bytedance/Documents/styleetest1/.worktrees/style-model-release-pipeline
PY=/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
for test_file in test_*.py; do "$PY" "$test_file" || exit 1; done
```

Expected: every script prints `ok`; the HTTP smoke may require sandbox approval for loopback binding.

---

### Task 2: Version and validate the Garments2Look RAG artifact

**Files:**
- Modify: canonical `.gitignore`
- Create: canonical `data/garments2look/index.meta.json`
- Create: canonical `data/garments2look/exemplars.jsonl`
- Create: canonical `data/garments2look/exemplars.vecs`
- Create: canonical `data/garments2look/manifest.json`
- Create: canonical `stylee/release_info.py`
- Create: canonical `scripts/build_rag_manifest.py`
- Create: canonical `test_release_info.py`

**Interfaces:**
- Produces: `validate_rag_artifact(index_dir: str) -> RagArtifactStatus`
- Produces: `build_rag_manifest(index_dir: str) -> dict`
- `RagArtifactStatus` exposes `artifact_available`, `signature`, `dim`, and `count`

- [ ] **Step 1: Write failing manifest validation tests**

Add to `test_release_info.py`:

```python
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from stylee.release_info import validate_rag_artifact


def _write_fixture(root: Path) -> None:
    (root / "index.meta.json").write_text(json.dumps({
        "signature": "openai_compat:text-embedding-v4:1024",
        "dim": 1024,
        "count": 3000,
    }), encoding="utf-8")
    (root / "exemplars.jsonl").write_text('{"text":"look"}\n', encoding="utf-8")
    (root / "exemplars.vecs").write_bytes(b"vectors")
    files = {}
    for name in ("index.meta.json", "exemplars.jsonl", "exemplars.vecs"):
        files[name] = hashlib.sha256((root / name).read_bytes()).hexdigest()
    (root / "manifest.json").write_text(json.dumps({
        "schema_version": 1,
        "signature": "openai_compat:text-embedding-v4:1024",
        "dim": 1024,
        "count": 3000,
        "files": files,
    }), encoding="utf-8")


def test_validate_rag_artifact_accepts_matching_manifest():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        status = validate_rag_artifact(str(root))
        assert status.artifact_available is True
        assert status.signature == "openai_compat:text-embedding-v4:1024"
        assert status.dim == 1024 and status.count == 3000


def test_validate_rag_artifact_rejects_hash_drift():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        (root / "exemplars.vecs").write_bytes(b"changed")
        status = validate_rag_artifact(str(root))
        assert status.artifact_available is False
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
python3 test_release_info.py
```

Expected: FAIL because `stylee.release_info` does not exist.

- [ ] **Step 3: Implement minimal manifest validation**

Create `stylee/release_info.py` with a frozen `RagArtifactStatus` dataclass, streamed SHA-256 calculation, JSON shape checks, and fail-closed exception handling. It must not expose file paths or exception bodies through the public health payload.

- [ ] **Step 4: Implement deterministic manifest generation**

Create `scripts/build_rag_manifest.py` that imports the validator constants, reads `index.meta.json`, computes the three SHA-256 values, writes sorted/indented JSON, and exits nonzero when signature, dimension, count, or files are invalid.

- [ ] **Step 5: Copy the approved index and generate the canonical manifest**

Run:

```bash
mkdir -p data/garments2look
cp /Users/bytedance/Documents/styleetest1/.worktrees/stylee-feedback-fixes/model-service/data/garments2look/index.meta.json data/garments2look/
cp /Users/bytedance/Documents/styleetest1/.worktrees/stylee-feedback-fixes/model-service/data/garments2look/exemplars.jsonl data/garments2look/
cp /Users/bytedance/Documents/styleetest1/.worktrees/stylee-feedback-fixes/model-service/data/garments2look/exemplars.vecs data/garments2look/
python3 scripts/build_rag_manifest.py --dir data/garments2look
```

- [ ] **Step 6: Allow only the governed RAG files through `.gitignore`**

Keep raw Garments2Look downloads ignored. Add explicit exceptions only for the four files under `data/garments2look/`.

- [ ] **Step 7: Run GREEN and corruption coverage**

Run:

```bash
python3 test_release_info.py
python3 test_rag.py
python3 -c 'from stylee.release_info import validate_rag_artifact; s=validate_rag_artifact("data/garments2look"); assert s.artifact_available and s.count == 3000; print(s)'
```

- [ ] **Step 8: Commit the versioned RAG artifact**

Run:

```bash
git add .gitignore data/garments2look stylee/release_info.py scripts/build_rag_manifest.py test_release_info.py
git commit -m "feat(release): version the recommendation index"
```

---

### Task 3: Expose safe release and RAG metadata from `/health`

**Files:**
- Modify: canonical `stylee/release_info.py`
- Modify: canonical `stylee/service/server.py`
- Modify: canonical `test_release_info.py`
- Modify: canonical `test_service.py`

**Interfaces:**
- Produces: `health_payload(environ: Mapping[str, str], index_dir: str) -> dict`
- Extends: `GET /health` with safe backward-compatible fields

- [ ] **Step 1: Write failing health payload tests**

Add:

```python
def test_health_payload_reports_render_sha_and_rag_status():
    with TemporaryDirectory() as directory:
        root = Path(directory)
        _write_fixture(root)
        payload = health_payload({
            "RENDER_GIT_COMMIT": "abc123",
            "RENDER_GIT_BRANCH": "main",
            "RENDER_GIT_REPO_SLUG": "fitzw/style-model",
        }, str(root))
        assert payload["status"] == "ok"
        assert payload["contract_version"] == "2026-08-18"
        assert payload["git_sha"] == "abc123"
        assert payload["git_branch"] == "main"
        assert payload["repo_slug"] == "fitzw/style-model"
        assert payload["rag"]["artifact_available"] is True
        assert payload["rag"]["count"] == 3000
```

Update `test_service.py` to assert the same keys from the HTTP endpoint using a temporary environment and restore all environment variables in `finally`.

- [ ] **Step 2: Run RED**

Run:

```bash
python3 test_release_info.py
python3 test_service.py
```

Expected: FAIL because `/health` still returns only `status`.

- [ ] **Step 3: Implement the safe payload**

Add `CONTRACT_VERSION = "2026-08-18"`. Use `local` defaults when Render variables are absent. Cache only manifest validation keyed by index directory; do not cache environment values across tests or deploys.

- [ ] **Step 4: Wire the endpoint**

Replace the inline `{"status":"ok"}` response in `Handler.do_GET` with `health_payload(os.environ, os.environ.get("STYLEE_RAG_INDEX_DIR", "data/garments2look"))`.

- [ ] **Step 5: Run GREEN and full service tests**

Run all `test_*.py` scripts.

- [ ] **Step 6: Commit health versioning**

```bash
git add stylee/release_info.py stylee/service/server.py test_release_info.py test_service.py
git commit -m "feat(release): expose deployed service version"
```

---

### Task 4: Add canonical CI and exact-SHA Render deployment automation

**Files:**
- Create: canonical `.github/workflows/model-service-ci.yml`
- Create: canonical `.github/workflows/deploy-render.yml`
- Create: canonical `scripts/wait_for_release.py`
- Create: canonical `test_release_workflow.py`
- Modify: canonical `render.yaml`

**Interfaces:**
- CI produces one successful `Model Service CI` check for a specific SHA
- Deploy workflow consumes `RENDER_DEPLOY_HOOK_URL`
- `wait_for_release(url: str, expected_sha: str, timeout_seconds: int) -> dict`

- [ ] **Step 1: Write failing release workflow tests**

Create `test_release_workflow.py` that:

- serves a sequence of in-memory health responses to `wait_for_release`;
- proves it returns only after `git_sha` matches;
- proves timeout/mismatched contract/RAG raises a release error;
- source-checks both workflow files for dynamic `test_*.py` discovery, Docker build, `workflow_run.head_sha`, `RENDER_DEPLOY_HOOK_URL`, exact `ref`, and health polling.

- [ ] **Step 2: Run RED**

Run `python3 test_release_workflow.py`.

Expected: FAIL because the script and workflows do not exist.

- [ ] **Step 3: Implement `wait_for_release.py`**

Use `urllib.request`, monotonic time, bounded 10-second polling, and safe one-line progress containing only status, observed SHA prefix, contract version, and RAG availability. Exit nonzero on timeout or malformed JSON.

- [ ] **Step 4: Add `model-service-ci.yml`**

The workflow must:

```yaml
on:
  pull_request:
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: for test_file in test_*.py; do python "$test_file" || exit 1; done
      - run: python scripts/build_rag_manifest.py --dir data/garments2look --check
      - run: docker build -t stylee-model-service:${{ github.sha }} .
```

Add `--check` mode to the manifest script without rewriting the file.

- [ ] **Step 5: Add `deploy-render.yml`**

Trigger on successful `workflow_run` of `Model Service CI` for `main`. Check out `github.event.workflow_run.head_sha`, validate that `RENDER_DEPLOY_HOOK_URL` is set, URL-encode/add the exact `ref`, call the hook without printing it, then invoke `wait_for_release.py` against `https://stylee-model-service.onrender.com/health`.

- [ ] **Step 6: Keep Render auto-deploy off in code**

Retain `autoDeployTrigger: off`; document that the GitHub Action is the only automated production trigger.

- [ ] **Step 7: Run GREEN and validate workflow syntax**

Run:

```bash
python3 test_release_workflow.py
python3 scripts/build_rag_manifest.py --dir data/garments2look --check
git diff --check
```

If `actionlint` is available, also run it on both workflows; otherwise rely on the source contract test and the first PR workflow execution.

- [ ] **Step 8: Commit CI and deployment automation**

```bash
git add .github/workflows scripts/wait_for_release.py scripts/build_rag_manifest.py test_release_workflow.py render.yaml
git commit -m "ci(release): deploy tested model commits"
```

---

### Task 5: Record the canonical editing rule and open the canonical PR

**Files:**
- Create: canonical `AGENTS.md`
- Modify: canonical `README.md`
- Modify: canonical `ARCHITECTURE.md`

**Interfaces:**
- Produces: repository-level rule for future Codex/engineer changes

- [ ] **Step 1: Add the canonical-first rule**

`AGENTS.md` must state:

- model behavior is edited only in `fitzw/style-model`;
- every change needs tests in canonical before mirror sync;
- production deploys exact CI-tested `main` SHA;
- Stylee mirror is generated and must not be independently edited;
- App release waits for health SHA/contract/RAG and provider smoke.

- [ ] **Step 2: Document required GitHub secrets without values**

Document `RENDER_DEPLOY_HOOK_URL` and optional smoke-account secret names. Never paste values.

- [ ] **Step 3: Run the complete canonical verification**

Run all 17 canonical test scripts dynamically, the manifest check, and `git diff --check`. This Mac has no Docker CLI, so the canonical GitHub CI Docker-build job is the mandatory production-image verification.

- [ ] **Step 4: Commit documentation**

```bash
git add AGENTS.md README.md ARCHITECTURE.md
git commit -m "docs(release): require canonical-first delivery"
```

- [ ] **Step 5: Push and open a Draft PR**

Push `codex/reliable-model-release` and open a Draft PR against `main` with audit evidence, RAG size/hash information, test results, required secret configuration, and the explicit release gate.

---

### Task 6: Replace the Stylee manual mirror workflow with pinned automatic sync

**Files:**
- Create: App `model-service/UPSTREAM_COMMIT`
- Create: App `scripts/model-service-governed-paths.txt`
- Create: App `scripts/sync-model-service.sh`
- Create: App `scripts/model-service-sync.test.sh`
- Modify: App `scripts/check-model-service-sync.sh`
- Modify: App `model-service/UPSTREAM.md`
- Modify: App `AGENTS.md`

**Interfaces:**
- `sync-model-service.sh <canonical-checkout>` updates governed mirror and pin
- `check-model-service-sync.sh <canonical-checkout>` validates source, tests, data, and pin

- [ ] **Step 1: Write a failing shell integration test**

The test creates temporary canonical/vendor fixtures, then asserts:

1. missing `UPSTREAM_COMMIT` fails;
2. changed Python source fails;
3. missing or extra `test_*.py` fails;
4. changed RAG binary or manifest fails;
5. matching fixtures pass;
6. sync removes stale governed tests, copies binary data, preserves `UPSTREAM.md`, and updates the pin.

- [ ] **Step 2: Run RED**

Run `bash scripts/model-service-sync.test.sh`.

Expected: FAIL because the sync script and pin do not exist and the checker ignores data/new tests.

- [ ] **Step 3: Define governed paths once**

`model-service-governed-paths.txt` lists runtime directories, deployment files, canonical scripts, and RAG data. Test files remain a dynamic `test_*.py` set rather than hard-coded entries.

- [ ] **Step 4: Implement sync and strict check scripts**

Use `rsync --delete` only inside explicitly governed directories; use `cmp`/`diff` for validation. Resolve canonical SHA using `git -C "$upstream" rev-parse HEAD`. Fail before mutation when the upstream is dirty or not a Git checkout.

- [ ] **Step 5: Sync from the canonical release branch**

Run:

```bash
./scripts/sync-model-service.sh /Users/bytedance/Documents/styleetest1/.worktrees/style-model-release-pipeline
./scripts/check-model-service-sync.sh /Users/bytedance/Documents/styleetest1/.worktrees/style-model-release-pipeline
```

- [ ] **Step 6: Run GREEN and App regression**

Run:

```bash
bash scripts/model-service-sync.test.sh
cd model-service && for test_file in test_*.py; do python3 "$test_file" || exit 1; done
cd .. && npm run check && npm run build:web
```

- [ ] **Step 7: Commit the generated mirror tooling**

```bash
git add AGENTS.md model-service scripts
git commit -m "build(model): pin and generate the service mirror"
```

---

### Task 7: Add Stylee cross-repository mirror CI

**Files:**
- Create: App `.github/workflows/model-service-sync.yml`
- Create: App `src/lib/modelServiceSyncWorkflow.test.ts`

**Interfaces:**
- Consumes: `STYLE_MODEL_READ_TOKEN` read-only GitHub secret
- Verifies: mirror matches `model-service/UPSTREAM_COMMIT`

- [ ] **Step 1: Write the failing workflow source test**

Assert that the workflow reads `UPSTREAM_COMMIT`, checks out `fitzw/style-model` at that exact ref with `STYLE_MODEL_READ_TOKEN`, invokes the strict sync checker, and runs all canonical and vendor tests dynamically.

- [ ] **Step 2: Run RED**

Run `node --experimental-strip-types --test src/lib/modelServiceSyncWorkflow.test.ts`.

- [ ] **Step 3: Add the workflow**

Use two `actions/checkout@v4` steps with separate paths. The App checkout uses the default token; the private canonical checkout uses only `${{ secrets.STYLE_MODEL_READ_TOKEN }}` and `persist-credentials: false`.

- [ ] **Step 4: Run GREEN and full App tests**

Run the new test, all existing Node tests, `npm run check`, and web export.

- [ ] **Step 5: Commit CI**

```bash
git add .github/workflows/model-service-sync.yml src/lib/modelServiceSyncWorkflow.test.ts
git commit -m "ci(model): verify the pinned canonical mirror"
```

---

### Task 8: Configure secrets, merge canonical, and deploy the exact SHA

**Files:**
- GitHub secret in `fitzw/style-model`: `RENDER_DEPLOY_HOOK_URL`
- Optional GitHub secrets: dedicated smoke-account credentials
- GitHub secret in `yiguo2026/stylee_mvp_v2`: `STYLE_MODEL_READ_TOKEN`

**Interfaces:**
- Produces: deployed canonical SHA proven by `/health`

- [ ] **Step 1: Stop at the external-secret checkpoint**

List secret names only. If `RENDER_DEPLOY_HOOK_URL` or `STYLE_MODEL_READ_TOKEN` is absent, ask the user to provide/configure it through Render/GitHub. Do not create or expose credentials without action-time authorization.

- [ ] **Step 2: Verify canonical PR CI and review diff**

Confirm all checks pass, data files are present, no secrets are in the patch, and the branch is mergeable.

- [ ] **Step 3: Merge canonical only after user approval**

Merge with the repository's accepted method. Record the resulting `main` SHA.

- [ ] **Step 4: Monitor exact-SHA deployment**

Wait for Render deployment and require `/health.git_sha` to equal the merged SHA, contract version to match, and RAG artifact to report 3000 entries.

- [ ] **Step 5: Run authenticated provider smoke**

Test recognition with the supplied large image, transparent standardization, vector recommendation, and text-free try-on. Preserve request IDs and scalar diagnostics only.

- [ ] **Step 6: Stop on any mismatch**

Do not update the App pin or merge App PR while deployment, RAG, contract, or provider smoke remains unverified.

---

### Task 9: Pin the deployed SHA in Stylee PR #17 and finish the release

**Files:**
- Modify: App `model-service/UPSTREAM_COMMIT`
- Generated changes: App `model-service/`
- Modify: App PR #17 body/checklist

**Interfaces:**
- Consumes: deployed canonical `main` SHA
- Produces: App PR whose mirror matches the running service

- [ ] **Step 1: Sync from the deployed canonical SHA**

Check out or archive the deployed SHA, run `sync-model-service.sh`, and verify the pin equals `/health.git_sha`.

- [ ] **Step 2: Run all final checks**

Run strict mirror sync, all model scripts in both copies, all Node tests, `npm run check`, web export, and `git diff --check`.

- [ ] **Step 3: Push the App branch and update PR #17**

Document the deployed SHA, health contract, RAG vector status, provider smoke request IDs, and CI results.

- [ ] **Step 4: Keep App PR Draft until user review**

Show the user the final deployed-service evidence and App diff. Mark ready or merge only after explicit approval.

---

### Task 10: Persist the future operating rule

**Files:**
- Modify: App `AGENTS.md`
- Create/update: approved Codex memory extension note

**Interfaces:**
- Produces: persistent canonical-first rule for future sessions

- [ ] **Step 1: Verify repository instructions contain the exact rule**

Confirm `AGENTS.md` states canonical-only editing, generated mirror, exact-SHA deployment, online contract/RAG smoke, and App-last release ordering.

- [ ] **Step 2: Add one memory extension note**

Because the user explicitly requested this rule for future work, add a small timestamped note under `/Users/bytedance/.codex/memories/extensions/ad_hoc/notes/` describing the approved canonical-first workflow and release gates. Do not edit generated memory registries directly.

- [ ] **Step 3: Report final operational state**

Provide canonical PR/merge SHA, Render deploy SHA, health contract, RAG mode, Stylee pin, App PR state, validations, and any still-manual credential step.
