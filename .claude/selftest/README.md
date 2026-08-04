# Selftest fixtures

Bundled inputs for `/qa-selftest` — the regression suite for the `.claude/` folder itself. Nothing here is a real ticket or a runnable test:

- `SELFTEST-1.json` / `SELFTEST-1-analysis.md` / `SELFTEST-1.md` — a fake ticket trio (context, code analysis, manual cases) used to dry-run the generation pipeline offline, with no Jira and no backend.
- `specs/good-api-spec.cy.js.fixture` — a spec that must PASS every validate-spec hard gate.
- `specs/bad-api-spec.cy.js.fixture` — a spec that must be FLAGGED by Checks 9 (5xx accepted), 9b (ambiguous 2xx/4xx), and 11 (mutation without DB assertion).

The spec fixtures carry a `.fixture` suffix on purpose: pre-commit hooks scan staged `*.cy.js` files, and the bad fixture would (correctly) fail them. `/qa-selftest` copies them into a temp dir with their real names at run time.

Do not "fix" `bad-api-spec` — being broken is its job.
