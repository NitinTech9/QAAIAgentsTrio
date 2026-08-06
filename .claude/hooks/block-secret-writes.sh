#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit) — refuse to write secret-bearing files.
#
# Replaces the inline sed one-liner that used to live in settings.json. That version
# parsed the hook payload with a greedy sed capture and exited 0 whenever the pattern
# did not match — i.e. it failed OPEN. This one parses JSON properly and fails CLOSED.
#
# Contract: JSON on stdin. exit 0 = allow. exit 2 = block (stderr is shown to Claude).
# bash 3.2 compatible.

set -uo pipefail

INPUT="$(cat)"

# Extract .tool_input.file_path with the best parser available. If none is available we
# fall back to scanning the raw payload, which over-blocks rather than under-blocks.
FILE_PATH=""
PARSED=0
if command -v jq >/dev/null 2>&1; then
  FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)"
  PARSED=1
elif command -v python3 >/dev/null 2>&1; then
  FILE_PATH="$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin).get("tool_input", {})
    print(d.get("file_path") or d.get("path") or "")
except Exception:
    pass' 2>/dev/null || true)"
  PARSED=1
fi

# Basenames/suffixes that must never be written by an agent.
SECRET_PATTERNS='(^|/)\.env($|\.)|(^|/)cypress\.env\.json$|(^|/)secrets?\.(json|ya?ml|toml)$|(^|/)credentials(\.json)?$|\.(pem|key|p12|pfx)$|(^|/)id_(rsa|ed25519)$|(^|/)database\.ya?ml$'

if [ "$PARSED" -eq 0 ]; then
  # No JSON parser on this machine: scan the whole payload. Noisier, but never silent.
  if printf '%s' "$INPUT" | grep -qE "$SECRET_PATTERNS"; then
    echo "BLOCKED: payload references a secret-bearing file and no JSON parser (jq/python3) is available to confirm the target precisely. Install jq, or edit the file manually." >&2
    exit 2
  fi
  exit 0
fi

[ -n "$FILE_PATH" ] || exit 0

if printf '%s' "$FILE_PATH" | grep -qE "$SECRET_PATTERNS"; then
  echo "BLOCKED: $FILE_PATH holds credentials and must not be written by an agent." >&2
  echo "Edit it yourself, or point the config at a template file (e.g. cypress.env.example.json)." >&2
  exit 2
fi

exit 0
