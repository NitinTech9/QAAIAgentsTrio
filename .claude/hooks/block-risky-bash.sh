#!/usr/bin/env bash
# PreToolUse hook (Bash) — block destructive git and the forbidden commit trailer.
#
# Replaces the inline sed one-liner in settings.json, which had two defects:
#   1. its greedy capture ran past the "command" field to the last quote on the line, so a
#      tool description mentioning "co-authored-by" would trip the commit guard; and
#   2. a non-matching pattern left the variable empty and the hook exited 0 — fail OPEN.
# This version parses JSON, checks only the command, and fails CLOSED.
#
# Contract: JSON on stdin. exit 0 = allow. exit 2 = block (stderr is shown to Claude).
# bash 3.2 compatible.

set -uo pipefail

INPUT="$(cat)"

COMMAND=""
PARSED=0
if command -v jq >/dev/null 2>&1; then
  COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
  PARSED=1
elif command -v python3 >/dev/null 2>&1; then
  COMMAND="$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command") or "")
except Exception:
    pass' 2>/dev/null || true)"
  PARSED=1
fi

if [ "$PARSED" -eq 0 ]; then
  echo "BLOCKED: cannot parse the hook payload — neither jq nor python3 is installed, so the git safety guard cannot run. Install jq (brew install jq) or remove this hook from .claude/settings.json if you accept the risk." >&2
  exit 2
fi

[ -n "$COMMAND" ] || exit 0

# --- 1. Co-Authored-By trailer is prohibited in this repo's commits ---------
if printf '%s' "$COMMAND" | grep -qiE '(^|[^a-z])git[[:space:]]+commit' \
   && printf '%s' "$COMMAND" | grep -qi 'co-authored-by'; then
  echo "BLOCKED: this repo prohibits the Co-Authored-By trailer. Remove it from the commit message." >&2
  exit 2
fi

# --- 2. Destructive git operations require a human at the keyboard ----------
DESTRUCTIVE='git[[:space:]]+(push[[:space:]]+(-f|--force)([^-]|$)|push[[:space:]]+.*--force([^-]|$)|reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*[fd]|checkout[[:space:]]+--[[:space:]]+\.|branch[[:space:]]+-D)'
if printf '%s' "$COMMAND" | grep -qiE "$DESTRUCTIVE"; then
  echo "BLOCKED: destructive git command — run it yourself if you really mean it:" >&2
  printf '  %s\n' "$COMMAND" >&2
  exit 2
fi

# --- 3. Never let a test run point at production ----------------------------
# Layer 1 of the prod guard: the agents are also told this, but instructions are not
# enforcement. Patterns come from project-config.json when it is readable.
CONFIG=".claude/project-config.json"
PROD_PATTERNS='NODE_ENV=production|RAILS_ENV=production|APP_ENV=prod([^a-z]|$)|DJANGO_ENV=production|--env=prod([^a-z]|$)|CYPRESS_ENV=prod([^a-z]|$)'
if printf '%s' "$COMMAND" | grep -qiE "$PROD_PATTERNS"; then
  echo "BLOCKED: this command targets a production environment. Tests never run against production." >&2
  if command -v jq >/dev/null 2>&1 && [ -f "$CONFIG" ]; then
    echo "  Configured local base URL: $(jq -r '.project.app.primaryBaseUrl // "not set"' "$CONFIG" 2>/dev/null)" >&2
  fi
  exit 2
fi

if command -v jq >/dev/null 2>&1 && [ -f "$CONFIG" ]; then
  while IFS= read -r pattern; do
    [ -n "$pattern" ] || continue
    # grep exits 2 on an invalid regex — validate before trusting a user-supplied pattern.
    if printf '' | grep -qE -e "$pattern" 2>/dev/null || [ $? -eq 1 ]; then
      if printf '%s' "$COMMAND" | grep -qiE -e "$pattern"; then
        echo "BLOCKED: command matches a configured production URL pattern: $pattern" >&2
        exit 2
      fi
    fi
  done < <(jq -r '.project.productionProtection.prodUrlPatterns[]? // empty' "$CONFIG" 2>/dev/null || true)
fi

exit 0
