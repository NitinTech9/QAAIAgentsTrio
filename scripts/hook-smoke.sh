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

exit $fail
