#!/usr/bin/env bash
# PreToolUse hook (MCP) — Layer 2 of the prod guard, covering what Bash-only
# guarding misses: browser navigation (mcp__claude-in-chrome__navigate /
# tabs_create) can otherwise reach ANY url including production, and tracker
# writes (mcp__atlassian__*) are otherwise unbounded.
#
# Mirrors block-risky-bash.sh: jq -> python3 -> FAIL CLOSED. Never fail open.
# Contract: JSON on stdin. exit 0 = allow. exit 2 = block (stderr shown to
# Claude). bash 3.2 compatible.
#
# Navigation policy: allow localhost/127.0.0.1, the hosts of
# project.app.primaryBaseUrl / secondaryBaseUrl, and any host listed in
# project.app.allowedHosts (staging/uat). Block anything matching
# project.productionProtection.prodUrlPatterns, and any other host.
# Tracker-write policy: if QA_ACTIVE_TICKET is exported, block writes to any
# other issue key; otherwise log the write target to stderr so it is visible
# in the transcript (never silently unbounded).

set -uo pipefail

INPUT="$(cat)"
CONFIG=".claude/project-config.json"

have_jq=0; have_py=0
command -v jq >/dev/null 2>&1 && have_jq=1
command -v python3 >/dev/null 2>&1 && have_py=1
if [ "$have_jq" -eq 0 ] && [ "$have_py" -eq 0 ]; then
  echo "BLOCKED: cannot parse the hook payload — neither jq nor python3 is installed, so the MCP guard cannot run. Install jq (brew install jq) or remove this hook from .claude/settings.json if you accept the risk." >&2
  exit 2
fi

# field <key>: read a top-level or tool_input field from the stdin payload.
field() {
  if [ "$have_jq" -eq 1 ]; then
    printf '%s' "$INPUT" | jq -r "$1 // empty" 2>/dev/null || true
  else
    printf '%s' "$INPUT" | python3 -c 'import json,sys
path=sys.argv[1].lstrip(".").split(".")
try:
    d=json.load(sys.stdin)
    for p in path:
        d=d.get(p) if isinstance(d,dict) else None
    print(d or "")
except Exception:
    pass' "$1" 2>/dev/null || true
  fi
}

# cfg_list <jq-path>: newline-separated list from project-config.json.
cfg_list() {
  [ -f "$CONFIG" ] || return 0
  if [ "$have_jq" -eq 1 ]; then
    jq -r "$1 // empty" "$CONFIG" 2>/dev/null || true
  else
    python3 - "$CONFIG" "$1" <<'PY' 2>/dev/null || true
import json,sys
cfg=json.load(open(sys.argv[1]))
path=[p for p in sys.argv[2].replace("[]?","").lstrip(".").split(".") if p]
d=cfg
for p in path:
    d=d.get(p) if isinstance(d,dict) else None
if isinstance(d,list):
    print("\n".join(str(x) for x in d))
elif d:
    print(d)
PY
  fi
}

TOOL="$(field '.tool_name')"
if [ -z "$TOOL" ]; then
  echo "BLOCKED: could not determine the tool from the hook payload — the MCP guard fails closed on unparseable input." >&2
  exit 2
fi
# Server names vary by connection style (local `atlassian` vs claude.ai's
# `claude_ai_Atlassian`) — match case-insensitively so neither slips through.
TOOL_LC="$(printf '%s' "$TOOL" | tr '[:upper:]' '[:lower:]')"

host_of() { printf '%s' "$1" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#[/:?"#].*$##'; }

case "$TOOL_LC" in
  *claude-in-chrome*navigate*|*claude-in-chrome*tabs_create*)
    URL="$(field '.tool_input.url')"
    [ -n "$URL" ] || exit 0                      # blank tab / no target
    case "$URL" in
      about:blank|chrome://*) exit 0 ;;
      http://*|https://*) ;;
      *) exit 0 ;;                               # relative path — resolves against the app's own baseUrl
    esac

    # 1. Production patterns block regardless of host allowlist.
    while IFS= read -r pattern; do
      [ -n "$pattern" ] || continue
      if printf '' | grep -qE -e "$pattern" 2>/dev/null || [ $? -eq 1 ]; then
        if printf '%s' "$URL" | grep -qiE -e "$pattern"; then
          echo "BLOCKED: navigation target matches a configured production URL pattern ($pattern). Tests and exploration never touch production." >&2
          exit 2
        fi
      fi
    done < <(cfg_list '.project.productionProtection.prodUrlPatterns[]?')

    # 2. Host allowlist: localhost + configured app hosts + explicit allowedHosts.
    HOST="$(host_of "$URL")"
    case "$HOST" in localhost|127.0.0.1|::1) exit 0 ;; esac
    while IFS= read -r allowed; do
      [ -n "$allowed" ] || continue
      case "$allowed" in http://*|https://*) allowed="$(host_of "$allowed")" ;; esac
      [ "$HOST" = "$allowed" ] && exit 0
    done < <({ cfg_list '.project.app.primaryBaseUrl'; cfg_list '.project.app.secondaryBaseUrl'; cfg_list '.project.app.allowedHosts[]?'; })

    echo "BLOCKED: navigation to unallowed host '$HOST'. Allowed: localhost, the hosts of project.app.primaryBaseUrl/secondaryBaseUrl, and project.app.allowedHosts. Add the host there if this is a legitimate staging/uat target." >&2
    exit 2
    ;;

  *atlassian*addcomment*|*atlassian*create*|*atlassian*edit*|*atlassian*update*|*atlassian*transition*|*atlassian*delete*)
    KEY="$(field '.tool_input.issueIdOrKey')"
    if [ -n "${QA_ACTIVE_TICKET:-}" ] && [ -n "$KEY" ] && [ "$KEY" != "$QA_ACTIVE_TICKET" ]; then
      echo "BLOCKED: tracker write targets '$KEY' but this run is scoped to '$QA_ACTIVE_TICKET' (QA_ACTIVE_TICKET). A stray or duplicated write to another ticket is exactly what this guard exists to stop." >&2
      exit 2
    fi
    echo "mcp-guard: tracker write via $TOOL -> ${KEY:-<no issue key in payload>} (export QA_ACTIVE_TICKET=<KEY> to enforce per-ticket scoping)" >&2
    exit 0
    ;;
esac

exit 0
