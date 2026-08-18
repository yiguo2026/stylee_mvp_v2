#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd -P)
root=$(cd "$script_dir/.." && pwd -P)
vendor="$root/model-service"
governed_paths_file="$script_dir/model-service-governed-paths.txt"
upstream_arg=${1:-}

die() {
  echo "model-service sync: $*" >&2
  exit 1
}

validate_relative_path() {
  local path=$1
  case "$path" in
    ''|.|..|/*|../*|*/../*|*/..|*//*|*/)
      die "unsafe governed path: $path"
      ;;
  esac
}

validate_mirror_target() {
  local path=$1
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
    if [[ -d "$upstream/$path" && ! -d "$current" ]]; then
      die "governed mirror directory has the wrong type: $path"
    fi
    if [[ -f "$upstream/$path" && ! -f "$current" ]]; then
      die "governed mirror file has the wrong type: $path"
    fi
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

[[ -f "$governed_paths_file" ]] \
  || die "governed path list is missing: $governed_paths_file"
[[ -d "$vendor" ]] || die "model-service mirror is missing: $vendor"
[[ ! -L "$vendor" ]] || die "model-service mirror root must not be a symlink: $vendor"
command -v rsync >/dev/null 2>&1 || die "rsync is required"

governed_paths=()
while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  validate_relative_path "$path"
  [[ -e "$upstream/$path" ]] \
    || die "canonical governed path is missing: $path"
  validate_mirror_target "$path"
  governed_paths[${#governed_paths[@]}]=$path
done <"$governed_paths_file"
[[ ${#governed_paths[@]} -gt 0 ]] || die "governed path list is empty"

# Preflight the dynamic test set before mutating the mirror.
shopt -s nullglob
upstream_tests=("$upstream"/test_*.py)
[[ ${#upstream_tests[@]} -gt 0 ]] \
  || die "canonical checkout has no root test_*.py files"

for path in "${governed_paths[@]}"; do
  if [[ -d "$upstream/$path" ]]; then
    mkdir -p "$vendor/$path"
    rsync --archive --delete \
      --exclude '__pycache__/' \
      --exclude '*.pyc' \
      "$upstream/$path/" "$vendor/$path/"
  elif [[ -f "$upstream/$path" ]]; then
    mkdir -p "$(dirname "$vendor/$path")"
    cp -p "$upstream/$path" "$vendor/$path"
  else
    die "unsupported canonical governed path type: $path"
  fi
done

vendor_tests=("$vendor"/test_*.py)
for test_path in "${vendor_tests[@]}"; do
  test_name=${test_path##*/}
  if [[ ! -f "$upstream/$test_name" ]]; then
    rm -f -- "$test_path"
  fi
done
for test_path in "${upstream_tests[@]}"; do
  test_name=${test_path##*/}
  cp -p "$test_path" "$vendor/$test_name"
done

printf '%s\n' "$canonical_sha" >"$vendor/UPSTREAM_COMMIT"
bash "$script_dir/check-model-service-sync.sh" "$upstream"
