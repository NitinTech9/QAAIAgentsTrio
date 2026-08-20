---
name: generate-api-test
description: Generate a complete Cypress API test file from a GitHub PR number, a curl command, or a plain endpoint description. Use when the user provides a PR like "#21", pastes a curl, or says "write tests for GET /api/stores".
---

# Generate API Test File

You generate production-ready API test files for this QA framework.

**Framework check first:** read `project.testFramework` from `.claude/project-config.json`, then read `.claude/templates/{testFramework}-javascript.md` and follow its spec skeleton, assertion style, and validation rules. The examples below use Cypress syntax — when the framework is Playwright, translate them per the template; never emit `cy.*` calls into a Playwright suite.

The user provides ONE of:
- A **GitHub PR number / URL** → fetch API changes from the diff
- A **curl command** → parse it directly
- A **plain description** → e.g. "write tests for GET /api/stores/{id}"

---

## FRAMEWORK FACTS (memorise these — do not deviate)

**Base URL:** `config.app.primaryBaseUrl` from `.claude/project-config.json` (selected at runtime in `cypress.config.js` via the `CYPRESS_ENV` **process env var** — not the `--env` flag)

**Auth — two types:**
1. **Session auth** (all `/api/*` endpoints) — `cy.loginAndGetSessionCookie()` → aliases `@sessionCookie` + `@csrfToken`
2. **Bearer token** (integration/partner endpoints, if your app has any) — a custom token command, e.g. `cy.generateToken(...)`

**CSRF required on:** POST, PUT, DELETE, PATCH → add `"x-csrf-token": csrfToken` header

**DB access:** `cy.task("queryDb", sqlString)` → returns array of row objects

**Available DB tasks:**
List the purpose-built tasks registered in `cypress.config.js` (implemented under `cypress/tasks/`), e.g.:
- `queryDb(sql)` — general SELECT
- `querySecondaryDb(sql)` — general SELECT against the second backend's DB (if any)
- domain-specific setup/cleanup tasks (e.g. `deleteOrderAndRelations(id)`) — reuse before inventing new ones

**Available fixtures:**
Check `cypress/fixtures/` for existing request bodies and reuse them, e.g.:
- `create<Resource>Body.json` — request bodies per resource
- `schemas/<resource>ResponseSchema.json` — schemas for chai-json-schema validation

**dataFactory.js exports:** faker-generated data builders (e.g. `createCustomer()`) — check `cypress/support/dataFactory.js`

---

## FOLDER MAPPING (kebab-case — mandatory)

Map each endpoint to its module folder. Keep this table in sync with your suite's real layout (`cypress/knowledge/api-catalog.json` is the source of truth), e.g.:

| URL pattern | Folder |
|---|---|
| `/api/orders*` | `cypress/e2e/API/orders-module/` |
| `/api/health*` | `cypress/e2e/API/health-module/` |
| `/session`, `/confirm`, `/new-password-reset`, `/password-reset` | `cypress/e2e/API/auth-module/` or `cypress/e2e/API/login-module/` |
| `/api/users*`, `/api/roles*`, `/api/stores*` | `cypress/e2e/API/admin-module/user-mgmt/` |
| `/api/products*`, `/api/fees*`, `/api/coupons*` | `cypress/e2e/API/admin-module/product-mgmt/` |
| Secondary app `/api/*` (if any) | `cypress/e2e/API/<secondary-app>-module/<feature>/` |

---

## STEP 0 — Consult the knowledge base (every workflow)

Before any of the workflows below, read `cypress/knowledge/` for the endpoint(s) in scope and let it
shape the spec (full protocol in `cypress/knowledge/_README.md`):
- `api-behavior-notes.json` — `known_500_bugs`, `endpoint_quirks`, `auth_behavior`. If the
  endpoint is a **documented 5xx bug**, don't assert 200 and never accept the 5xx; apply known auth
  quirks (many GETs return 200 without auth → don't assert 403) and param requirements.
- `api-dependency-map.json` (`modules`) — reuse documented tables, data-source query, auth role, and
  cleanup order for `before()`/`after()`.
- `failure-patterns.json` (`patterns`) — avoid known `FP-###` pitfalls up front.

After writing the spec, **write back** any new quirk/dependency/endpoint-mapping you discovered
(see OUTPUT FORMAT).

---

## WORKFLOW A — GitHub PR

```bash
# Run in parallel
gh pr view <PR_NUMBER> --json title,body,files
gh pr diff <PR_NUMBER>
```

Scan diff for: `router.GET/POST/PUT/DELETE`, new handler functions, new URL path strings `/api/...`

For each discovered endpoint, extract: method, path, request body fields, response fields, auth required.

---

## WORKFLOW B — Curl Command

Parse from curl:
- HTTP method (`-X` flag, default GET)
- URL path (strip base URL, keep path + query params)
- Body (`-d` or `--data`)
- Auth detection:
  - Session cookie / port matching the **secondary app** (if your suite has one) → secondary session auth — use `config.auth.secondary.loginCommand` and its `sessionCookieAlias`
  - Session cookie / port matching the **primary app** → primary session auth — use `cy.loginAndGetSessionCookie()` → `@sessionCookie` + `@csrfToken`
  - Has `Authorization: Bearer` → bearer token auth

---

## WORKFLOW C — Plain Description

User says e.g.: "write tests for GET /api/stores/{id}"  
→ Infer method, path, likely response shape, map to correct folder, generate full test suite.

---

## FILE NAMING

`[NN]-[http-method]-[resource-description].cy.js`  
Zero-padded sequence, HTTP method prefix, kebab-case resource name.

**Examples:**
- `01-get-orders-list.cy.js`
- `03-post-create-order.cy.js`
- `04-put-cancel-order.cy.js`

If adding to an existing file, continue numbering from the last test case.

---

## STANDARD FILE STRUCTURE

```javascript
describe("Test Scenario: [Feature Name] API Tests", () => {

    let sessionCookie;
    let csrfToken;       // only for POST/PUT/DELETE
    let resourceId;      // only when DB setup needed

    // before() only when you need DB data to drive the test
    before(() => {
        cy.task("queryDb", `
            select id from table_name
            where condition = 'value'
            order by id desc
            limit 1
        `).then((rows) => {
            expect(rows && rows.length > 0, "found a record").to.be.true;
            resourceId = rows[0].id;
        });
    });

    beforeEach(() => {
        cy.loginAndGetSessionCookie().then(() => {
            cy.get("@sessionCookie").then((cookie) => { sessionCookie = cookie; });
            cy.get("@csrfToken").then((token) => { csrfToken = token; });
        });
    });

    // Optional: cleanup after mutating tests (use your project's cleanup task)
    after(() => {
        cy.task("deleteOrderAndRelations", resourceId);
    });

    it("Test Case 01: Validate [endpoint] returns 200", { tags: ["@PR", "@Smoke"] }, () => {
        cy.api({
            method: "GET",
            url: "/api/[endpoint]",
            headers: { Cookie: sessionCookie },
            failOnStatusCode: false,
        }).then((response) => {
            if (response.status !== 200) {
                cy.log("Failed: " + response.status + " — " + JSON.stringify(response.body));
            }
            expect(response.status).to.equal(200);
        });
    });

    it("Test Case 02: Validate response body structure", { tags: ["@PR", "@Smoke"] }, () => { ... });

    it("Test Case 03: Validate unauthenticated request returns 401 or 403", { tags: ["@Regression"] }, () => {
        cy.api({
            method: "GET",
            url: "/api/[endpoint]",
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.be.oneOf([401, 403]);
        });
    });
});
```

---

## MINIMUM TEST CASES PER ENDPOINT TYPE

**GET list** (`/api/resources`):
1. `@PR @Smoke` — 200 with valid session
2. Response body is object/array
3. Required fields present on each item
4. Field types correct
5. `@Regression` — 401/403 without session
6. `@Regression` — filter by query param works (if applicable)

**GET single** (`/api/resources/:id`):
1. `@PR @Smoke` — 200 for valid ID
2. All expected fields present with correct types
3. `@Regression` — 404 for `id=999999999`
4. `@Regression` — 401/403 without session

**POST create**:
1. `@PR @Smoke` — Creates resource, returns 200/201 with ID
2. Response has expected fields
3. `@DataValidation` — DB row exists after the call (`cy.task("queryDb", ...)`) — required on **every mutation** unless `project.dbVerification` is `false`
4. `@Regression` — Missing required field returns 400/422
5. `@Regression` — 401/403 without session
6. `after()` cleanup via DB task

**PUT/PATCH update**:
1. `@PR @Smoke` — Updates successfully
2. `@DataValidation` — DB row reflects the update — required on **every mutation** unless `project.dbVerification` is `false`
3. `@Regression` — 404 for non-existent ID
4. `@Regression` — Validation error for bad data
5. `@Regression` — 401/403 without session

**PUT cancel/status-change** (business flow):
1. Query DB in `before()` for a record in the right state
2. `@PR @Smoke` — API returns 200
3. Verify DB state changed after the call
4. `@Regression` — Missing required fields returns 400/422
5. `@Regression` — Non-existent ID returns 404/400
6. `@Regression` — 401/403 without session

**Schema validation:** the testing standards require a schema-validation spec per API. If the endpoint returns a 200 JSON body and no schema spec exists yet, also add the schema fixture under `{config.paths.fixtures}/schemas/` and a spec under `{config.paths.apiTests}/schema-validation/` — or explicitly list it as a follow-up in the output.

**If `project.dbVerification` is `false`:** the suite has no direct DB access — omit the `before()`/`after()` DB blocks and the `@DataValidation` cases, and note the degraded standard in the output.

---

## STRICT RULES

- NEVER use `cy.logger()` — use `cy.log()` only for debug failure output
- NEVER use `cy.wait(<number>)`
- ALWAYS `failOnStatusCode: false` on negative tests
- ALWAYS `let` for variables set inside Cypress chain (not `const`)
- ALWAYS `failOnStatusCode: false` on the happy-path call too, then assert manually (so you can log the body on failure)
- Tags: `{ tags: ["@PR", "@Smoke"] }` on happy path, `{ tags: ["@Regression"] }` on negative/edge
- DB table names: verify against the real schema before writing queries (keep your project's known gotchas listed here)
- Pure JavaScript — no TypeScript

---

## OUTPUT FORMAT

After writing files, show:

| File | Action | Test Cases |
|------|--------|-----------|
| `cypress/e2e/API/.../file.cy.js` | Created / Updated | N |

Then the run command:
```bash
CYPRESS_ENV=local npx cypress run --spec "cypress/e2e/API/<path>/<file>.cy.js"
```

Finally, **write back to the knowledge base** if you learned anything new: a quirk / 5xx →
`api-behavior-notes.json`; a module's tables/cleanup/role → `api-dependency-map.json`; the new
endpoint→file mapping → `api-catalog.json`. Validate edited files with
`node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`. Skip if nothing new was learned.
