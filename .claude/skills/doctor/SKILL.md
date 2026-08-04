---
name: doctor
description: Local environment preflight for the TCA Cypress suite. Use when the user says "doctor", "check my env", "why won't tests run", "is everything up", or before a QA run. Verifies Node version, ELECTRON_RUN_AS_NODE, both backends, DB connectivity, and required env keys.
---

# TCA QA Doctor

Run a one-shot preflight that surfaces the blockers which repeatedly cost time before a Cypress
run, then interpret the result for the user.

## Run it

```bash
bash scripts/qa-doctor.sh
```

This checks, in order:
1. **Node version** — Cypress bootstrap fails on Node < 20 in this repo (the `tsx --loader` blocker).
2. **`ELECTRON_RUN_AS_NODE`** — must be unset, otherwise `cypress run` is blocked.
3. **Whiz** reachable at `http://localhost:4000/api/health`.
4. **Phizz** reachable at `http://localhost:3000`.
5. **`cypress.env.json`** present with the required login + DB keys (the file is gitignored/local).
6. **Databases** — `SELECT 1` against both the Whiz and Phizz Postgres DBs (`scripts/db-ping.js`).

## Interpret the output

- **All green** → tell the user they're ready and show the run command.
- **Node < 20** → the fix is `eval "$(fnm env)"; fnm use 20` (see the run procedure).
- **`ELECTRON_RUN_AS_NODE` set** → `unset ELECTRON_RUN_AS_NODE`.
- **A backend down** → that backend's server isn't running; do NOT try to "fix" tests against it —
  it's an environment issue. Phizz down blocks all `phizz-module` specs.
- **DB unreachable** → check the DB is running and the creds in `cypress.env.json` are correct;
  `before()` hooks that query tables will abort whole specs otherwise.
- **Missing env keys** → list them; tests depending on them will fail with auth/data errors.

Report a short checklist (✓/✗ per item) and, if anything failed, the exact remediation command.
Do not run the test suite from this skill — its job is only to confirm the environment is sane.
