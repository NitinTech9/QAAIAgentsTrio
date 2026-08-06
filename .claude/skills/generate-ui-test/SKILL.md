---
name: generate-ui-test
description: Generate a Cypress UI test file for a frontend feature. Use when the user says "write UI test for store creation", "add UI test for login", or describes a browser workflow to automate.
---

# Generate UI Test File

You generate UI (end-to-end browser) test files for your product's frontend.

**Framework check first:** read `project.testFramework` from `.claude/project-config.json`, then read `.claude/templates/{testFramework}-javascript.md` and follow its spec skeleton, selector/Page-Object conventions, and run facts. The examples below use Cypress syntax — when the framework is Playwright, translate them per the template; never emit `cy.*` calls into a Playwright suite.

The user will describe a UI workflow — e.g. "write a UI test to create a new store" or "test that the login page shows an error for wrong credentials".

---

## FRAMEWORK FACTS

**Base URL:** `http://localhost:4000` (from `cypress.config.js`)

**Custom commands available:**
- `cy.loginAndGetSessionCookie()` — API-based login, sets `@sessionCookie` + `@csrfToken` aliases

**Page Object files** (in `cypress/e2e/pages/`, organized by domain folder), e.g.:
- Root: `AdminDashboardPage.js`, `AdminNavPage.js`
- `auth/` — `LoginPage.js`
- One folder per product domain (e.g. `orders/`, `users/`) — `OrdersListPage.js`, `OrderDetailPage.js`, …
- `admin/<section>/` — one folder per admin menu section (e.g. `user-mgmt/`, `product-mgmt/`), e.g. `admin/user-mgmt/UsersListPage.js`

Discover with Glob `cypress/e2e/pages/**/*.js`; new Page Objects go in the matching domain folder.

**Plugins loaded:** `cypress-xpath`, `cypress-file-upload`, `chai-json-schema`

**Viewport:** 1280×720 (set in `cypress.config.js`)

---

## FOLDER MAPPING (kebab-case — mandatory)

Map each feature area to its module folder — keep this table in sync with your suite's real layout, e.g.:

| Feature Area | Folder |
|---|---|
| Login, auth flows | `cypress/e2e/UI/login-module/` |
| Core product flows | `cypress/e2e/UI/orders-module/` |
| User management | `cypress/e2e/UI/user-module/` |
| Admin — store management | `cypress/e2e/UI/admin-module/store-management/` |
| Admin — product settings | `cypress/e2e/UI/admin-module/product-mgmt/` |

---

## FILE NAMING

**Branch check first:** if the current git branch name contains a ticket reference (`[A-Za-z]{2,}-[0-9]+`, or a leading issue number like `412-`), place the spec in `cypress/e2e/JiraTicket/<TICKET>_<NUMBER>_<FeatureDescription>.cy.js` (e.g. `PROJ_17487_OverrideTaxCancellation.cy.js`). Otherwise:

`[NN]-[action-description].cy.js`  
No HTTP method prefix for UI tests. Short verb-noun description, kebab-case.

**Examples:**
- `01-login.cy.js`
- `02-create-new-store.cy.js`
- `03-view-order-details.cy.js`

---

## STANDARD UI TEST STRUCTURE

```javascript
describe("Test Scenario: [Feature Name] UI Tests", () => {

    beforeEach(() => {
        cy.loginAndGetSessionCookie();
        cy.visit("/");
    });

    it("Test Case 01: [Happy path description]", { tags: ["@PR", "@Smoke"] }, () => {
        // Navigate
        cy.visit("/path/to/page");

        // Interact — selectors verified against the real DOM (id / label text / name)
        cy.get("#btn-search").click();
        cy.get('input[name="field"]').type("value");

        // Assert — real app patterns (ids, label text, stable classes); NO data-testid
        cy.contains(".alert-success", "Saved").should("be.visible");
        cy.url().should("include", "/expected-path");
    });

    it("Test Case 02: [Validation scenario]", { tags: ["@Regression"] }, () => {
        // Test validation / error state
    });
});
```

**Page Object pattern** (preferred when a page object already exists):
```javascript
// POMs export a singleton INSTANCE (export default new X()) — import the default and
// call methods directly. Do NOT `new` it up or use a named import.
import LoginPage from "../../pages/auth/LoginPage";

// Use page object methods instead of raw selectors
LoginPage.login(Cypress.env("LOGIN_EMAIL"), Cypress.env("LOGIN_PASSWORD"));
```

---

## MINIMUM TEST CASES PER WORKFLOW TYPE

**Login flow:**
1. `@PR @Smoke` — Valid credentials redirect to dashboard
2. `@PR @Smoke` — Invalid credentials show error message
3. `@Regression` — Empty fields show validation errors

**Create/Edit form:**
1. `@PR @Smoke` — Fill all required fields, submit, success message shown
2. `@Regression` — Required field missing, submit button disabled or error shown
3. `@Regression` — Created item appears in the list/table

**View/List page:**
1. `@PR @Smoke` — Page loads, table/list renders with data
2. `@Regression` — Search or filter works
3. `@Regression` — Pagination works (if applicable)

**Delete/Deactivate:**
1. `@PR @Smoke` — Confirm modal shows, item removed after confirmation
2. `@Regression` — Cancel in modal keeps the item

**Role-gated feature (element/route visible only to certain roles — the EXCEPTION, not the default; most tickets run everything as the primary `LOGIN_EMAIL` user):**
1. `@PR @Smoke` — Authorized user sees and can interact with the element
2. `@Regression` — Unauthorized user does NOT see it (element absent or route Forbidden) — a positive-only test can never catch an over-exposure regression
3. Repeat on EVERY screen the element appears on. Role users are auto-provisioned by the global `cy.ensureQaUsers()` prerequisite (primary via `LOGIN_EMAIL`, a restricted user via `NEGATIVE_LOGIN_EMAIL`, plus whatever role shapes your product defines — all log in with `LOGIN_PASSWORD`); add a new shape to `cypress/tasks/ensureQaUsers.js` if a test needs one.

---

## DATA & ENVIRONMENT RESILIENCE

- **Deterministic data**: pick test data in `before()` with `cy.task("queryDb", ...)` filters encoding every precondition (status, product/sale/payment type, store/state, expiration). Never rely on "whatever the page shows".
- **Candidate fallback ("use another data")**: select the top 3–5 candidates and probe each via `cy.api` until one satisfies the runtime preconditions; log skipped candidates (keep a `pickWorking<Resource>` helper pattern in existing JiraTicket specs).
- **Environment-gated skips**: probe external dependencies (third-party integrations, SSO) or optional data in `before()` and gate with `function () { if (!available) this.skip(); }` — never a pass-either-way assertion.
- **Controlled React inputs** that reset state per keystroke (datepickers, quote-linked amount fields): set the value in ONE shot via native setter + `dispatchEvent(new win.Event("input", { bubbles: true }))` — `clear().type()` fires intermediate onChange and loses keystrokes (keep the one-shot setter helper in the relevant Page Object).
- **Stepping-stone assertions**: before asserting an element is absent, assert a sibling landmark IS present so "page never loaded" and "visibility wrong" fail differently.

---

## STRICT RULES

- Always `cy.loginAndGetSessionCookie()` in `beforeEach` (not `before`), followed by `cy.visit()` to navigate — or a parameterized journey helper (`goToFeature(loginEmail)`) when tests run the same flow as different role users
- Prefer selectors verified against the REAL DOM, in this order: **id** (`#btn-search`, `#major-radio`), then **label text** (`cy.contains("label", "Order Number")`), then **`name`**, then a stable **class** (`.badge`, `.s-alert-error`). **This app does NOT use `data-testid` — never assume it.** When unsure, inspect the running app or read the existing Page Object in `cypress/e2e/pages/` instead of guessing; put every selector in a Page Object, never inline in the spec
- Never use `cy.wait(<number>)` — use `cy.get(...).should("be.visible")` to wait for elements
- Never use `cy.logger()` — it does not exist; use `cy.log()` only for debug failure output
- Tags: `{ tags: ["@PR", "@Smoke"] }` on happy path, `{ tags: ["@Regression"] }` on edge/negative cases
- Pure JavaScript — no TypeScript

---

## OUTPUT FORMAT

After writing files, show:

| File | Action | Test Cases |
|------|--------|-----------|
| `cypress/e2e/UI/.../file.cy.js` | Created / Updated | N |

Run command:
```bash
npx cypress open --spec "cypress/e2e/UI/<path>/<file>.cy.js" --env CYPRESS_ENV=local
```
