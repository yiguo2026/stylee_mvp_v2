#!/usr/bin/env bash
set -euo pipefail

upstream=${1:-}
if [[ -z "$upstream" || ! -d "$upstream/stylee" ]]; then
  echo "usage: $0 /path/to/style-model" >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/.." && pwd)
vendor="$root/model-service"
failed=0

check_path() {
  local path=$1
  if ! diff -qr "$upstream/$path" "$vendor/$path" --exclude=__pycache__ --exclude='*.pyc'; then
    failed=1
  fi
}

check_path stylee
for path in serve.py Dockerfile .dockerignore render.yaml .env.example ARCHITECTURE.md; do
  check_path "$path"
done

for path in scripts/build_exemplars.py scripts/build_index.py scripts/download_garments2look.py scripts/ingest_smoke.py; do
  check_path "$path"
done

for path in test_ai_features.py test_embeddings.py test_provider_http.py test_provider_parse.py test_rag.py test_scoring.py test_security.py test_service.py test_vision.py; do
  check_path "$path"
done

if [[ $failed -ne 0 ]]; then
  echo "model-service vendored copy differs from style-model" >&2
  exit 1
fi

echo "model-service vendored copy matches style-model"
