#!/usr/bin/env bash
# Hook exit-code smoke tests — the payload/exit table from qa-selftest.md Phase 1.
# Guards against a hook that exits 0 on everything (fails open).
set -u
cd "$(dirname "$0")/.."
fail=0

t() { # t <hook> <payload> <expected-exit> <label>
  echo "$2" | ".claude/hooks/$1" >/dev/null 2>&1
  actual=$?
  if [ "$actual" -eq "$3" ]; then echo "PASS  $1: $4"
  else echo "FAIL  $1: $4 (expected exit $3, got $actual)"; fail=1; fi
}

t block-risky-bash.sh '{"tool_input":{"command":"git commit -m \"x\" --trailer \"Co-Authored-By: a\""}}' 2 "blocks Co-Authored-By trailer"
t block-risky-bash.sh '{"tool_input":{"command":"git push --force origin main"}}' 2 "blocks force push"
t block-risky-bash.sh '{"tool_input":{"command":"NODE_ENV=production npx cypress run"}}' 2 "blocks production runs"
t block-risky-bash.sh '{"tool_input":{"command":"npx cypress run --spec x.cy.js"}}' 0 "allows normal cypress run"
t block-risky-bash.sh '{"tool_input":{"command":"git log --oneline"},"description":"mentions co-authored-by"}' 0 "does not over-match outside command field"
t block-secret-writes.sh '{"tool_input":{"file_path":"/x/.env"}}' 2 "blocks .env writes"
t block-secret-writes.sh '{"tool_input":{"file_path":"/x/cypress/e2e/API/01-login.cy.js"}}' 0 "allows spec writes"

# --- block-risky-mcp.sh — run in a temp project so the config under test is controlled
MCP_HOOK="$PWD/.claude/hooks/block-risky-mcp.sh"
TMPPROJ=$(mktemp -d)
mkdir -p "$TMPPROJ/.claude"
cat > "$TMPPROJ/.claude/project-config.json" <<'JSON'
{"project":{"app":{"primaryBaseUrl":"http://localhost:4000","secondaryBaseUrl":null,"allowedHosts":["staging.example.com"]},"productionProtection":{"prodUrlPatterns":["prod\\.example\\.com"]}}}
JSON

tm() { # tm <payload> <expected-exit> <label> [env]
  ( cd "$TMPPROJ" && printf '%s' "$1" | env ${4:-QA_SMOKE=1} bash "$MCP_HOOK" >/dev/null 2>&1 )
  actual=$?
  if [ "$actual" -eq "$2" ]; then echo "PASS  block-risky-mcp.sh: $3"
  else echo "FAIL  block-risky-mcp.sh: $3 (expected exit $2, got $actual)"; fail=1; fi
}

tm '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"http://localhost:4000/login"}}' 0 "allows localhost navigate"
tm '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://staging.example.com/orders"}}' 0 "allows allowlisted staging host"
tm '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://prod.example.com/admin"}}' 2 "blocks production URL pattern"
tm '{"tool_name":"mcp__claude-in-chrome__navigate","tool_input":{"url":"https://evil.example.net/"}}' 2 "blocks navigate to unrelated host"
tm 'not-json{{' 2 "blocks unparseable payload (fail closed)"
tm '{"tool_name":"mcp__atlassian__addCommentToJiraIssue","tool_input":{"issueIdOrKey":"PROJ-2"}}' 2 "blocks tracker write outside QA_ACTIVE_TICKET scope" "QA_ACTIVE_TICKET=PROJ-1"
tm '{"tool_name":"mcp__atlassian__addCommentToJiraIssue","tool_input":{"issueIdOrKey":"PROJ-1"}}' 0 "allows tracker write to the scoped ticket" "QA_ACTIVE_TICKET=PROJ-1"
tm '{"tool_name":"mcp__atlassian__addCommentToJiraIssue","tool_input":{"issueIdOrKey":"PROJ-9"}}' 0 "logs (allows) unscoped tracker write when no QA_ACTIVE_TICKET"

# claude.ai connector server name (claude_ai_Atlassian, capital A) — the guard must
# match it case-insensitively, or granting write scopes opens a silent hole.
tm '{"tool_name":"mcp__claude_ai_Atlassian__addCommentToJiraIssue","tool_input":{"issueIdOrKey":"PROJ-2"}}' 2 "blocks out-of-scope write via claude_ai_Atlassian server name" "QA_ACTIVE_TICKET=PROJ-1"
tm '{"tool_name":"mcp__claude_ai_Atlassian__createJiraIssue","tool_input":{"issueIdOrKey":"PROJ-1"}}' 0 "allows scoped write via claude_ai_Atlassian server name" "QA_ACTIVE_TICKET=PROJ-1"

# the tracker-write case must actually FIRE for both names (a matched write logs
# "mcp-guard:" to stderr) — guards against the case-pattern silently not matching.
for name in mcp__atlassian__addCommentToJiraIssue mcp__claude_ai_Atlassian__addCommentToJiraIssue; do
  logged=$( (cd "$TMPPROJ" && printf '%s' "{\"tool_name\":\"$name\",\"tool_input\":{\"issueIdOrKey\":\"PROJ-9\"}}" | bash "$MCP_HOOK" 2>&1 >/dev/null) | grep -c "mcp-guard:" )
  if [ "$logged" -ge 1 ]; then echo "PASS  block-risky-mcp.sh: tracker-write case fires for $name"
  else echo "FAIL  block-risky-mcp.sh: tracker-write case did NOT fire for $name"; fail=1; fi
done

rm -rf "$TMPPROJ"
exit $fail
