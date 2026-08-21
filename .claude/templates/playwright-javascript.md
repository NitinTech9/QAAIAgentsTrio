# Framework Template: Playwright + JavaScript

Read this file when `project.testFramework = "playwright"`. It defines the syntax, file conventions, and validation rules every generation/validation command must follow. Values here mirror what `/qa-init` scaffolds. Where a command's inline examples show Cypress syntax, translate them using this file — never emit `cy.*` calls into a Playwright suite.

## Facts

| Item | Value |
|---|---|
| Spec extension | `.spec.js` |
| Config file | `playwright.config.js` (baseURL per `TEST_ENV`: local/staging/uat; projects `api` and `ui`) |
| Env file | `.env` (git-ignored, loaded via dotenv; `process.env.KEY`) |
| API calls | `request` fixture → `await request.get("/api/...")` (or `apiContext` from `tests/support/auth.js`) |
| DB access | direct import — `const { queryDb, querySecondaryDb } = require("../support/db")` → `await queryDb(sql)` |
| Schema assertion | `ajv` → `expect(new Ajv().validate(schema, body), JSON.stringify(errors)).toBe(true)` (helper in `tests/support/schema.js`) |
| Data factory | `tests/support/dataFactory.js` (@faker-js/faker) |
| Tags | in the title: `test("... @PR @Smoke", ...)`; run with `--grep @PR` |
| Reports | HTML at `playwright-report/index.html`, JSON at `test-results/results.json` |
| Failure artifacts | `test-results/` (screenshots, traces) |
| Run single spec | `npx playwright test <file>` |

## Tested with (majors the scaffold assumes — NOT execution-verified; Playwright support is experimental)

| Package | Major |
|---|---|
| @playwright/test | 1 |
| @faker-js/faker | 10 |
| dotenv | 16 |
| ajv | 8 |
| pg | 8 |

/doctor warns when an installed major drifts from this table. Update the framework and this table together, never just the dependency.

## API spec skeleton

```javascript
const { test, expect } = require("@playwright/test");
const { loginAndGetSession } = require("../../support/auth");
const { queryDb } = require("../../support/db");

test.describe("Test Scenario: <Feature> API Tests", () => {
    let session; // { cookieHeader, csrfToken }

    test.beforeEach(async ({ request }) => {
        session = await loginAndGetSession(request);
    });

    test("Test Case 01: Validate GET <endpoint> returns 200 @PR @Smoke", async ({ request }) => {
        const response = await request.get("/api/<endpoint>", {
            headers: { Cookie: session.cookieHeader },
        });
        if (response.status() !== 200) {
            console.log("Failed:", response.status(), await response.text());
        }
        expect(response.status()).toBe(200);
    });
});
```

- Mutations add `"x-csrf-token": session.csrfToken` to headers and MUST assert persistence via `await queryDb(...)` afterward.
- Unauthenticated tests use a fresh context: `const anon = await pwRequest.newContext({ baseURL }); expect([401, 403]).toContain((await anon.get(url)).status());` Required on every API spec; a genuinely public endpoint opts out with `// access-control-exempt: <reason>` instead of omitting the test.
- Playwright's `request` fixture never throws on non-2xx — always assert `response.status()` explicitly. Never accept 5xx; no assertions mixing 2xx and 4xx outcomes.

## UI spec skeleton

- Login programmatically in `test.beforeEach` via `auth.js` (request-level login → `storageState` or cookie injection), then `await page.goto("/")`.
- All selectors live in Page Objects under `tests/pages/<domain>/` — plain classes taking `page` in the constructor (`new LoginPage(page)`); no singletons (Playwright pages are per-test).
- Prefer `page.getByRole` / `getByLabel` / `#id`; no fixed `page.waitForTimeout(<number>)` — rely on web-first assertions (`await expect(locator).toBeVisible()`).

## Validation rules (used by validate-spec)

- DB-assertion regex for mutations: `/(queryDb|querySecondaryDb)\s*\(/` plus a `require(.*support\/db` import.
- API-call marker: `request.(get|post|put|patch|delete)(` — a `response.status()` assertion must follow every call.
- Syntax check: `node --check <spec>`.

## Report parsing (used by run-tests)

Parse `test-results/results.json` — walk `suites[].specs[].tests[].results[]`; a failing result has `status: "failed"` with `error.message`. Screenshots/traces are under `test-results/<test-dir>/`.
