#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
PROJECT_DIR="stylee_mvp_v2"
CURRENT_DIR=$(basename "$(pwd)")

# Check directory
if [ "$CURRENT_DIR" != "$PROJECT_DIR" ]; then
  echo "BLOCKED: Not in $PROJECT_DIR directory! Current: $(pwd)" >&2
  exit 2
fi

# Check branch for git push
if echo "$COMMAND" | grep -qE '\bgit push\b'; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  if [ "$BRANCH" != "main" ]; then
    echo "BLOCKED: Not on main branch (current: $BRANCH). Vercel production deploys from main." >&2
    exit 2
  fi
fi

# Check branch for vercel deploy
if echo "$COMMAND" | grep -qE '\bvercel\b'; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  if [ "$BRANCH" != "main" ]; then
    echo "WARNING: Not on main branch (current: $BRANCH). Vercel production deploys from main." >&2
  fi
fi

exit 0
