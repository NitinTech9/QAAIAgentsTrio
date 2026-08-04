# Framework Template: Cypress + JavaScript

Read this file when `project.testFramework = "cypress"`. It defines the syntax, file conventions, and validation rules every generation/validation command must follow. Values here mirror what `/qa-init` scaffolds.

## Facts

| Item | Value |
|---|---|
| Spec extension | `.cy.js` |
| Config file | `cypress.config.js` (baseUrl per `CYPRESS_ENV`: local/staging/uat) |
| Env file | `cypress.env.json` (git-ignored; `Cypress.env("KEY")`) |
| API calls | `cy.api({...})` (cypress-plugin-api) |
| DB access | `cy.task("queryDb", sql)` / `cy.task("querySecondaryDb", sql)` — Node-side tasks in `cypress/tasks/` |
| Schema assertion | `chai-json-schema` → `expect(body).to.be.jsonSchema(schema)` |
| Data factory | `cypress/support/dataFactory.js` (@faker-js/faker) |
| Tags | `it("...", { tags: ["@PR", "@Smoke"] }, ...)` via @cypress/grep; run with `--env grepTags=@PR` |
| Reports | Mochawesome — HTML at `cypress/reports/html/index.html`, JSON under `cypress/reports/` |
| Failure artifacts | `cypress/screenshots/` |
| Run single spec | `npx cypress run --spec "<file>"` |

## API spec skeleton

```javascript
describe("Test Scenario: <Feature> API Tests", () => {
    let sessionCookie;
    let csrfToken;      // only for POST/PUT/DELETE

    beforeEach(() => {
        cy.loginAndGetSessionCookie().then(() => {
            cy.get("@sessionCookie").then((c) => { sessionCookie = c; });
            cy.get("@csrfToken").then((t) => { csrfToken = t; });
        });
    });

    it("Test Case 01: Validate GET <endpoint> returns 200", { tags: ["@PR", "@Smoke"] }, () => {
        cy.api({
            method: "GET",
            url: "/api/<endpoint>",
            headers: { Cookie: sessionCookie },
            failOnStatusCode: false,
        }).then((response) => {
            if (response.status !== 200) {
                cy.log("Failed: " + response.status + " — " + JSON.stringify(response.body));
            }
            expect(response.status).to.equal(200);
        });
    });
});
```

- Mutations add `"x-csrf-token": csrfToken` to headers and MUST assert persistence via `cy.task("queryDb", ...)` afterward.
- Unauthenticated tests call `cy.clearCookies()` first, then assert `oneOf([401, 403])`.
- Always `failOnStatusCode: false`; assert status manually. Never accept 5xx; no `oneOf` mixing 2xx and 4xx.

## UI spec skeleton

- Login programmatically in `beforeEach` (`cy.loginAndGetSessionCookie()`), then `cy.visit()`.
- All selectors live in Page Objects under `cypress/e2e/pages/<domain>/` (`export default new XPage()` singletons).
- No `cy.wait(<number>)` — wait on `should("be.visible")`. No TypeScript.

## Validation rules (used by validate-spec)

- DB-assertion regex for mutations: `/cy\.task\(\s*["'](queryDb|querySecondaryDb)/`
- API-call marker: `cy.api(` — a status assertion must follow every call.
- Syntax check: `node --check <spec>` (CJS) or parse as ESM.

## Report parsing (used by run-tests)

Parse `cypress/reports/.jsons/mochawesome.json` — failing tests carry `fail: true` with `err.message` / `err.estack`.
