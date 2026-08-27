#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <deploy|cleanup> <dist-dir> <pages-dir> <preview-path>" >&2
  exit 2
fi

action="$1"
dist_dir="$2"
pages_dir="$3"
preview_path="$4"

case "$action" in
  deploy|cleanup) ;;
  *)
    echo "unsupported preview action: $action" >&2
    exit 2
    ;;
esac

if [[ ! "$preview_path" =~ ^preview/[a-z0-9][a-z0-9-]*$ ]]; then
  echo "unsafe preview path: $preview_path" >&2
  exit 2
fi

if [ ! -d "$pages_dir" ]; then
  echo "pages directory not found: $pages_dir" >&2
  exit 2
fi

destination="$pages_dir/$preview_path"

if [ "$action" = 'deploy' ]; then
  if [ ! -f "$dist_dir/index.html" ]; then
    echo "preview build not found: $dist_dir/index.html" >&2
    exit 2
  fi

  rm -rf -- "$destination"
  mkdir -p "$destination"
  cp -R "$dist_dir/." "$destination/"
  echo "deployed $preview_path"
else
  rm -rf -- "$destination"
  echo "cleaned $preview_path"
fi
