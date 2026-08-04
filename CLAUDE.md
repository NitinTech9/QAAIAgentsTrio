# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cypress E2E regression suite (~910 spec files, ~3,300 tests, API + UI) for the TCA platform. It tests **two separate backends**:

- **Whiz** — main TCA platform, `http://localhost:4000` (28 API module folders under `cypress/e2e/API/`)
- **Phizz** — claims management, `http://localhost:3000` (`cypress/e2e/API/phizz-module/`)

Credentials and DB config live in `cypress.env.json` (git-ignored; copy from `cypress.env.example.json`).

## Running tests — environment prerequisites (critical)

Cypress fails to start under the default Node 18 and with `ELECTRON_RUN_AS_NODE=1` (which this harness sets). Prefix every run with:

```bash
fnm use 20 && unset ELECTRON_RUN_AS_NODE
```

API tests also need the relevant backend running (Whiz :4000, Phizz :3000) and seed data. Run `npm run doctor` (or the `/doctor` skill) to preflight Node version, backends, DB connectivity, and env keys before a run.

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
npm run cy:run:allure          # run with Allure enabled, then generate + open report
npm run hooks:install          # one-time per clone: enables pre-commit gate (.githooks)
```

Reports: Mochawesome HTML at `cypress/reports/html/index.html` (every headless run); Allure via the `allure:*` scripts. On `--spec` runs, mochawesome may log a harmless `after:run` "matched no report files" error.

## Testing standards (enforced)

Full conventions live in `CONTRIBUTING/testing-standards/` — read the relevant file before writing or reviewing tests. The load-bearing rules:

- **Never accept 5xx** in a status assertion, and no ambiguous `oneOf([2xx, 4xx])` — a test must be able to fail. A pre-commit hook and `/validate-spec` enforce this on new/changed specs (a legacy backlog in `admin-module/` predates the rule; don't add to it).
- **DB assertion on every mutation** (POST/PUT/DELETE) via the Cypress tasks to prove persistence.
- **Schema validation spec per API**, in `cypress/e2e/API/schema-validation/{whiz,phizz}/`, with the schema JSON under `cypress/fixtures/schemas/`.
- Per endpoint, cover where applicable: positive, schema, DB assertion (mutations), negative (400/404), and unauthenticated-rejected.
- Spec layout: one spec per endpoint where practical, `cypress/e2e/API/<module>/NN-verb-noun.cy.js`. Expanded multi-line `cy.api()` blocks; use the `authHeaders()` helper.
- Tags: `@PR`, `@Smoke`, `@Regression`, `@DataValidation`, `@SchemaValidation` (see `cypress/knowledge/tagging-strategy.json`).
- File-upload tests use `cypress/fixtures/dummy.pdf`.

## Auth quick reference

| Platform / role | Command |
|---|---|
| Whiz standard | `cy.loginAndGetSessionCookie()` → `@sessionCookie`, `@csrfToken` |
| Whiz admin | `cy.loginAndGetSessionCookieForAdminController()` |
| Whiz dealer | `cy.loginAndGetSessionCookieForDealer()` |
| Phizz | `cy.loginAndGetPhizzSessionCookie()` → `@phizzSessionCookie` |

- Whiz mutations require the `x-csrf-token` header (gorilla CSRF) or they 403.
- Phizz mutations require `X-CSRF-Token` from `cy.getPhizzCsrfToken()`. Phizz `/ext` + `/auth` routes instead use a `Phizz-Checksum` header = `SHA512(body + PHIZZ_AUTH_SALT)` via `cy.task("computeChecksum", …)` — no session/CSRF.

## Architecture

- `cypress/support/commands.js` — login commands (both platforms), CSRF, API helpers; `dataFactory.js` — Faker-based random data.
- `cypress/tasks/` — Node-side PostgreSQL tasks (separate Whiz DB and Phizz DB clients), registered in `cypress.config.js`. `queryDb` (Whiz) / `queryPhizzDb` (Phizz) for raw queries, plus purpose-built tasks (contract updates, cleanup, S3 download, `findDownloadedFile` polling).
- `cypress/e2e/pages/` — Page Object Model for UI tests. UI specs in `cypress/e2e/UI/<module>/`.
- `cypress/e2e/JiraTicket/` — regression specs linked to specific Jira bugs.
- `cypress/fixtures/` — request bodies, `swagger.json` (Whiz) / `phizz-swagger.json` (Phizz) (used by `/audit-coverage`), `schemas/`.
- Environment selected via `CYPRESS_ENV` (local/staging/uat), mapped to baseUrl in `cypress.config.js`. Failed tests retry once.
- `docs/.ticket-context/` — Jira agent pipeline state per ticket (`docs/` is git-ignored). Delete `<ticket>-pipeline-state.json` or append `force` to re-run a stuck agent pipeline.

## Knowledge base — read before, write after

`cypress/knowledge/*.json` is active memory for test generation/fixing (see `cypress/knowledge/_README.md` for the full protocol):

- **Before** generating or fixing tests: check `api-behavior-notes.json` (known 5xx bugs and quirks — never write a test expecting 200 from a known-broken endpoint), `api-dependency-map.json` (tables, cleanup order, auth roles per module), and `failure-patterns.json` (match errors against known `FP-###` fixes before re-diagnosing).
- **After** any suite change or discovery: update the matching knowledge file **in the same change** — `api-catalog.json` for spec adds/moves/renames, next `FP-###` for new recurring failures, etc. Validate edited JSON with `node -e "JSON.parse(...)"`.
- `test-run-history.json` is appended automatically on every run; a test flipping pass/fail there is flaky — don't "fix" a flake as if it were a bug.

## AI skills and Jira agents

Local skills (no Jira needed): `/qa` (run + fix + report), `/qa-only` (read-only), `/fix-test`, `/generate-api-test`, `/generate-ui-test`, `/add-test-cases`, `/audit-coverage`, `/doctor`.

Jira agent pipeline (requires Atlassian MCP): run `@manual-test-generator TCA-XXXX` **first** — the `@api-automation-test-generator`, `@ui-automation-test-generator`, and `@postman-collection-generator` agents depend on manual test cases existing on the ticket. `@ui-automation-test-generator` additionally **explores the live app in a browser** (`/explore-live-app`) to capture verified selectors, DOM/async behavior, exact error text, and DB test data before writing the spec — so it needs the **browser MCP (`claude-in-chrome`) connected and the app running** (Whiz :4000 / Phizz :3000). It uses Option-A auth: auto-detects an existing browser session, and only if none is live pauses for you to log in (it never types your password; the generated specs still log in programmatically). Individual pipeline steps (`/fetch-ticket`, `/analyze-code`, `/explore-live-app`, `/validate-spec`, `/run-tests`, `/post-tests-to-jira`, …) are in `.claude/commands/`. See `AI-AUTOMATION-GUIDE.md` for details.

## Git & PR conventions

- Branch off `main`; Conventional Commits (`feat:`, `fix:`, `test:`).
- **No `Co-Authored-By` trailer** — a repo hook blocks it.
- Stage only test/schema files; never commit `.claude/settings.json` changes or `cypress.env.json`.
- Run `npm run cy:pr` before opening a PR; use the `/pr` skill (auto-detects the Jira ticket from the branch name, targets `main`).
