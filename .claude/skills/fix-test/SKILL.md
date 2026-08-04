---
name: fix-test
description: Diagnose and fix a failing Cypress test. Use when the user pastes a test error, a failing test case, or says "this test is failing" / "fix this test".
---

# Fix a Failing Cypress Test

You diagnose why a Cypress test is failing and apply the minimal fix needed.

The user will provide EITHER:
- A **Cypress error message** (paste from terminal or runner)
- A **file path** to a failing test
- A **description** of what's failing

---

## DIAGNOSIS WORKFLOW

### Step 0 — Check the knowledge base for a known pattern

Before diagnosing from scratch, read `cypress/knowledge/failure-patterns.json` (`patterns`) and
match the error string against a known `FP-###`. If it matches, apply that pattern's documented
`fix` directly — this is the fastest, already-proven path (see `cypress/knowledge/_README.md` →
"Protocol for agents & skills"). Also check `cypress/knowledge/api-behavior-notes.json`: if the
failing endpoint is a **documented 5xx app-bug** (`known_500_bugs_phizz`), the test is failing
because the app is broken — do NOT "fix" it by accepting the 5xx; report it as a deferred app-bug.

If no entry matches, diagnose normally — and record the new pattern in the write-back step.

### Step 1 — Understand the error type

Classify the error from the message:

| Error pattern | Likely cause |
|---|---|
| `cy.task('queryDb') failed — column "X" does not exist` | Wrong DB column name — check schema |
| `cy.task('queryDb') failed — relation "X" does not exist` | Wrong table name — common: `cancellation_reasons` should be `cancel_reasons` |
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

Key schemas to reference:
- **Whiz endpoints:** `cypress/fixtures/swagger.json`
- **Phizz endpoints:** `cypress/fixtures/phizz-swagger.json`

Determine which swagger to use based on the test file location:
- `cypress/e2e/API/phizz-module/**` → use phizz-swagger.json
- All other API tests → use swagger.json

**Common Whiz schemas:**

- `CancelContractOptions` required fields: `cancel_date`, `cancel_reason_id`, `mileage`, `store_id`
- Estimate quote GET params: `cancel_reason_id`, `mileage`, `cancel_date`
- DB table: `cancel_reasons` (NOT `cancellation_reasons`)
- DB table: `contracts` columns: `id`, `status`, `store_id` (NO `odometer` column — use hardcoded `50000`)

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
// Wrong — odometer column doesn't exist
cy.task("queryDb", `select id, odometer from contracts ...`)
// Correct — use hardcoded mileage
cy.task("queryDb", `select id, store_id from contracts ...`)
mileage = 50000;
```

**Wrong swagger field names for cancellation:**
```javascript
// Wrong
body: { contract_id, cancellation_reason_id, cancellation_date }
// Correct per CancelContractOptions schema
body: { contract_id, cancel_reason_id, cancel_date, mileage, store_id }
```

**Missing csrfToken on mutating request:**
```javascript
// Must be in beforeEach AND in the headers
cy.get("@csrfToken").then((token) => { csrfToken = token; });
// And in the api call:
headers: { Cookie: sessionCookie, "x-csrf-token": csrfToken }
```

**before() hook async issue (variables not set):**
```javascript
// Wrong — both tasks run but contractId may not be set when 2nd task reads it
before(() => {
    cy.task("queryDb", sql1).then((rows) => { contractId = rows[0].id; });
    cy.task("queryDb", sql2).then((rows) => { reasonId = rows[0].id; });
});
// Correct — Cypress chains these sequentially automatically, this is fine
// But ensure you're reading the right field: rows[0].id not rows[0].contract_id
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
