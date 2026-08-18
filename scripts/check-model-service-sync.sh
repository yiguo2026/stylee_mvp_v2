#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd -P)
root=$(cd "$script_dir/.." && pwd -P)
vendor="$root/model-service"
governed_paths_file="$script_dir/model-service-governed-paths.txt"
upstream_arg=${1:-}
failed=0
temporary_files=()
snapshot_root=''

cleanup() {
  local path
  for path in "${temporary_files[@]}"; do
    rm -f -- "$path"
  done
  if [[ -n "$snapshot_root" && -d "$snapshot_root" ]]; then
    rm -rf -- "$snapshot_root"
  fi
}
trap cleanup EXIT

die() {
  echo "model-service check: $*" >&2
  exit 1
}

validate_relative_path() {
  local path=$1
  case "$path" in
    ''|.|..|/*|../*|*/../*|*/..|*//*|*/|*$'\n'*|*$'\r'*)
      die "unsafe governed path: $path"
      ;;
  esac
}

validate_destination_path() {
  local path=$1
  local expected_type=$2
  local current=$vendor
  local index
  local -a components
  IFS='/' read -r -a components <<<"$path"

  for ((index = 0; index < ${#components[@]}; index++)); do
    current="$current/${components[$index]}"
    [[ ! -L "$current" ]] \
      || die "governed mirror destination contains a symlink: $path"
    if [[ $index -lt $((${#components[@]} - 1)) && -e "$current" && ! -d "$current" ]]; then
      die "governed mirror destination parent is not a directory: $path"
    fi
  done

  if [[ -e "$current" ]]; then
    if [[ "$expected_type" == directory && ! -d "$current" ]]; then
      die "governed mirror destination must be a directory: $path"
    fi
    if [[ "$expected_type" == regular && ! -f "$current" ]]; then
      die "governed mirror destination must be a regular file: $path"
    fi
  fi
}

materialize_committed_snapshot() {
  local archive_path
  local metadata
  local mode
  local object_type
  local path

  while IFS=$'\t' read -r -d '' metadata path; do
    mode=${metadata%% *}
    object_type=${metadata#* }
    object_type=${object_type%% *}
    validate_relative_path "$path"
    case "$mode:$object_type" in
      100644:blob|100755:blob)
        ;;
      120000:blob)
        die "canonical commit contains an unsupported symlink: $path"
        ;;
      160000:commit)
        die "canonical commit contains an unsupported submodule: $path"
        ;;
      *)
        die "canonical commit contains an unsupported Git object: $mode $object_type $path"
        ;;
    esac
  done < <(git -C "$upstream" ls-tree -rz "$canonical_sha")

  snapshot_root=$(mktemp -d "${TMPDIR:-/tmp}/stylee-model-source.XXXXXX")
  source_snapshot="$snapshot_root/source"
  archive_path="$snapshot_root/source.tar"
  mkdir "$source_snapshot"
  git -C "$upstream" archive --format=tar --output="$archive_path" "$canonical_sha" \
    || die "cannot archive canonical commit: $canonical_sha"
  tar -xf "$archive_path" -C "$source_snapshot" \
    || die "cannot extract canonical commit snapshot: $canonical_sha"
}

list_tests() {
  local directory=$1
  (
    cd "$directory"
    shopt -s nullglob
    for path in test_*.py; do
      [[ -f "$path" ]] && printf '%s\n' "$path"
    done | LC_ALL=C sort
  )
}

compare_governed_path() {
  local path=$1
  local source_path="$source_snapshot/$path"
  local vendor_path="$vendor/$path"

  if [[ -d "$source_path" ]]; then
    if [[ ! -d "$vendor_path" ]]; then
      echo "missing governed mirror directory: $path" >&2
      failed=1
      return
    fi
    if ! diff -qr -x '__pycache__' -x '*.pyc' \
      "$source_path" "$vendor_path"; then
      failed=1
    fi
  elif [[ -f "$source_path" ]]; then
    if [[ ! -f "$vendor_path" ]]; then
      echo "missing governed mirror file: $path" >&2
      failed=1
      return
    fi
    if ! cmp -s "$source_path" "$vendor_path"; then
      echo "governed mirror file differs: $path" >&2
      failed=1
    fi
  else
    die "unsupported canonical governed path type: $path"
  fi
}

[[ -n "$upstream_arg" ]] \
  || die "usage: $0 /path/to/style-model-checkout"
[[ -d "$upstream_arg" ]] \
  || die "canonical checkout does not exist: $upstream_arg"

upstream=$(cd "$upstream_arg" && pwd -P)
git -C "$upstream" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "canonical source is not a Git checkout: $upstream"
git_root=$(git -C "$upstream" rev-parse --show-toplevel 2>/dev/null) \
  || die "cannot resolve canonical Git root: $upstream"
[[ "$(cd "$git_root" && pwd -P)" == "$upstream" ]] \
  || die "canonical path must be the Git checkout root: $upstream"
[[ -z "$(git -C "$upstream" status --porcelain --untracked-files=normal)" ]] \
  || die "canonical checkout is dirty: $upstream"
canonical_sha=$(git -C "$upstream" rev-parse --verify 'HEAD^{commit}' 2>/dev/null) \
  || die "cannot resolve canonical HEAD: $upstream"
materialize_committed_snapshot

[[ -d "$vendor" ]] || die "model-service mirror is missing: $vendor"
[[ ! -L "$vendor" ]] || die "model-service mirror root must not be a symlink: $vendor"
[[ -f "$governed_paths_file" ]] \
  || die "governed path list is missing: $governed_paths_file"

pin_file="$vendor/UPSTREAM_COMMIT"
validate_destination_path UPSTREAM_COMMIT regular
[[ -f "$pin_file" ]] || die "UPSTREAM_COMMIT is missing"
pin_line_count=$(wc -l <"$pin_file" | tr -d '[:space:]')
[[ "$pin_line_count" == 1 ]] || die "UPSTREAM_COMMIT must contain exactly one line"
IFS= read -r pinned_sha <"$pin_file"
[[ "$pinned_sha" =~ ^[0-9a-f]{40}$ ]] \
  || die "UPSTREAM_COMMIT is not a full Git SHA"
[[ "$pinned_sha" == "$canonical_sha" ]] \
  || die "UPSTREAM_COMMIT $pinned_sha does not match canonical HEAD $canonical_sha"

governed_count=0
while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  validate_relative_path "$path"
  [[ -e "$source_snapshot/$path" ]] \
    || die "canonical governed path is missing: $path"
  if [[ -d "$source_snapshot/$path" ]]; then
    validate_destination_path "$path" directory
  elif [[ -f "$source_snapshot/$path" ]]; then
    validate_destination_path "$path" regular
  else
    die "unsupported canonical governed path type: $path"
  fi
  governed_count=$((governed_count + 1))
  compare_governed_path "$path"
done <"$governed_paths_file"
[[ $governed_count -gt 0 ]] || die "governed path list is empty"

upstream_test_list=$(mktemp "${TMPDIR:-/tmp}/stylee-upstream-tests.XXXXXX")
vendor_test_list=$(mktemp "${TMPDIR:-/tmp}/stylee-vendor-tests.XXXXXX")
temporary_files+=("$upstream_test_list" "$vendor_test_list")
list_tests "$source_snapshot" >"$upstream_test_list"
shopt -s nullglob
vendor_test_paths=("$vendor"/test_*.py)
for test_path in "${vendor_test_paths[@]}"; do
  test_name=${test_path##*/}
  validate_destination_path "$test_name" regular
done
list_tests "$vendor" >"$vendor_test_list"
[[ -s "$upstream_test_list" ]] \
  || die "canonical checkout has no root test_*.py files"
if ! diff -u "$upstream_test_list" "$vendor_test_list"; then
  failed=1
fi

while IFS= read -r test_name; do
  if ! cmp -s "$source_snapshot/$test_name" "$vendor/$test_name"; then
    echo "governed mirror test differs: $test_name" >&2
    failed=1
  fi
done <"$upstream_test_list"

if [[ $failed -ne 0 ]]; then
  echo "model-service mirror differs from canonical checkout $canonical_sha" >&2
  exit 1
fi

echo "model-service mirror matches canonical checkout $canonical_sha"
