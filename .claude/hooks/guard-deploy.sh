#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
PROJECT_DIR="stylee_mvp_v2"
CURRENT_DIR=$(basename "$(pwd)")

# Check directory — must be in stylee_mvp_v2 for source repo push
if [ "$CURRENT_DIR" != "$PROJECT_DIR" ]; then
  echo "BLOCKED: Not in $PROJECT_DIR directory! Current: $(pwd)" >&2
  exit 2
fi

# Check branch for git push in source repo
if echo "$COMMAND" | grep -qE '\bgit push\b'; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  if [ "$BRANCH" != "main" ]; then
    echo "BLOCKED: Not on main branch (current: $BRANCH). GitHub Pages deploys from main." >&2
    exit 2
  fi
fi

# Block vercel commands — deployment is via GitHub Pages, not Vercel
if echo "$COMMAND" | grep -qE '\bvercel\b'; then
  echo "BLOCKED: This project deploys via GitHub Pages (yiguo2026.github.io), NOT Vercel. Use /deploy skill instead." >&2
  exit 2
fi

exit 0
