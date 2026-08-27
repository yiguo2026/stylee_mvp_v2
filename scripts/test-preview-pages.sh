#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publisher="$repo_dir/scripts/preview-pages.sh"
fixture_dir="$(mktemp -d)"
trap 'rm -rf "$fixture_dir"' EXIT

dist_dir="$fixture_dir/dist"
pages_dir="$fixture_dir/pages"
preview_path="preview/outfit-19"

mkdir -p "$dist_dir/_expo" "$pages_dir"
printf '%s\n' 'preview-index' > "$dist_dir/index.html"
printf '%s\n' 'preview-bundle' > "$dist_dir/_expo/app.js"
printf '%s\n' 'production-index' > "$pages_dir/index.html"

bash "$publisher" deploy "$dist_dir" "$pages_dir" "$preview_path"

test "$(cat "$pages_dir/index.html")" = 'production-index'
test "$(cat "$pages_dir/$preview_path/index.html")" = 'preview-index'
test "$(cat "$pages_dir/$preview_path/_expo/app.js")" = 'preview-bundle'

if bash "$publisher" deploy "$dist_dir" "$pages_dir" '.'; then
  echo 'unsafe preview path was accepted' >&2
  exit 1
fi

bash "$publisher" cleanup "$dist_dir" "$pages_dir" "$preview_path"

test "$(cat "$pages_dir/index.html")" = 'production-index'
test ! -e "$pages_dir/$preview_path"

echo 'preview publisher contract: ok'
