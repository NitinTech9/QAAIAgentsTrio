# QA Issue Taxonomy

Reference for classifying every issue found during a `/qa-run` or `/qa-audit` run.
Always assign both a **severity** and a **category** to every issue.

---

## Severity Levels

### Critical
Blocks a core business workflow, causes data loss, or breaks an entire module.
Fix immediately — do not ship.

Examples:
- Cancel contract API returns 500 and contract status is never updated in DB
- Auth endpoint accepts any password — all accounts accessible without credentials
- `before()` hook fails and all tests in a suite are skipped (0 signal from an entire module)
- POST /api/new-sale silently returns 200 but no sale is created in DB

### High
A feature is broken with no workaround, or a major test coverage gap that hides a real risk.

Examples:
- GET /api/contracts/{id} returns 404 for a valid contract ID
- Unauthenticated request returns 200 instead of 401 (auth bypass)
- An entire module (e.g. `payments-module`) has zero test files — blind spot in CI
- CSRF token not sent on PUT request — all cancellation writes silently rejected

### Medium
Feature works but with noticeable issues, or a test gap that is unlikely to hide a critical bug.

Examples:
- Response body missing an expected field (`store_id` absent from contract detail)
- Test uses wrong field name (`cancellation_date` instead of `cancel_date`) — test is always red but never blocks CI because it is tagged `@Regression` only
- DB cleanup missing after a POST test — data accumulates across runs
- A module has happy-path tests but no negative cases at all

### Low
Minor correctness issue, test hygiene, or naming inconsistency that does not affect reliability.

Examples:
- Test case description says "returns 200" but asserts `oneOf([200, 201])`
- File missing zero-padding in name (`1-loginAPI.cy.js` instead of `01-post-login.cy.js`)
- `cy.logger()` used — not a real Cypress command; replace with `cy.log()`
- Commented-out test cases never uncommented

---

## Seven Categories

### 1. Auth & Security
Issues with authentication, authorisation, CSRF, session management, or missing security tests.

| Sub-type | Example |
|---|---|
| Missing auth test | Module has no unauthenticated 401/403 test case |
| Auth bypass | Unauthenticated request returns 200 |
| CSRF missing | PUT/POST call omits `x-csrf-token` header |
| Session leak | `@sessionCookie` alias used across tests without `beforeEach` reset |
| Token expiry untested | No test for expired/invalid session cookie |

### 2. Request / Contract
Issues with API request structure — wrong field names, missing required fields, wrong types.

| Sub-type | Example |
|---|---|
| Wrong field name | `cancellation_date` instead of `cancel_date` (swagger mismatch) |
| Missing required field | `store_id` or `mileage` absent from cancel contract body |
| Wrong type | Sending `mileage: "50000"` (string) instead of `50000` (integer) |
| Extra field | Sending `note` field that swagger marks as not accepted |
| Wrong HTTP method | Using POST where swagger specifies PUT |

### 3. Response / Assertion
Issues with response validation — asserting wrong fields, wrong status codes, or missing type checks.

| Sub-type | Example |
|---|---|
| Wrong status expected | `expect(200)` but API returns `201` on create |
| Missing field assertion | Response body not checked for `id`, `status`, etc. |
| No type check | Value exists but type never validated (number vs string) |
| Array not checked | Response is array but never asserted `.to.be.an("array")` |
| Overly permissive | `oneOf([400, 422, 500])` — too wide to be meaningful |

### 4. Database / State
Issues with DB setup, teardown, state verification, or missing DB assertions.

| Sub-type | Example |
|---|---|
| Wrong table name | `cancellation_reasons` instead of `cancel_reasons` |
| Wrong column name | `odometer` column does not exist on `contracts` table |
| No DB verify | POST test never confirms the row was created in DB |
| No cleanup | Create test has no `after()` to delete the test record |
| State dependency | TC02 depends on TC01 having run successfully (fragile ordering) |
| Wrong initial state | Querying `Active` contracts but none exist — `before()` fails |

### 5. Test Structure
Issues with how the test file is organised — hook misuse, variable scoping, ordering problems.

| Sub-type | Example |
|---|---|
| Missing `before()` | DB-dependent test has no setup — `contractId` is undefined |
| Wrong hook | Data setup in `beforeEach` instead of `before` — runs N times unnecessarily |
| `const` instead of `let` | Variable declared with `const` but assigned inside Cypress chain |
| No `failOnStatusCode: false` | Negative test will throw before the assertion runs |
| Hardcoded IDs | `contract_id: 42` instead of querying DB — breaks on fresh environments |
| Missing tag | Happy-path test not tagged `@PR` — excluded from PR gate runs |

### 6. Coverage Gap
Endpoints or scenarios that have no test coverage at all.

| Sub-type | Example |
|---|---|
| Module not started | `payments-module` has no folder in `cypress/e2e/API/` |
| Endpoint missing | GET `/api/contracts/{id}` exists in swagger but no test file |
| Negative not covered | POST test exists but no missing-required-field test |
| Auth not covered | Module has happy-path tests but no unauthenticated test |
| PUT/POST no DB verify | Mutating test never confirms DB state changed |

### 7. Environment / Configuration
Issues with environment setup, config values, or CI pipeline configuration.

| Sub-type | Example |
|---|---|
| Wrong base URL | `staging` URL used when `local` expected |
| Env var missing | `Cypress.env("LOGIN_EMAIL")` returns undefined |
| App not running | `ECONNREFUSED` on all requests — app is down |
| CI config stale | `main.yml` still references old folder paths after rename |
| DB not seeded | `cancel_reasons` table empty — `before()` fallback to `id = 1` silently wrong |

---

## Severity × Category Quick Reference

| | Auth | Request | Response | Database | Structure | Coverage | Environment |
|---|---|---|---|---|---|---|---|
| **Critical** | Auth bypass | — | — | Data loss | `before()` fails → 0 signal | Entire module missing | App down |
| **High** | No auth test in module | Required field missing | Wrong status expected | Wrong table/column name | No `before()` for DB test | Endpoint missing | Wrong env |
| **Medium** | CSRF missing | Wrong field name | Missing field assertion | No DB verify after mutation | Wrong hook used | No negative cases | Env var missing |
| **Low** | Session not cleared | Extra unused field | Overly permissive `oneOf` | No cleanup `after()` | `const` instead of `let` | No type checks | Minor config |

---

## How to Use This Taxonomy

In every report issue card, set:
```
Severity: Critical | High | Medium | Low
Category: Auth & Security | Request/Contract | Response/Assertion | Database/State | Test Structure | Coverage Gap | Environment/Config
Sub-type: [from table above]
```

The health score itself is computed by the weighted-dimension formula defined in the `/qa-run` and `/qa-audit` skills — do NOT apply per-issue point deductions on top of it. Use **severity** to rank the "Top Priority Issues" list and decide fix order, and **category/sub-type** to fill the report's classification fields.
