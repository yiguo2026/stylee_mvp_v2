#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd -P)
root=$(cd "$script_dir/.." && pwd -P)
vendor="$root/model-service"
governed_paths_file="$script_dir/model-service-governed-paths.txt"
upstream_arg=${1:-}
snapshot_root=''
pin_temp=''

cleanup() {
  if [[ -n "$snapshot_root" && -d "$snapshot_root" ]]; then
    rm -rf -- "$snapshot_root"
  fi
  if [[ -n "$pin_temp" ]]; then
    rm -f -- "$pin_temp"
  fi
}
trap cleanup EXIT

die() {
  echo "model-service sync: $*" >&2
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
      || die "governed mirror target contains a symlink: $path"
    if [[ $index -lt $((${#components[@]} - 1)) && -e "$current" && ! -d "$current" ]]; then
      die "governed mirror target parent is not a directory: $path"
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

reject_nested_destination_symlinks() {
  local path=$1
  local subtree="$vendor/$path"
  local symlinks

  [[ -e "$subtree" ]] || return
  [[ -d "$subtree" && ! -L "$subtree" ]] \
    || die "governed mirror subtree is not a real directory: $path"
  if ! symlinks=$(find -P "$subtree" -type l -print); then
    die "cannot inspect governed mirror subtree: $path"
  fi
  [[ -z "$symlinks" ]] \
    || die "governed mirror subtree contains a symlink: $path"
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

validate_synced_content() {
  local failed=0
  local path
  local source_path
  local vendor_path
  local test_name
  local upstream_test_list="$snapshot_root/upstream-tests.txt"
  local vendor_test_list="$snapshot_root/vendor-tests.txt"

  for path in "${governed_paths[@]}"; do
    source_path="$source_snapshot/$path"
    vendor_path="$vendor/$path"
    if [[ -d "$source_path" ]]; then
      reject_nested_destination_symlinks "$path"
      if ! diff -qr -x '__pycache__' -x '*.pyc' "$source_path" "$vendor_path"; then
        failed=1
      fi
    elif ! cmp -s "$source_path" "$vendor_path"; then
      echo "post-copy governed file differs: $path" >&2
      failed=1
    fi
  done

  list_tests "$source_snapshot" >"$upstream_test_list"
  list_tests "$vendor" >"$vendor_test_list"
  if ! diff -u "$upstream_test_list" "$vendor_test_list"; then
    failed=1
  fi
  while IFS= read -r test_name; do
    if ! cmp -s "$source_snapshot/$test_name" "$vendor/$test_name"; then
      echo "post-copy governed test differs: $test_name" >&2
      failed=1
    fi
  done <"$upstream_test_list"

  if [[ ${STYLEE_MODEL_SYNC_TEST_FAIL_CONTENT_VALIDATION:-0} == 1 ]]; then
    echo "injected post-copy content validation failure" >&2
    failed=1
  fi
  [[ $failed -eq 0 ]] || die "post-copy content validation failed; pin was not updated"
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

[[ -f "$governed_paths_file" ]] \
  || die "governed path list is missing: $governed_paths_file"
[[ -d "$vendor" ]] || die "model-service mirror is missing: $vendor"
[[ ! -L "$vendor" ]] || die "model-service mirror root must not be a symlink: $vendor"
command -v rsync >/dev/null 2>&1 || die "rsync is required"

governed_paths=()
while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  validate_relative_path "$path"
  [[ -e "$source_snapshot/$path" ]] \
    || die "canonical governed path is missing: $path"
  if [[ -d "$source_snapshot/$path" ]]; then
    validate_destination_path "$path" directory
    reject_nested_destination_symlinks "$path"
  elif [[ -f "$source_snapshot/$path" ]]; then
    validate_destination_path "$path" regular
  else
    die "unsupported canonical governed path type: $path"
  fi
  governed_paths[${#governed_paths[@]}]=$path
done <"$governed_paths_file"
[[ ${#governed_paths[@]} -gt 0 ]] || die "governed path list is empty"

# Preflight the dynamic test set before mutating the mirror.
shopt -s nullglob
upstream_tests=("$source_snapshot"/test_*.py)
[[ ${#upstream_tests[@]} -gt 0 ]] \
  || die "canonical checkout has no root test_*.py files"
for test_path in "${upstream_tests[@]}"; do
  test_name=${test_path##*/}
  validate_destination_path "$test_name" regular
done
vendor_tests=("$vendor"/test_*.py)
for test_path in "${vendor_tests[@]}"; do
  test_name=${test_path##*/}
  validate_destination_path "$test_name" regular
done
validate_destination_path UPSTREAM_COMMIT regular

for path in "${governed_paths[@]}"; do
  if [[ -d "$source_snapshot/$path" ]]; then
    mkdir -p "$vendor/$path"
    rsync --archive --delete \
      --exclude '__pycache__/' \
      --exclude '*.pyc' \
      "$source_snapshot/$path/" "$vendor/$path/"
  elif [[ -f "$source_snapshot/$path" ]]; then
    mkdir -p "$(dirname "$vendor/$path")"
    cp -p "$source_snapshot/$path" "$vendor/$path"
  else
    die "unsupported canonical governed path type: $path"
  fi
done

for test_path in "${vendor_tests[@]}"; do
  test_name=${test_path##*/}
  if [[ ! -f "$source_snapshot/$test_name" ]]; then
    rm -f -- "$test_path"
  fi
done
for test_path in "${upstream_tests[@]}"; do
  test_name=${test_path##*/}
  cp -p "$test_path" "$vendor/$test_name"
done

validate_synced_content

pin_temp=$(mktemp "$vendor/.UPSTREAM_COMMIT.tmp.XXXXXX") \
  || die "cannot create temporary pin file"
[[ -f "$pin_temp" && ! -L "$pin_temp" ]] \
  || die "temporary pin is not a regular file"
printf '%s\n' "$canonical_sha" >"$pin_temp"
chmod 0644 "$pin_temp"
validate_destination_path UPSTREAM_COMMIT regular
mv -f -- "$pin_temp" "$vendor/UPSTREAM_COMMIT"
pin_temp=''

echo "model-service mirror matches canonical checkout $canonical_sha"
