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
- **Sample spec** `<apiTests>/posts-module/01-get-posts.cy.js` (or `.spec.js`): three cases per the framework template — GET `/posts` is 200 + non-empty (`@PR @Smoke`), GET `/posts/999999` is 404 (`@Regression`), POST `/posts` returns 201 with an id (`@Regression`).
- **Seed a fake ticket** so the agent pipeline can be tried offline (the agents skip `fetch-ticket` when context already exists):
  - `docs/test-cases/DEMO-1.md` — two `- **Type:** API` sections: *Read posts* ("Verify that GET /posts returns 200 and a non-empty list", "Verify that GET /posts/{id} returns the post with id, title, body, userId", "Verify that GET /posts/999999 returns 404") and *Create post* ("Verify that POST /posts with title/body/userId returns 201 with an id").
  - `docs/.ticket-context/DEMO-1.json` — `{ "key": "DEMO-1", "summary": "Demo: posts API coverage", "issuetype": "Story", "description": "Cover the public posts API (demo ticket — not backed by Jira)." }`
  - `docs/.ticket-context/DEMO-1-analysis.md` — short stub: endpoints under `/posts`, unauthenticated, no DB access, no role gating.
- Phase 4 runs the sample spec (the public API is reachable from anywhere) and ends with demo-specific next steps:

> **Try the framework:**
> 1. `/qa-only` — audit the demo suite and see a health report.
> 2. `@api-automation-test-generator DEMO-1 auto` — watch the full generation pipeline run offline (`auto` skips the Jira steps).
> 3. `/generate-api-test write tests for GET /comments` — generate a new spec from a plain description.
> When you're done exploring, re-run `/qa-init` in your real repo.

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
5. **Jira** — ask for the Jira cloud ID (`your-org.atlassian.net`) or `skip for now`.

Record: `FRAMEWORK`, `TEST_ROOT` (`cypress` | `tests`), `PRIMARY_URL`, `SECONDARY_URL|null`, `DB` (bool), `JIRA_CLOUD_ID|null`.

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

**Packages** — `npm init -y` if no `package.json`, then:
`npm install -D cypress cypress-plugin-api cypress-mochawesome-reporter @cypress/grep @faker-js/faker chai-json-schema` (+ `pg` if DB).

**`package.json` scripts** (merge, don't clobber existing):
```json
"cy:run": "cypress run",
"cy:api": "cypress run --spec 'cypress/e2e/API/**/*.cy.js'",
"cy:ui": "cypress run --spec 'cypress/e2e/UI/**/*.cy.js'",
"cy:pr": "cypress run --env grepTags=@PR",
"cy:smoke": "cypress run --env grepTags=@Smoke",
"cy:regression": "cypress run --env grepTags=@Regression",
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
            require("@cypress/grep/src/plugin")(config);
            on("task", require("./cypress/tasks"));
            return config;
        },
    },
    reporter: "cypress-mochawesome-reporter",
    reporterOptions: { reportDir: "cypress/reports/html", charts: true, embeddedScreenshots: true },
});
```

**`cypress/support/e2e.js`**
```javascript
import "cypress-plugin-api";
import "cypress-mochawesome-reporter/register";
import "./commands";
const registerGrep = require("@cypress/grep");
registerGrep();
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
const env = JSON.parse(fs.readFileSync("cypress.env.json", "utf8"));

const pool = new Pool({
    host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME,
    user: env.DB_USER, password: env.DB_PASSWORD,
});

module.exports = {
    async queryDb(sql) { return (await pool.query(sql)).rows; },
    // Add querySecondaryDb with a second Pool if you test a second backend.
};
```

**`cypress.env.example.json`** — `LOGIN_EMAIL`, `LOGIN_PASSWORD`, `NEGATIVE_LOGIN_EMAIL`, and (if DB) `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` (+ `SECONDARY_*` if two backends), all with placeholder values. Tell the user to copy it to `cypress.env.json`.

**Knowledge seeds** in `cypress/knowledge/` — create each with an empty-but-valid shape: `api-catalog.json` (`{"modules": {}}`), `api-behavior-notes.json` (`{"known_500_bugs": [], "endpoint_quirks": [], "auth_behavior": []}`), `api-dependency-map.json` (`{"modules": {}}`), `failure-patterns.json` (`{"patterns": []}`), `test-run-history.json` (`{"runs": []}`), `tagging-strategy.json` (`{"@PR": "pre-merge gate", "@Smoke": "post-deploy sanity", "@Regression": "full pass"}`), plus a `_README.md` one-liner pointing at CLAUDE.md's knowledge-base protocol.

**Sample spec** `cypress/e2e/API/health-module/01-get-health.cy.js` — a single `@PR @Smoke` GET on `/api/health` (or `/`) following the template skeleton, so the very first run proves the wiring.

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

**`.env.example`** — same keys as the Cypress env example (copy to `.env`). **Knowledge seeds** — same six files, in `tests/knowledge/`. **Sample spec** `tests/api/health-module/01-get-health.spec.js` per the Playwright template skeleton. **`.gitignore`** — `node_modules/`, `.env`, `playwright-report/`, `test-results/`, `docs/`, `.claude/project-config.local.json`.

## Phase 3 — Sync `.claude/project-config.json`

Read the current file, **merge** (preserve keys you don't own, e.g. `jira.testIssueType`, `testLimits`, `productCode`), and write:

- `testFramework`: `"cypress"` | `"playwright"`
- `dbVerification`: `true` if DB was chosen, else `false` (disables the DB-assertion hard gate — a degraded standard, which Phase 4 must call out)
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
> 2. Implement the real login flow in the auth support file (marked TODO).
> 3. Drop your API's `swagger.json` into the fixtures folder (enables `/audit-coverage`).
> 4. Run `/doctor` to preflight, then `@manual-test-generator <TICKET-ID>` to start the pipeline.
> 5. Optional: copy `ci/qa-pr-gate.example.yml` (from the framework repo) to `.github/workflows/` for a PR gate; agents accept `auto` / `auto-post` flags for unattended runs.
> 6. Lost at any point? Run `/qa-help` — it checks your setup state and tells you the next step.
