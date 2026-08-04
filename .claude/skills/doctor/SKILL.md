---
name: doctor
description: Local environment preflight for the Cypress suite. Use when the user says "doctor", "check my env", "why won't tests run", "is everything up", or before a QA run. Verifies Node version, ELECTRON_RUN_AS_NODE, both backends, DB connectivity, and required env keys.
---

# QA Doctor

Run a one-shot preflight that surfaces the blockers which repeatedly cost time before a Cypress
run, then interpret the result for the user.

## Check the config first (Check 0)

Before the environment checks, validate `.claude/project-config.json` itself — a broken or half-filled config produces confusing agent failures that look like environment issues:

1. **Parses:** `node -e "JSON.parse(require('fs').readFileSync('.claude/project-config.json','utf8'))"`.
2. **Shape:** required keys present per `.claude/schemas/project-config.schema.json` — `project.name`, `testFramework` (`cypress`|`playwright`), `paths.{apiTests,uiTests,pages,support,fixtures,reports}`, `app.primaryBaseUrl`, `runCommand.headless` containing `{specFile}`. (Check structurally with an inline `node -e` script — do not assume `ajv` is installed.)
3. **Placeholders:** warn on `"YourProject"`, `"your-org.atlassian.net"`, empty `productCode.rootPaths` with no `project-config.local.json`, and `/absolute/path/to/your/...` in `.claude/settings.json`.
4. **Consistency:** `testFramework` matches the `paths` layout (e.g. `playwright` + `cypress/...` paths = mismatch → suggest `/qa-init` sync mode), and `.claude/templates/{testFramework}-javascript.md` exists.

Any Check-0 failure: report it with the exact fix and note that the environment checks below may be unreliable until config is fixed.

## Run it

```bash
bash scripts/qa-doctor.sh
```

If `scripts/qa-doctor.sh` does not exist in this repo, do not fail — perform the same checks directly with individual commands (`node --version`, `env | grep ELECTRON_RUN_AS_NODE`, `curl` the base URLs from config, check the env file exists, a `SELECT 1` per DB if `config.dbVerification` is not false).

This checks, in order:
1. **Node version** — Cypress bootstrap fails on Node < 20 in this repo (the `tsx --loader` blocker).
2. **`ELECTRON_RUN_AS_NODE`** — must be unset, otherwise `cypress run` is blocked.
3. **Primary backend** reachable at its configured base URL (e.g. `http://localhost:4000/api/health`).
4. **Secondary backend** (if your suite tests one) reachable at its base URL.
5. **`cypress.env.json`** present with the required login + DB keys (the file is gitignored/local).
6. **Databases** — `SELECT 1` against each Postgres DB the suite uses (`scripts/db-ping.js`).

## Interpret the output

- **All green** → tell the user they're ready and show the run command.
- **Node < 20** → switch to Node 20+ with your Node version manager (see the run procedure).
- **`ELECTRON_RUN_AS_NODE` set** → `unset ELECTRON_RUN_AS_NODE`.
- **A backend down** → that backend's server isn't running; do NOT try to "fix" tests against it —
  it's an environment issue. A down backend blocks every spec that targets it.
- **DB unreachable** → check the DB is running and the creds in `cypress.env.json` are correct;
  `before()` hooks that query tables will abort whole specs otherwise.
- **Missing env keys** → list them; tests depending on them will fail with auth/data errors.

Report a short checklist (✓/✗ per item) and, if anything failed, the exact remediation command.
Do not run the test suite from this skill — its job is only to confirm the environment is sane.
