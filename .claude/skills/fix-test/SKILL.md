---
name: fix-test
description: Diagnose and fix a failing Cypress test. Use when the user pastes a test error, a failing test case, or says "this test is failing" / "fix this test".
---

# Fix a Failing Test

You diagnose why a test is failing and apply the minimal fix needed.

**Framework check first:** read `project.testFramework` from `.claude/project-config.json` and the matching `.claude/templates/{testFramework}-javascript.md`. The error table and fix examples below use Cypress syntax — for Playwright, the equivalents are in the template (e.g. `queryDb(...)` imported from `tests/support/db.js` instead of `cy.task("queryDb", ...)`).

The user will provide EITHER:
- A **Cypress error message** (paste from terminal or runner)
- A **file path** to a failing test
- A **description** of what's failing

---

## DIAGNOSIS WORKFLOW

### Step 0 — Check the knowledge base for a known pattern

(The knowledge folder is `config.paths.knowledge`, default `cypress/knowledge/`. If unset or missing, skip Step 0 and diagnose normally.)

Before diagnosing from scratch, read `cypress/knowledge/failure-patterns.json` (`patterns`) and
match the error string against a known `FP-###`. If it matches, apply that pattern's documented
`fix` directly — this is the fastest, already-proven path (see `cypress/knowledge/_README.md` →
"Protocol for agents & skills"). Also check `cypress/knowledge/api-behavior-notes.json`: if the
failing endpoint is a **documented 5xx app-bug** (`known_500_bugs`), the test is failing
because the app is broken — do NOT "fix" it by accepting the 5xx; report it as a deferred app-bug.

If no entry matches, diagnose normally — and record the new pattern in the write-back step.

### Step 1 — Understand the error type

Classify the error from the message:

| Error pattern | Likely cause |
|---|---|
| `cy.task('queryDb') failed — column "X" does not exist` | Wrong DB column name — check schema |
| `cy.task('queryDb') failed — relation "X" does not exist` | Wrong table name — check the real schema (e.g. `cancel_reasons` vs `cancellation_reasons`) |
| `expected 400 to equal 200` | API request is missing required fields or using wrong field names |
| `expected 200 to equal 400` | API is returning success when it should fail — assertion direction wrong |
| `before all hook failed — skipping remaining tests` | Error in `before()` block — fix that first, all other failures cascade from it |
| `Cannot read properties of undefined` | Variable not set before use — likely a missing `.then()` callback or async timing issue |
| `cy.get('@sessionCookie') — no alias found` | `loginAndGetSessionCookie()` not called in `beforeEach`, or called in wrong hook |
| `Expected to find element ... but never found it` | UI selector wrong or page state incorrect |
| `Connect ECONNREFUSED` | App not running or wrong `CYPRESS_ENV` |

### Step 2 — Read the failing file

Read the test file being referenced. Look at:
- The `before()` / `beforeEach()` setup — is it querying correct DB tables/columns?
- The `cy.api()` call — are field names matching the swagger schema?
- The assertion — is it asserting the right thing?

### Step 3 — Check the swagger for correct field names

Key schemas to reference (paths from `.claude/project-config.json`):
- **Primary app endpoints:** `config.paths.swaggerPrimary` (e.g. `cypress/fixtures/swagger.json`)
- **Secondary app endpoints (if any):** `config.paths.swaggerSecondary`

If the swagger path is null or the file is missing, fall back to the fixture schemas and existing passing specs for correct field names.

Determine which swagger to use based on the test file location:
- Specs under the secondary app's module folder (e.g. `cypress/e2e/API/<secondary-app>-module/**`) → use secondary-swagger.json
- All other API tests → use swagger.json

**Project schema gotchas:**

Maintain a short list here of your product's frequently-hit schema facts, e.g.:
- Required fields on the request bodies tests most often get wrong
- DB table names that differ from what the API naming suggests
- Columns that don't exist and the safe hardcoded value to use instead

### Step 4 — Apply the minimal fix

Fix ONLY what is failing. Do not:
- Refactor unrelated code
- Add new test cases
- Change passing assertions
- Add comments or documentation

---

## COMMON FIXES

**Wrong DB table name:**
```javascript
// Wrong
cy.task("queryDb", `select id from cancellation_reasons limit 1`)
// Correct
cy.task("queryDb", `select id from cancel_reasons limit 1`)
```

**Wrong DB column:**
```javascript
// Wrong — column doesn't exist on this table
cy.task("queryDb", `select id, quantity from orders ...`)
// Correct — select real columns; hardcode the missing value if the API needs it
cy.task("queryDb", `select id, store_id from orders ...`)
quantity = 1;
```

**Wrong swagger field names:**
```javascript
// Wrong
body: { order_id, cancellation_reason_id, cancellation_date }
// Correct per the swagger request schema
body: { order_id, cancel_reason_id, cancel_date, store_id }
```

**Missing csrfToken on mutating request:**
```javascript
// Must be in beforeEach AND in the headers
cy.get("@csrfToken").then((token) => { csrfToken = token; });
// And in the api call:
headers: { Cookie: sessionCookie, "x-csrf-token": csrfToken }
```

**before() hook — often misdiagnosed as an async issue:**
```javascript
// This pattern is FINE — Cypress queues the tasks sequentially, so both
// variables are set before any test runs. Do not "fix" it with waits.
before(() => {
    cy.task("queryDb", sql1).then((rows) => { contractId = rows[0].id; });
    cy.task("queryDb", sql2).then((rows) => { reasonId = rows[0].id; });
});
// The REAL bug in hooks like this is usually reading a field the query
// didn't select — e.g. rows[0].contract_id when the query selected `id`.
```

---

## OUTPUT FORMAT

1. State the **root cause** in one sentence
2. Show the **exact line(s) changed** (before → after)
3. If the fix unblocks a `before()` hook failure, note that all skipped tests will now run
4. **Write back to the knowledge base** — if this was a *new* recurring failure (not already in
   `failure-patterns.json`), append it as the next `FP-###` with `pattern`, `error`, `cause`, `fix`,
   and `example_file`. If you learned a new endpoint quirk or app-bug, add it to
   `api-behavior-notes.json`. This is what makes the next fix faster (per `cypress/knowledge/_README.md`).
   Validate the file after editing: `node -e "JSON.parse(require('fs').readFileSync('cypress/knowledge/failure-patterns.json','utf8'))"`.
