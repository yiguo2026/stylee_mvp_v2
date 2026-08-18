#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd -P)
source_scripts="$repo_root/scripts"
fixture_root=$(mktemp -d "${TMPDIR:-/tmp}/stylee-model-sync.XXXXXX")
trap 'rm -rf "$fixture_root"' EXIT

canonical="$fixture_root/canonical"
app="$fixture_root/app"
vendor="$app/model-service"
app_scripts="$app/scripts"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

expect_failure() {
  local description=$1
  shift
  if "$@" >"$fixture_root/command.log" 2>&1; then
    fail "$description unexpectedly succeeded"
  fi
}

expect_success() {
  local description=$1
  shift
  if ! "$@" >"$fixture_root/command.log" 2>&1; then
    sed -n '1,160p' "$fixture_root/command.log" >&2
    fail "$description failed"
  fi
}

deployment_files=(
  .dockerignore
  .env.example
  ARCHITECTURE.md
  Dockerfile
  LOCAL_SETUP.md
  QUOTA_ARCHITECTURE.md
  render.yaml
  requirements.txt
  serve.py
)

test_files=(
  test_ai_features.py
  test_alpha_matte.py
  test_embeddings.py
  test_gamma.py
  test_outfit_constraints.py
  test_outfit_pipeline.py
  test_provider_http.py
  test_provider_parse.py
  test_rag.py
  test_recognition_input.py
  test_request_trace.py
  test_scoring.py
  test_security.py
  test_service.py
  test_vision.py
  test_release_info.py
)

create_canonical_fixture() {
  mkdir -p \
    "$canonical/.github/workflows" \
    "$canonical/stylee/providers" \
    "$canonical/scripts" \
    "$canonical/data/garments2look"

  printf '%s\n' 'VALUE = "canonical"' >"$canonical/stylee/core.py"
  printf '%s\n' 'PROVIDER = "canonical"' >"$canonical/stylee/providers/base.py"
  printf '%s\n' 'print("build")' >"$canonical/scripts/build_index.py"
  printf '%s\n' 'print("manifest")' >"$canonical/scripts/build_rag_manifest.py"
  printf '%s\n' 'print("exemplars")' >"$canonical/scripts/build_exemplars.py"
  printf '%s\n' 'print("download")' >"$canonical/scripts/download_garments2look.py"
  printf '%s\n' 'print("ingest")' >"$canonical/scripts/ingest_smoke.py"
  printf '%s\n' '{"artifact":"index.vecs","sha256":"fixture"}' \
    >"$canonical/data/garments2look/manifest.json"
  printf '\000\001\002fixture-rag\377' \
    >"$canonical/data/garments2look/index.vecs"
  printf '%s\n' 'name: Canonical model CI fixture' \
    >"$canonical/.github/workflows/model-service-ci.yml"
  printf '%s\n' 'name: Canonical deploy fixture' \
    >"$canonical/.github/workflows/deploy-render.yml"
  printf '%s\n' 'stylee/ignored.py' 'test_future_contract.py' \
    >"$canonical/.gitignore"

  local path
  for path in "${deployment_files[@]}"; do
    printf 'canonical %s\n' "$path" >"$canonical/$path"
  done
  for path in "${test_files[@]}"; do
    printf 'assert %q == %q\n' "$path" "$path" >"$canonical/$path"
  done

  git -C "$canonical" init -q
  git -C "$canonical" config user.name 'Fixture Author'
  git -C "$canonical" config user.email 'fixture@example.com'
  git -C "$canonical" add .
  git -C "$canonical" commit -qm 'fixture canonical release'
}

seed_matching_vendor() {
  rm -rf "$vendor"
  mkdir -p "$vendor"
  cp -R "$canonical/stylee" "$vendor/stylee"
  cp -R "$canonical/scripts" "$vendor/scripts"
  mkdir -p "$vendor/.github"
  cp -R "$canonical/.github/workflows" "$vendor/.github/workflows"
  mkdir -p "$vendor/data"
  cp -R "$canonical/data/garments2look" "$vendor/data/garments2look"

  local path
  for path in "${deployment_files[@]}" "${test_files[@]}"; do
    cp "$canonical/$path" "$vendor/$path"
  done
  printf '%s\n' 'Stylee-only upstream instructions' >"$vendor/UPSTREAM.md"
  printf '%s\n' 'Stylee-only monorepo README' >"$vendor/README.md"
}

create_canonical_fixture
mkdir -p "$app_scripts"
cp "$source_scripts/check-model-service-sync.sh" "$app_scripts/check-model-service-sync.sh"
seed_matching_vendor

# This is the first RED assertion against the pre-change checker: an unpinned
# mirror must never be accepted, even when every previously checked file matches.
expect_failure 'checker without UPSTREAM_COMMIT' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"

[[ -f "$source_scripts/sync-model-service.sh" ]] || fail 'sync script is missing'
[[ -f "$source_scripts/model-service-governed-paths.txt" ]] || fail 'governed path list is missing'
cp "$source_scripts/sync-model-service.sh" "$app_scripts/sync-model-service.sh"
cp "$source_scripts/model-service-governed-paths.txt" \
  "$app_scripts/model-service-governed-paths.txt"

canonical_sha=$(git -C "$canonical" rev-parse HEAD)
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
expect_success 'matching fixtures' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"

printf '%s\n' 'IGNORED = "must not be mirrored"' >"$canonical/stylee/ignored.py"
expect_success 'sync ignores non-HEAD governed bytes' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ ! -e "$vendor/stylee/ignored.py" ]] \
  || fail 'sync copied ignored non-HEAD bytes under the canonical pin'
expect_success 'checker ignores non-HEAD governed bytes' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
rm "$canonical/stylee/ignored.py"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"

printf '%s\n' 'assert "future contract"' >"$canonical/test_future_contract.py"
git -C "$canonical" add -f test_future_contract.py
git -C "$canonical" commit -qm 'add future contract test'
canonical_sha=$(git -C "$canonical" rev-parse HEAD)
expect_success 'sync dynamically added committed test' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
cmp "$canonical/test_future_contract.py" "$vendor/test_future_contract.py" >/dev/null \
  || fail 'sync did not copy the future test byte-for-byte'
[[ "$(<"$vendor/UPSTREAM_COMMIT")" == "$canonical_sha" ]] \
  || fail 'sync did not pin the commit containing the future test'

git -C "$canonical" rm -q test_future_contract.py
git -C "$canonical" commit -qm 'remove future contract test'
canonical_sha=$(git -C "$canonical" rev-parse HEAD)
printf '%s\n' 'assert "ignored stale future contract"' \
  >"$canonical/test_future_contract.py"
expect_success 'sync dynamically removed committed test' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ ! -e "$vendor/test_future_contract.py" ]] \
  || fail 'sync retained a test removed from the committed snapshot'
[[ "$(<"$vendor/UPSTREAM_COMMIT")" == "$canonical_sha" ]] \
  || fail 'sync did not pin the commit removing the future test'
rm "$canonical/test_future_contract.py"

ln -s core.py "$canonical/stylee/unsupported-link.py"
git -C "$canonical" add stylee/unsupported-link.py
git -C "$canonical" commit -qm 'add unsupported committed symlink'
expect_failure 'checker rejects committed symlink objects' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
expect_failure 'sync rejects committed symlink objects' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
git -C "$canonical" rm -q stylee/unsupported-link.py
git -C "$canonical" commit -qm 'remove unsupported committed symlink'
canonical_sha=$(git -C "$canonical" rev-parse HEAD)
expect_success 'sync after committed symlink removal' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"

submodule_repo="$fixture_root/submodule-repo"
mkdir -p "$submodule_repo"
git -C "$submodule_repo" init -q
git -C "$submodule_repo" config user.name 'Fixture Author'
git -C "$submodule_repo" config user.email 'fixture@example.com'
printf '%s\n' 'submodule fixture' >"$submodule_repo/README.md"
git -C "$submodule_repo" add README.md
git -C "$submodule_repo" commit -qm 'submodule fixture'
git -C "$canonical" -c protocol.file.allow=always submodule add -q \
  "$submodule_repo" stylee/unsupported-submodule
git -C "$canonical" commit -qam 'add unsupported submodule'
expect_failure 'checker rejects committed submodules' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
expect_failure 'sync rejects committed submodules' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
git -C "$canonical" rm -qf stylee/unsupported-submodule
git -C "$canonical" commit -qam 'remove unsupported submodule'
canonical_sha=$(git -C "$canonical" rev-parse HEAD)
expect_success 'sync after committed submodule removal' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"

printf '%s\n' 'name: drifted model CI fixture' \
  >"$vendor/.github/workflows/model-service-ci.yml"
expect_failure 'changed governed workflow test context' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"

printf '%s\n' 'VALUE = "drifted"' >"$vendor/stylee/core.py"
expect_failure 'changed Python source' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"

rm "$vendor/test_release_info.py"
expect_failure 'missing dynamic test' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"

printf '%s\n' 'assert True' >"$vendor/test_unexpected.py"
expect_failure 'extra dynamic test' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"

printf '\000changed-rag\377' >"$vendor/data/garments2look/index.vecs"
expect_failure 'changed RAG binary' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
cp "$canonical/data/garments2look/index.vecs" \
  "$vendor/data/garments2look/index.vecs"
printf '%s\n' '{"artifact":"index.vecs","sha256":"drifted"}' \
  >"$vendor/data/garments2look/manifest.json"
expect_failure 'changed RAG manifest' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"

printf '%s\n' 'EXTRA = True' >"$vendor/stylee/extra.py"
expect_failure 'extra governed source file' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
rm "$vendor/scripts/build_rag_manifest.py"
expect_failure 'missing governed script file' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
seed_matching_vendor
printf '%040d\n' 0 >"$vendor/UPSTREAM_COMMIT"
expect_failure 'mismatched pin' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"

seed_matching_vendor
printf '%040d\n' 0 >"$vendor/UPSTREAM_COMMIT"
printf '%s\n' 'assert True' >"$vendor/test_stale.py"
printf '%s\n' 'name: stale workflow' \
  >"$vendor/.github/workflows/stale.yml"
printf '%s\n' 'VALUE = "stale"' >"$vendor/stylee/core.py"
printf '\000stale-rag\377' >"$vendor/data/garments2look/index.vecs"
printf '%s\n' '{"artifact":"stale"}' \
  >"$vendor/data/garments2look/manifest.json"
upstream_doc_before=$(<"$vendor/UPSTREAM.md")
readme_before=$(<"$vendor/README.md")

expect_success 'fixture sync' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ ! -e "$vendor/test_stale.py" ]] || fail 'sync preserved a stale governed test'
[[ ! -e "$vendor/.github/workflows/stale.yml" ]] \
  || fail 'sync preserved stale governed workflow context'
cmp "$canonical/.github/workflows/model-service-ci.yml" \
  "$vendor/.github/workflows/model-service-ci.yml" >/dev/null \
  || fail 'sync did not copy workflow test context byte-for-byte'
cmp "$canonical/data/garments2look/index.vecs" \
  "$vendor/data/garments2look/index.vecs" >/dev/null \
  || fail 'sync did not copy RAG binary byte-for-byte'
[[ "$(<"$vendor/UPSTREAM.md")" == "$upstream_doc_before" ]] \
  || fail 'sync overwrote UPSTREAM.md'
[[ "$(<"$vendor/README.md")" == "$readme_before" ]] \
  || fail 'sync overwrote README.md'
[[ "$(<"$vendor/UPSTREAM_COMMIT")" == "$canonical_sha" ]] \
  || fail 'sync did not update the exact canonical pin'
expect_success 'post-sync strict check' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"

printf '%s\n' 'dirty' >"$canonical/untracked.txt"
expect_failure 'checker with dirty upstream' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
pin_before=$(<"$vendor/UPSTREAM_COMMIT")
expect_failure 'sync with dirty upstream' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ "$(<"$vendor/UPSTREAM_COMMIT")" == "$pin_before" ]] \
  || fail 'dirty-upstream sync mutated the pin'
rm "$canonical/untracked.txt"

non_git="$fixture_root/non-git"
mkdir -p "$non_git"
expect_failure 'checker with non-Git upstream' \
  bash "$app_scripts/check-model-service-sync.sh" "$non_git"
expect_failure 'sync with non-Git upstream' \
  bash "$app_scripts/sync-model-service.sh" "$non_git"

seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
escaped_target="$fixture_root/escaped-target"
mkdir -p "$escaped_target"
printf '%s\n' 'must survive' >"$escaped_target/sentinel.txt"
rm -rf "$vendor/stylee"
ln -s "$escaped_target" "$vendor/stylee"
expect_failure 'checker with symlinked governed target' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
expect_failure 'sync with symlinked governed target' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ -f "$escaped_target/sentinel.txt" ]] \
  || fail 'sync deleted outside the resolved model-service mirror'

seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
nested_file_target="$fixture_root/nested-file-target.py"
cp "$canonical/stylee/providers/base.py" "$nested_file_target"
nested_file_before=$(<"$nested_file_target")
rm "$vendor/stylee/providers/base.py"
ln -s "$nested_file_target" "$vendor/stylee/providers/base.py"
expect_failure 'checker with matching nested governed file symlink' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
expect_failure 'sync with matching nested governed file symlink' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ "$(<"$nested_file_target")" == "$nested_file_before" ]] \
  || fail 'sync overwrote the external nested-file sentinel'

seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
nested_directory_target="$fixture_root/nested-directory-target"
mkdir -p "$nested_directory_target"
cp "$canonical/stylee/providers/base.py" "$nested_directory_target/base.py"
nested_directory_before=$(<"$nested_directory_target/base.py")
rm -rf "$vendor/stylee/providers"
ln -s "$nested_directory_target" "$vendor/stylee/providers"
expect_failure 'checker with matching nested governed directory symlink' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"
expect_failure 'sync with matching nested governed directory symlink' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ "$(<"$nested_directory_target/base.py")" == "$nested_directory_before" ]] \
  || fail 'sync overwrote the external nested-directory sentinel'

seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
matching_test_target="$fixture_root/matching-test-target.py"
cp "$canonical/test_release_info.py" "$matching_test_target"
rm "$vendor/test_release_info.py"
ln -s "$matching_test_target" "$vendor/test_release_info.py"
expect_failure 'checker with matching symlinked test target' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"

seed_matching_vendor
printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
test_sentinel="$fixture_root/test-sentinel.py"
printf '%s\n' 'must survive test sync' >"$test_sentinel"
test_sentinel_before=$(<"$test_sentinel")
rm "$vendor/test_release_info.py"
ln -s "$test_sentinel" "$vendor/test_release_info.py"
expect_failure 'sync with symlinked test destination' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ "$(<"$test_sentinel")" == "$test_sentinel_before" ]] \
  || fail 'sync overwrote the external test sentinel'

seed_matching_vendor
pin_target="$fixture_root/matching-pin-target"
printf '%s\n' "$canonical_sha" >"$pin_target"
ln -s "$pin_target" "$vendor/UPSTREAM_COMMIT"
expect_failure 'checker with matching symlinked pin target' \
  bash "$app_scripts/check-model-service-sync.sh" "$canonical"

seed_matching_vendor
pin_sentinel="$fixture_root/pin-sentinel"
printf '%s\n' 'must survive pin sync' >"$pin_sentinel"
pin_sentinel_before=$(<"$pin_sentinel")
ln -s "$pin_sentinel" "$vendor/UPSTREAM_COMMIT"
expect_failure 'sync with symlinked pin destination' \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ "$(<"$pin_sentinel")" == "$pin_sentinel_before" ]] \
  || fail 'sync overwrote the external pin sentinel'

seed_matching_vendor
old_pin=1111111111111111111111111111111111111111
printf '%s\n' "$old_pin" >"$vendor/UPSTREAM_COMMIT"
expect_failure 'post-copy validation fault' \
  env STYLEE_MODEL_SYNC_TEST_FAIL_CONTENT_VALIDATION=1 \
  bash "$app_scripts/sync-model-service.sh" "$canonical"
[[ "$(<"$vendor/UPSTREAM_COMMIT")" == "$old_pin" ]] \
  || fail 'failed sync published a new pin before content validation'

echo 'model-service sync integration tests passed'
