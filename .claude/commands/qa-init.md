---
description: Interactive first-time setup for a QA automation project — choose Cypress+JS or Playwright+JS at runtime, scaffold the folder structure and config files, and sync everything into .claude/project-config.json
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
argument-hint: '[optional: cypress|playwright] [demo]'
---

# QA Project Init (`/qa-init`)

You set up a brand-new QA automation project so the agents and skills in this framework have a real suite to work with. Run this ONCE, before any test cases are generated. You interview the user, scaffold the chosen framework, then write the resulting values (paths, run commands, framework, URLs) into `.claude/project-config.json` so every other command picks them up.

**Golden rules:**
1. **Never overwrite an existing file.** If a file you would create already exists, leave it and report `exists — skipped`. The command must be safe to re-run.
2. **Show the plan, then get one approval.** Present everything you will create/install as a single summary and ask once. No silent installs.
3. **Everything the interview decides ends up in `project-config.json`** — the other commands never read scaffold files directly for configuration.

## Demo Mode (`/qa-init demo`)

If `$ARGUMENTS` contains `demo`, skip the interview entirely and set up a try-it-in-10-minutes sandbox against a public API — no backend, no Jira, no credentials:

- Presets: `FRAMEWORK = cypress` (or `playwright` if also passed), `PRIMARY_URL = https://jsonplaceholder.typicode.com`, `DB = false`, `JIRA_CLOUD_ID = null`.
- Scaffold per Phase 2 with these adjustments: no login stub (the demo API is unauthenticated — write `auth.primary.loginCommand: null` in Phase 3 and set `dbVerification: false`), no `pg`, no env-file DB keys.
- **Sample specs** — one spec per endpoint (the demo is the first pattern people copy, so it must follow the standard), each `it()` titled `Test Case NN: [DEMO-1] …` per the framework template:
  - `<apiTests>/posts-module/01-get-posts.cy.js` — GET `/posts` is 200 + non-empty array (`@PR @Smoke`).
  - `<apiTests>/posts-module/02-get-post-by-id.cy.js` — GET `/posts/1` returns the post with id/title/body/userId (`@PR @Smoke`); GET `/posts/999999` is 404 (`@Regression`).
  - `<apiTests>/posts-module/03-post-create-post.cy.js` — POST `/posts` with title/body/userId returns 201 with an id (`@PR @Smoke`).
- **Seed a fake ticket** so the agent pipeline can be tried offline (the agents skip `fetch-ticket` when context already exists):
  - `docs/test-cases/DEMO-1.md` — two `- **Type:** API` sections: *Read posts* ("Verify that GET /posts returns 200 and a non-empty list", "Verify that GET /posts/{id} returns the post with id, title, body, userId", "Verify that GET /posts/999999 returns 404") and *Create post* ("Verify that POST /posts with title/body/userId returns 201 with an id").
  - `docs/.ticket-context/DEMO-1.json` — `{ "key": "DEMO-1", "summary": "Demo: posts API coverage", "issuetype": "Story", "description": "Cover the public posts API (demo ticket — not backed by Jira)." }`
  - `docs/.ticket-context/DEMO-1-analysis.md` — short stub: endpoints under `/posts`, unauthenticated, no DB access, no role gating.
- Phase 4 runs the sample spec (the public API is reachable from anywhere) and ends with demo-specific next steps:

> **Try the framework:**
> 1. `/qa-audit` — audit the demo suite and see a health report.
> 2. `@api-automation-test-generator DEMO-1 auto` — watch the full generation pipeline run offline (`auto` skips the Jira steps).
> 3. `/generate-api-test write tests for GET /comments` — generate a new spec from a plain description.
> When you're done exploring, re-run `/qa-init` in your real repo.

**Going real after the demo (cleanup):** the demo leaves artifacts that will sit alongside real data and pollute knowledge lookups. When switching this repo to a real product, delete: the demo specs (`<apiTests>/posts-module/`), the fake ticket files (`docs/test-cases/DEMO-1.md`, `docs/.ticket-context/DEMO-1*`), and any `jsonplaceholder`/demo entries in the knowledge files (`api-catalog.json`, `api-behavior-notes.json`, `api-dependency-map.json`) — then re-run `/qa-init` (sync mode) with your real URLs, set `ticketSource.type` to your tracker, and restore `auth.primary.loginCommand` + `dbVerification` to real values.

## Phase 0 — Detect existing setup

- Read `package.json` if present. Glob for `cypress.config.*`, `playwright.config.*`, `cypress/`, `tests/`.
- **If a framework config already exists**, ask the user (AskUserQuestion):
  - **Sync config only** — skip scaffolding; derive the real paths from the existing layout (Glob the actual folders) and jump to Phase 3 to update `project-config.json`.
  - **Fill gaps** — keep everything that exists; create only the missing folders/files from Phase 2.
  - **Cancel.**
- If nothing exists, continue to Phase 1.

## Phase 1 — Interview

If `$ARGUMENTS` names a framework (`cypress` or `playwright`), use it; otherwise ask. Batch the questions with AskUserQuestion:

1. **Framework** — `Cypress + JavaScript (Recommended)` (richest template support in this repo) | `Playwright + JavaScript`.
2. **Backends** — `One backend` | `Two backends (primary + secondary)`.
3. **Primary base URL** — offer `http://localhost:4000` and `http://localhost:3000`; free text via Other. (If two backends, also ask for the secondary URL.)
4. **DB verification** — `PostgreSQL (Recommended)` (enables the DB-assertion-on-mutation standard) | `None` (DB checks degrade to API-level verification — note this weakens the testing standards).
5. **Jira** — ask for the Jira cloud ID (`your-org.atlassian.net`) or `skip for now`. (Written to `ticketSource.jira.cloudId` — the top-level `jira` block is deprecated; if a cloud ID is given, also set `ticketSource.type` to `"jira"`, otherwise leave it `"none"`.)
6. **Project name** — default to the repo folder name; used for `project.name` and package metadata (never leave `"YourProject"` behind).
7. **Backend stack** (optional — selects `/analyze-code`'s route/role-gate patterns; valid values are the keys of `.claude/stacks/code-patterns.json`): `go-chi` | `go-gin` | `express` | `nestjs` | `django` | `fastapi` | `rails` | `spring-boot` | `laravel` | `dotnet` | skip (stays `generic` — works but noisy).

Record: `FRAMEWORK`, `TEST_ROOT` (`cypress` | `tests`), `PRIMARY_URL`, `SECONDARY_URL|null`, `DB` (bool), `JIRA_CLOUD_ID|null`, `PROJECT_NAME`, `STACK|null`.

## Phase 2 — Scaffold

Present the full plan (folders, files, npm packages) and **wait for approval**. Then execute. `mkdir -p` all folders first; add a `.gitkeep` to empty leaf folders.

### If FRAMEWORK = cypress

**Folders**
```
cypress/e2e/API   cypress/e2e/UI   cypress/e2e/JiraTicket   cypress/e2e/pages/auth
cypress/support   cypress/tasks    cypress/fixtures/schemas cypress/knowledge
cypress/logs      cypress/reports  cypress/screenshots
docs/test-cases   docs/.ticket-context
```

**Packages** — `npm init -y` if no `package.json`, then immediately fix the metadata `npm init -y` scrapes from the README (`npm pkg set name="<repo-folder-name>" description="<PROJECT_NAME> E2E regression suite (API + UI)"`), then:
`npm install -D cypress cypress-plugin-api cypress-mochawesome-reporter @cypress/grep @faker-js/faker chai-json-schema` (+ `pg` if DB).
After installing, run `npm audit` and apply `npm audit fix` for anything auto-fixable; report what remains.

**`package.json` scripts** (merge, don't clobber existing):
```json
"cy:run": "cypress run",
"cy:api": "cypress run --spec 'cypress/e2e/API/**/*.cy.js'",
"cy:ui": "cypress run --spec 'cypress/e2e/UI/**/*.cy.js'",
"cy:pr": "cypress run --expose grepTags=@PR",
"cy:smoke": "cypress run --expose grepTags=@Smoke",
"cy:regression": "cypress run --expose grepTags=@Regression",
"cy:open": "cypress open"
```

**`cypress.config.js`** (substitute the interview URLs):
```javascript
const { defineConfig } = require("cypress");

const ENVIRONMENTS = {
    local: "<PRIMARY_URL>",
    staging: "https://staging.example.com",
    uat: "https://uat.example.com",
};

module.exports = defineConfig({
    e2e: {
        baseUrl: ENVIRONMENTS[process.env.CYPRESS_ENV || "local"],
        specPattern: "cypress/e2e/**/*.cy.js",
        supportFile: "cypress/support/e2e.js",
        viewportWidth: 1280,
        viewportHeight: 720,
        retries: { runMode: 1, openMode: 0 },
        setupNodeEvents(on, config) {
            require("cypress-mochawesome-reporter/plugin")(on);
            const { plugin: cypressGrepPlugin } = require("@cypress/grep/plugin");
            cypressGrepPlugin(config);
            on("task", require("./cypress/tasks"));
            // Append every run to the knowledge base — this is what makes flake
            // detection work (a test flipping pass/fail across runs is flaky).
            on("after:run", (results) => {
                if (!results || !results.runs) return; // interrupted run
                const fs = require("fs");
                const p = "cypress/knowledge/test-run-history.json";
                try {
                    const h = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { runs: [] };
                    h.runs.push({
                        date: new Date().toISOString(),
                        totalTests: results.totalTests,
                        totalPassed: results.totalPassed,
                        totalFailed: results.totalFailed,
                        totalPending: results.totalPending,
                        failedSpecs: results.runs
                            .filter((r) => r.stats.failures > 0)
                            .map((r) => r.spec.relative),
                    });
                    fs.writeFileSync(p, JSON.stringify(h, null, 2));
                } catch (e) {
                    console.warn("test-run-history append failed:", e.message);
                }
            });
            return config;
        },
    },
    reporter: "cypress-mochawesome-reporter",
    reporterOptions: { reportDir: "cypress/reports/html", charts: true, embeddedScreenshots: true },
});
```

> **Note on `Cypress.env()` deprecation:** newer Cypress versions warn that browser-readable env (`allowCypressEnv`) is insecure and will change. The scaffolded specs read credentials via `Cypress.env(...)`; decide your migration posture NOW (follow the Cypress migration guide for your installed version) rather than after dozens of specs depend on the pattern — record the decision as a comment in `cypress.config.js`.

**`cypress/support/e2e.js`**
```javascript
import "cypress-plugin-api";
import "cypress-mochawesome-reporter/register";
import "./commands";
const { register: registerCypressGrep } = require("@cypress/grep");
registerCypressGrep();
chai.use(require("chai-json-schema"));
```

**`cypress/support/commands.js`** — login command stub (the team fills in their app's real flow):
```javascript
// TODO: implement your app's real login. This is the command every generated spec calls.
Cypress.Commands.add("loginAndGetSessionCookie", () => {
    cy.api({
        method: "POST",
        url: "/session", // TODO: your login endpoint
        body: { email: Cypress.env("LOGIN_EMAIL"), password: Cypress.env("LOGIN_PASSWORD") },
    }).then((resp) => {
        expect(resp.status).to.equal(200);
        cy.wrap(resp.headers["set-cookie"]?.join("; ") ?? "").as("sessionCookie");
        // TODO: fetch/extract the CSRF token your app requires for mutations
        cy.wrap(resp.body.csrfToken ?? "").as("csrfToken");
    });
});
```

**`cypress/support/dataFactory.js`**
```javascript
const { faker } = require("@faker-js/faker");
export const createCustomer = () => ({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
});
```

**`cypress/tasks/index.js`** (only the DB parts if DB = true; otherwise export `{}`):
```javascript
const fs = require("fs");
const { Pool } = require("pg");

// Guard: a missing cypress.env.json must NOT crash Cypress bootstrap (this file
// is require()d by cypress.config.js). Fail at task-call time with a clear
// message instead of a stack trace on a fresh clone.
const env = fs.existsSync("cypress.env.json")
    ? JSON.parse(fs.readFileSync("cypress.env.json", "utf8"))
    : null;

const pool = env
    ? new Pool({
          host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME,
          user: env.DB_USER, password: env.DB_PASSWORD,
      })
    : null;

module.exports = {
    async queryDb(sql) {
        if (!pool) throw new Error(
            "cypress.env.json is missing — copy cypress.env.example.json to cypress.env.json and fill in the DB_* keys."
        );
        return (await pool.query(sql)).rows;
    },
    // Add querySecondaryDb with a second Pool if you test a second backend.
};
```

**`cypress.env.example.json`** — `LOGIN_EMAIL`, `LOGIN_PASSWORD`, `NEGATIVE_LOGIN_EMAIL`, and (if DB) `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` (+ `SECONDARY_*` if two backends), all with placeholder values. Tell the user to copy it to `cypress.env.json`.

**Knowledge seeds** in `cypress/knowledge/` — create each with an empty-but-valid shape: `api-catalog.json` (`{"modules": {}}`), `api-behavior-notes.json` (`{"known_500_bugs": [], "endpoint_quirks": [], "auth_behavior": []}`), `api-dependency-map.json` (`{"modules": {}}`), `failure-patterns.json` (`{"patterns": []}`), `test-run-history.json` (`{"runs": []}`), `tagging-strategy.json` (`{"@PR": "pre-merge gate", "@Smoke": "post-deploy sanity", "@Regression": "full pass"}`), plus a `_README.md` one-liner pointing at CLAUDE.md's knowledge-base protocol.

**Sample spec** `cypress/e2e/API/health-module/01-get-health.cy.js` — a `@PR @Smoke` GET on `/api/health` (or `/`) following the template skeleton, so the very first run proves the wiring, **plus one `@Regression` negative case** (e.g. a bogus path under the health route asserting 404) so the module participates in the regression gate from day one.

**`.gitignore`** (append if missing): `node_modules/`, `cypress.env.json`, `cypress/reports/`, `cypress/screenshots/`, `cypress/logs/`, `docs/`, `.claude/project-config.local.json`.

### If FRAMEWORK = playwright

**Folders**
```
tests/api   tests/ui   tests/jira-tickets   tests/pages/auth
tests/support   tests/fixtures/schemas   tests/knowledge
docs/test-cases   docs/.ticket-context
```

**Packages** — `npm init -y` if needed, then `npm install -D @playwright/test @faker-js/faker dotenv ajv` (+ `pg` if DB), then `npx playwright install chromium`.

**`package.json` scripts:** `pw:run` (`playwright test`), `pw:api` (`playwright test --project=api`), `pw:ui` (`playwright test --project=ui`), `pw:pr` (`playwright test --grep @PR`), `pw:smoke` (`--grep @Smoke`), `pw:regression` (`--grep @Regression`), `pw:report` (`playwright show-report`).

**`playwright.config.js`**
```javascript
const { defineConfig } = require("@playwright/test");
require("dotenv").config();

const ENVIRONMENTS = {
    local: "<PRIMARY_URL>",
    staging: "https://staging.example.com",
    uat: "https://uat.example.com",
};

module.exports = defineConfig({
    testDir: "tests",
    retries: 1,
    reporter: [
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
    ],
    use: {
        baseURL: ENVIRONMENTS[process.env.TEST_ENV || "local"],
        viewport: { width: 1280, height: 720 },
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "api", testMatch: /api\/.*\.spec\.js/ },
        { name: "ui", testMatch: /(ui|jira-tickets)\/.*\.spec\.js/ },
    ],
});
```

**`tests/support/auth.js`** — request-level login stub returning `{ cookieHeader, csrfToken }` (mirror of the Cypress command, with the same TODOs). **`tests/support/db.js`** — `pg` Pool reading `process.env.DB_*`, exporting `queryDb(sql)` (only if DB = true). **`tests/support/dataFactory.js`** — same faker factory. **`tests/support/schema.js`** — small ajv helper `expectJsonSchema(body, schema)`.

**`.env.example`** — same keys as the Cypress env example (copy to `.env`). **Knowledge seeds** — same six files, in `tests/knowledge/`. **Sample spec** `tests/api/health-module/01-get-health.spec.js` per the Playwright template skeleton (happy path + one `@Regression` negative, as for Cypress). **`.gitignore`** — `node_modules/`, `.env`, `playwright-report/`, `test-results/`, `docs/`, `.claude/project-config.local.json`.

### Both frameworks — pre-commit gate

CLAUDE.md and `/pr` reference `npm run hooks:install` and the `.githooks` pre-commit gate — scaffold both so the promise holds. The gate logic itself lives in `scripts/gates/` (shipped by the framework's `install.sh`; the same runner `/validate-spec` and `/qa-selftest` use) — the hook only invokes it, so there is exactly one copy of every scanner.

**`package.json` script** (merge): `"hooks:install": "git config core.hooksPath .githooks"` — tell the user it is one-time per clone.

**`.githooks/pre-commit`** (create the folder; make the file executable with `chmod +x .githooks/pre-commit`):
```bash
#!/usr/bin/env bash
# QA pre-commit gate — runs the shared qa-gates scanners (validate-spec Checks
# 1,4,6,8,9,9b,11) on staged specs, plus JSON validity.
# Installed via: npm run hooks:install   Policy: never bypass with --no-verify.
set -u
fail=0

if [ -f scripts/gates/index.js ]; then node scripts/gates/index.js --staged || fail=1
else npx --no-install qa-gates --staged || fail=1; fi

for f in $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.json$'); do
  [ -f "$f" ] || continue
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' \
    "$f" >/dev/null 2>&1 || { echo "✗ invalid JSON: $f"; fail=1; }
done

exit $fail
```

## Phase 3 — Sync `.claude/project-config.json`

Read the current file, **merge** (preserve keys you don't own, e.g. `jira.testIssueType`, `testLimits`, `productCode`), and write:

- `name`: `PROJECT_NAME`
- `testFramework`: `"cypress"` | `"playwright"`
- `dbVerification`: `true` if DB was chosen, else `false` (disables the DB-assertion hard gate — a degraded standard, which Phase 4 must call out)
- `productCode.stack`: `STACK` if given (merge into the existing `productCode` object — preserve `rootPaths`/`codePatterns`/`sourceGlobs`/`excludeDirs`)
- `app.primaryBaseUrl` / `app.secondaryBaseUrl`, `app.envFile` (`cypress.env.json` | `.env`)
- `jira.cloudId` (only if provided)
- `paths` — per framework:

| Key | cypress | playwright |
|---|---|---|
| apiTests | `cypress/e2e/API` | `tests/api` |
| uiTests | `cypress/e2e/UI` | `tests/ui` |
| jiraTicketTests | `cypress/e2e/JiraTicket` | `tests/jira-tickets` |
| pages | `cypress/e2e/pages` | `tests/pages` |
| support | `cypress/support/commands.js` | `tests/support/auth.js` |
| dataFactory | `cypress/support/dataFactory.js` | `tests/support/dataFactory.js` |
| tasks | `cypress/tasks` | `tests/support` |
| fixtures | `cypress/fixtures` | `tests/fixtures` |
| knowledge | `cypress/knowledge` | `tests/knowledge` |
| swaggerPrimary | `cypress/fixtures/swagger.json` | `tests/fixtures/swagger.json` |
| logs | `cypress/logs` | `test-results` |
| reports | `cypress/reports` | `playwright-report` |
| screenshots | `cypress/screenshots` | `test-results` |
| ticketContext / manualCases | `docs/.ticket-context` / `docs/test-cases` | same |

- `runCommand` — cypress: `npx cypress run --spec "{specFile}"` (+ `--headed` / `CYPRESS_ENV={env}` variants, reporter as configured); playwright: `npx playwright test {specFile}` / `npx playwright test {specFile} --headed` / `TEST_ENV={env} npx playwright test {specFile}`.

Validate with `node -e "JSON.parse(require('fs').readFileSync('.claude/project-config.json','utf8'))"` before finishing.

## Phase 4 — Verify

1. Framework boots: `npx cypress verify` | `npx playwright --version`.
2. If the primary base URL answers (`curl -s -o /dev/null -w "%{http_code}"` is 2xx/3xx), run the sample health spec with `runCommand.headless`; otherwise print `⏭ backend not running — skipped sample run` (not an error).
3. Print the summary: framework, files created / skipped-as-existing, packages installed, config keys written, and next steps:

> **Next steps:**
> 1. Copy the env example file and fill in real credentials (never commit it).
> 2. Run `npm run hooks:install` — one-time per clone; activates the pre-commit gate (no-5xx / ambiguous-oneOf / JSON checks).
> 3. Create `.claude/project-config.local.json` with `productCode.rootPaths` pointing at your local product source checkout(s) — `/analyze-code` hard-stops without it — and set `productCode.stack` to your backend framework.
> 4. Implement the real login flow in the auth support file (marked TODO).
> 5. Drop your API's `swagger.json` into the fixtures folder (enables `/audit-coverage` and the Coverage health dimension).
> 6. Run `/doctor` to preflight, then `@manual-test-generator <TICKET-ID>` to start the pipeline.
> 7. Optional: copy `ci/qa-pr-gate.example.yml` (from the framework repo) to `.github/workflows/` for a PR gate; agents accept `auto` / `auto-post` flags for unattended runs.
> 8. Lost at any point? Run `/qa-help` — it checks your setup state and tells you the next step.
