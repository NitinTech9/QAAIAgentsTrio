# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Template note:** this is an example CLAUDE.md for a QA repo using this framework. This repo intentionally contains **no test suite** — only the framework under `.claude/` and its docs; the Cypress suite described below is what your repo will look like *after* you run `/qa-init` (or copy the framework into an existing suite). Replace every `<placeholder>` and the example values with your project's real ones, and delete sections that don't apply.

## What this is

Cypress E2E regression suite (API + UI) for `<your product>`. It tests:

- **Primary backend** — `<your main app>`, `http://localhost:4000` (API module folders under `cypress/e2e/API/`)
- **Secondary backend** *(optional — delete if you only test one)* — `<second app>`, `http://localhost:3000` (`cypress/e2e/API/<secondary-app>-module/`)

Credentials and DB config live in `cypress.env.json` (git-ignored; copy from `cypress.env.example.json`).

## Running tests — environment prerequisites

Document here anything Cypress needs before it will start on a dev machine (Node version, env vars that must be set/unset, VPN, etc.). Note: when run from the Claude Code harness, `ELECTRON_RUN_AS_NODE=1` is set and must be unset or Cypress fails to bootstrap.

API tests also need the relevant backend running and seed data. Run `npm run doctor` (or the `/doctor` skill) to preflight Node version, backends, DB connectivity, and env keys before a run.

## Commands

```bash
npm run cy:run                 # all tests, headless Chrome
npm run cy:api / cy:ui         # API-only / UI-only
npm run cy:pr                  # @PR-tagged tests — must pass before opening a PR
npm run cy:smoke               # @Smoke — post-deploy sanity
npm run cy:regression          # @Regression — full pass

# Single spec
npx cypress run --spec "cypress/e2e/API/auth-module/01-login.cy.js"

npx cypress open               # GUI mode
npm run hooks:install          # one-time per clone: enables pre-commit gate (.githooks)
```

Reports: Mochawesome HTML at `cypress/reports/html/index.html` (every headless run).

## Testing standards (enforced)

Full conventions live in `CONTRIBUTING/testing-standards/` — read the relevant file before writing or reviewing tests. The load-bearing rules:

- **Never accept 5xx** in a status assertion, and no ambiguous `oneOf([2xx, 4xx])` — a test must be able to fail. A pre-commit hook and `/validate-spec` enforce this on new/changed specs.
- **DB assertion on every mutation** (POST/PUT/DELETE) via the Cypress tasks to prove persistence.
- **Schema validation spec per API**, in `cypress/e2e/API/schema-validation/{primary,secondary}/`, with the schema JSON under `cypress/fixtures/schemas/`.
- Per endpoint, cover where applicable: positive, schema, DB assertion (mutations), negative (400/404), and unauthenticated-rejected.
- Spec layout: one spec per endpoint where practical, `cypress/e2e/API/<module>/NN-verb-noun.cy.js`. Expanded multi-line `cy.api()` blocks.
- Tags: `@PR`, `@Smoke`, `@Regression`, `@DataValidation`, `@SchemaValidation` (see `cypress/knowledge/tagging-strategy.json`).
- File-upload tests use `cypress/fixtures/dummy.pdf`.

## Auth quick reference

| Platform / role | Command |
|---|---|
| Primary app standard | `cy.loginAndGetSessionCookie()` → `@sessionCookie`, `@csrfToken` |
| `<other roles / secondary app>` | `<add your other login commands here>` |

- Document your app's CSRF requirement here (e.g. mutations require an `x-csrf-token` header or they 403).
- Document any non-session auth schemes (bearer tokens, request checksums) your endpoints use.

## Architecture

- `cypress/support/commands.js` — login commands, CSRF, API helpers; `dataFactory.js` — Faker-based random data.
- `cypress/tasks/` — Node-side PostgreSQL tasks, registered in `cypress.config.js`. `queryDb` (primary) / `querySecondaryDb` (secondary, if any) for raw queries, plus purpose-built setup/cleanup tasks.
- `cypress/e2e/pages/` — Page Object Model for UI tests. UI specs in `cypress/e2e/UI/<module>/`.
- `cypress/e2e/JiraTicket/` — regression specs linked to specific Jira bugs.
- `cypress/fixtures/` — request bodies, `swagger.json` (primary) / `secondary-swagger.json` (secondary) (used by `/audit-coverage`), `schemas/`.
- Environment selected via `CYPRESS_ENV` (local/staging/uat), mapped to baseUrl in `cypress.config.js`. Failed tests retry once.
- `docs/.ticket-context/` — Jira agent pipeline state per ticket (`docs/` is git-ignored). Delete `<ticket>-pipeline-state.json` or append `force` to re-run a stuck agent pipeline; append `force-lock` if a dead run left a fresh run lock behind. State writes are atomic (temp→rename) with per-agent lock domains, so API and UI automation can safely run in parallel on the same ticket.

## Knowledge base — read before, write after

`cypress/knowledge/*.json` is active memory for test generation/fixing (see `cypress/knowledge/_README.md` for the full protocol):

- **Before** generating or fixing tests: check `api-behavior-notes.json` (known 5xx bugs and quirks — never write a test expecting 200 from a known-broken endpoint), `api-dependency-map.json` (tables, cleanup order, auth roles per module), and `failure-patterns.json` (match errors against known `FP-###` fixes before re-diagnosing).
- **After** any suite change or discovery: update the matching knowledge file **in the same change** — `api-catalog.json` for spec adds/moves/renames, next `FP-###` for new recurring failures, etc. Validate edited JSON with `node -e "JSON.parse(...)"`.
- `test-run-history.json` is appended automatically on every run; a test flipping pass/fail there is flaky — don't "fix" a flake as if it were a bug.

## AI skills and Jira agents

Local skills (no Jira needed): `/qa-init` (first-time project scaffolding — Cypress+JS or Playwright+JS, chosen at runtime; `/qa-init demo` for a no-backend sandbox), `/qa-help` (setup-state checker — "what do I do next?"), `/qa-selftest` (regression suite for the `.claude/` folder itself — run after adapting or upgrading the framework; `quick` for the deterministic phases only), `/qa` (run + fix + report), `/qa-only` (read-only), `/fix-test`, `/generate-api-test`, `/generate-ui-test`, `/add-test-cases`, `/audit-coverage`, `/doctor`.

All four agents accept `auto` (non-interactive: no prompts, Jira posting skipped) and `auto-post` (with `auto`: allow the Jira writes) for CI/scheduled runs — see `ci/qa-pr-gate.example.yml` for a GitHub Actions PR gate. `.claude/project-config.json` is validated against `.claude/schemas/project-config.schema.json` (editors pick it up via the config's `$schema` key; `/doctor` Check 0 enforces it).

The test framework is set in `.claude/project-config.json` (`testFramework`), and each framework's syntax/conventions live in `.claude/templates/<framework>-javascript.md` — generation and validation commands follow the template for the configured framework.

Jira agent pipeline (requires Atlassian MCP): run `@manual-test-generator PROJ-XXXX` **first** — the `@api-automation-test-generator`, `@ui-automation-test-generator`, and `@postman-collection-generator` agents depend on manual test cases existing on the ticket. `@ui-automation-test-generator` additionally **explores the live app in a browser** (`/explore-live-app`) to capture verified selectors, DOM/async behavior, exact error text, and DB test data before writing the spec — so it needs the **browser MCP (`claude-in-chrome`) connected and the app running**. It uses Option-A auth: auto-detects an existing browser session, and only if none is live pauses for you to log in (it never types your password; the generated specs still log in programmatically). Individual pipeline steps (`/fetch-ticket`, `/analyze-code`, `/explore-live-app`, `/validate-spec`, `/run-tests`, `/post-tests-to-jira`, …) are in `.claude/commands/`. See `AI-AUTOMATION-GUIDE.md` for details.

## Git & PR conventions

- Branch off `main`; Conventional Commits (`feat:`, `fix:`, `test:`).
- **No `Co-Authored-By` trailer** — a repo hook blocks it.
- Stage only test/schema files; never commit `.claude/settings.json` changes or `cypress.env.json`.
- Run `npm run cy:pr` before opening a PR; use the `/pr` skill (auto-detects the Jira ticket from the branch name, targets `main`).
