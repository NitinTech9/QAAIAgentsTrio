---
name: qa
description: Full QA cycle for the TCA Cypress suite — run tests, identify failures, fix them with atomic commits, write regression test cases, and produce a health report. Use when the user says "run QA", "fix failing tests", "full QA pass", or "QA and fix".
---

# TCA QA — Run, Fix, and Report

You perform a complete QA cycle: run the test suite, diagnose failures, apply minimal fixes with atomic commits, write regression tests for each fix, and deliver a health report showing before/after scores.

---

## VOICE & TONE

Sharp, product-minded, shipping-focused. Every fix is an atomic commit. Every fix gets a regression test. Name the exact file and line. Connect issues to user-facing risk. No hand-waving — if you fixed it, prove it with a re-run.

---

## FRAMEWORK FACTS

| Item | Value |
|---|---|
| Framework | Cypress 15.x |
| Base URL | `http://localhost:4000` (local) |
| Config | `cypress.config.js` |
| Test root | `cypress/e2e/API/` and `cypress/e2e/UI/` |
| Reports | `cypress/reports/` (Mochawesome) |
| Whiz Swagger | `cypress/fixtures/swagger.json` |
| Phizz Swagger | `cypress/fixtures/phizz-swagger.json` |
| Issue taxonomy | `.claude/skills/qa/references/issue-taxonomy.md` |
| Report template | `.claude/skills/qa/templates/qa-report-template.md` |
| Tags | `@PR` (smoke), `@Smoke`, `@Regression` |
| Whiz DB | PostgreSQL `whiz` via `cy.task("queryDb", sql)` |
| Phizz DB | PostgreSQL `phizz` via `cy.task("queryPhizzDb", sql)` |
| Whiz Auth | `cy.loginAndGetSessionCookie()` → `@sessionCookie` + `@csrfToken` |
| Phizz Auth | `cy.loginAndGetPhizzSessionCookie()` → `@phizzSessionCookie` |
| Git branch | Check with `git branch --show-current` |

**Whiz DB tasks:** `queryDb`, `updateContract`, `getContractStatus`, `deleteAccountingRule`, `deleteAccountingFeeRule`, `deleteProductAndRelations`, `selectCancellationById`, `getLatestInvoiceNumber`

**Phizz DB tasks:** `queryPhizzDb`

**Known DB facts:**
- Table: `cancel_reasons` (NOT `cancellation_reasons`)
- Table: `contracts` — columns: `id`, `status`, `store_id` (no `odometer` column)
- Contract statuses: `'Active'`, `'Cancelled'`, `'Voided'`
- Hardcode `mileage = 50000` for cancellation estimate tests

---

## WORKFLOW

### Phase 1 — Pre-flight

```bash
# Confirm clean working tree
git status --short

# Confirm app is reachable
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health

# Record baseline branch
git branch --show-current
```

If the working tree is dirty (uncommitted changes), ask the user:
> "Working tree has uncommitted changes. Should I stash them before starting, or proceed anyway?"

Record start time. Create output dir:
```bash
mkdir -p cypress/reports
```

### Phase 2 — Baseline Run

Run the full smoke suite and capture results:
```bash
npx cypress run \
  --env CYPRESS_ENV=local,CYPRESS_TAGS="@PR" \
  --reporter cypress-mochawesome-reporter \
  2>&1 | tee cypress/reports/qa-baseline-run.txt | tail -50
```

Parse the JSON report to get baseline counts:
```bash
REPORT=$(find cypress/reports -name "*.json" | grep -v baseline | sort | tail -1)
python3 -c "
import sys, json
with open('$REPORT') as f:
    d = json.load(f)
s = d['stats']
print(f'BASELINE — Total: {s[\"tests\"]} | Passed: {s[\"passes\"]} | Failed: {s[\"failures\"]} | Duration: {s[\"duration\"]//1000}s')
"
```

Extract all failures:
```bash
python3 -c "
import json
with open('$REPORT') as f:
    d = json.load(f)
failures = []
for suite in d.get('results', []):
    for test in suite.get('tests', []):
        if test.get('state') == 'failed':
            failures.append({
                'title': test['fullTitle'],
                'error': test.get('err', {}).get('message', '')
            })
print(json.dumps(failures, indent=2))
" > cypress/reports/failures-baseline.json
cat cypress/reports/failures-baseline.json
```

### Phase 3 — Triage Failures

**First, consult the knowledge base** (`cypress/knowledge/_README.md` → "Protocol for agents &
skills"). For each failure:
- Match the error against `cypress/knowledge/failure-patterns.json` (`patterns`) — a matching
  `FP-###` already tells you the cause + proven fix; jump straight to it in Phase 4.
- Check `cypress/knowledge/api-behavior-notes.json` (`known_500_bugs_phizz`) — if the failing
  endpoint is a documented app-bug, classify it as **deferred (app-side)** immediately; do not
  attempt a fix and never accept the 5xx in an assertion.
- Cross-check `cypress/knowledge/test-run-history.json` — a test that flips pass/fail across runs is
  **flaky**; mark it as such rather than "fixing" it.

Then classify the remaining failures:

| Error pattern | Root cause | Fix type |
|---|---|---|
| `column "X" does not exist` | Wrong DB column | Fix SQL query |
| `relation "X" does not exist` | Wrong table name | Fix table name |
| `expected 400 to equal 200` | Wrong request body fields | Fix field names per swagger |
| `before all hook failed` | Error in `before()` — cascades all tests | Fix `before()` first |
| `no alias found for @sessionCookie` | Auth not called in `beforeEach` | Fix hook order |
| `ECONNREFUSED` | App not running | Report environment issue — do not attempt fix |
| `expected 200 to equal 400` | Assertion backwards or API changed | Fix assertion or check swagger |
| `Cannot read properties of undefined` | Null check missing or async timing | Fix the access pattern |

Sort by priority:
1. `before()` failures first — they cascade to all tests in the suite
2. Auth/session failures — affect all tests after them
3. Request body errors — single test impact
4. Assertion errors — single test impact

### Phase 4 — Fix Loop (per failure)

For each fixable failure:

**4a. Read the failing file**
```
Read: cypress/e2e/API/.../failing-file.cy.js
```

**4b. Identify the exact line(s) to change**  
Cross-reference against swagger if needed:
```bash
python3 -c "
import json
with open('cypress/fixtures/swagger.json') as f:
    s = json.load(f)
# Find the relevant endpoint schema
for path, methods in s.get('paths', {}).items():
    if 'cancel' in path.lower():
        print(path, list(methods.keys()))
"
```

**4c. Apply the minimal fix**  
Use the Edit tool. Change only the failing lines. Do not:
- Refactor passing code
- Add comments
- Rename variables
- Change test case structure

**4d. Commit the fix atomically**
```bash
git add cypress/e2e/API/[module]/[file].cy.js
git commit -m "fix(qa): TC-NN — [one-line description of what was wrong]"
```

Commit message format: `fix(qa): [file-name]:TC-NN — [root cause fixed]`  
Example: `fix(qa): 04-put-cancel-contract.cy.js:TC01 — add missing store_id and mileage to request body`

**4e. Re-run the fixed test**
```bash
npx cypress run \
  --spec "cypress/e2e/API/[module]/[file].cy.js" \
  --env CYPRESS_ENV=local \
  2>&1 | tail -20
```

**4f. Classify the result:**
- ✅ **Verified** — test passes, move on
- ⚠️ **Best-effort** — test still failing but error changed (document, move on)
- ❌ **Reverted** — fix made things worse → `git revert HEAD --no-edit`, document as deferred

**4g. Write a regression test case**  
Add one new `@Regression` test case to the same file that specifically covers the bug condition that caused the failure. This test must have been red before the fix and green after.

Example: if the bug was "missing `store_id` caused 400", the regression test case is:
```javascript
it("Test Case NN: Validate missing store_id returns 400 or 422", { tags: ["@Regression"] }, () => {
    const today = new Date().toISOString().split("T")[0];
    cy.api({
        method: "PUT",
        url: "/api/contracts/cancel",
        body: {
            contract_id: contractId,
            cancel_date: today,
            cancel_reason_id: cancelReasonId,
            mileage: 50000,
            // store_id intentionally omitted
        },
        headers: { Cookie: sessionCookie, "x-csrf-token": csrfToken },
        failOnStatusCode: false,
    }).then((response) => {
        expect(response.status).to.be.oneOf([400, 422]);
    });
});
```

Commit the regression test:
```bash
git add cypress/e2e/API/[module]/[file].cy.js
git commit -m "test(qa): TC-NN regression — [what the test guards against]"
```

**4h. Write back to the knowledge base**
If the root cause was a *new* recurring pattern (not already in `failure-patterns.json`), append it
as the next `FP-###` (`pattern`, `error`, `cause`, `fix`, `example_file`). If you confirmed a new
endpoint quirk or app-side 5xx, add it to `api-behavior-notes.json`. This is what makes the next
QA run faster — a discovery that isn't written back is lost (per `cypress/knowledge/_README.md`).
Validate edited files with `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`.

**Self-regulation:** If you have made 10+ fixes or 3 consecutive reverts, stop fixing and report what's left as deferred. Do not spiral into a refactoring session.

### Phase 5 — Coverage Gap Analysis (after fixes)

Read both swagger files and count endpoints:
- `cypress/fixtures/swagger.json` (Whiz — main TCA platform)
- `cypress/fixtures/phizz-swagger.json` (Phizz — claims platform)

Use the Grep tool to count tested endpoints:
```
pattern: "url:"
path: "cypress/e2e/API"
glob: "*.cy.js"
output_mode: "count"
```

Report coverage separately for Whiz and Phizz. Flag missing modules (no folder exists) as **❌ Not Started**. Flag modules with <3 test cases as **⚠️ Partial**.

### Phase 6 — Final Run & Health Score

```bash
npx cypress run \
  --env CYPRESS_ENV=local,CYPRESS_TAGS="@PR" \
  --reporter cypress-mochawesome-reporter \
  2>&1 | tail -30
```

Compute TCA QA Health Score (0–100):

| Dimension | Weight | Scoring |
|---|---|---|
| Pass Rate | 30% | (passed / total) × 100 |
| Coverage | 25% | (tested endpoints / swagger endpoints) × 100 |
| Auth Tests | 15% | % of modules with a 401/403 unauthenticated test |
| Negative Tests | 15% | % of modules with at least one `@Regression` case |
| DB Verification | 10% | % of POST/PUT tests that verify DB state after call |
| Cleanup | 5% | % of create tests with `after()` cleanup |

**Score bands:**
- 90–100: Ship-ready
- 75–89: Good — minor gaps
- 60–74: Needs work before release
- 40–59: High risk
- 0–39: Critical

**Record the run in the knowledge base.** Append this run's notable result to
`cypress/knowledge/test-run-history.json` — date, totals (passed/failed), and any test that newly
flipped state (candidate flaky). This is the data Phase 3 reads next time to spot flakiness.
Validate: `node -e "JSON.parse(require('fs').readFileSync('cypress/knowledge/test-run-history.json','utf8'))"`.

### Phase 7 — Write Report

Copy the template and fill it in:
```bash
cp .claude/skills/qa/templates/qa-report-template.md cypress/reports/qa-report-$(date +%Y-%m-%d).md
```

Classify every issue using `.claude/skills/qa/references/issue-taxonomy.md` — assign severity + category + sub-type to each one.

---

## REPORT FORMAT

```markdown
# TCA QA Report
**Date:** YYYY-MM-DD  
**Duration:** Xs  
**Branch:** [branch name]  
**Environment:** local  
**Fixes Applied:** N  
**Regression Tests Added:** N  

---

## Health Score

| | Baseline | Final | Delta |
|---|---|---|---|
| Score | XX/100 | XX/100 | +/-N |
| Band | [label] | [label] | |

| Dimension | Baseline | Final |
|---|---|---|
| Pass Rate | XX% | XX% |
| Coverage | XX% | XX% |
| Auth Tests | XX% | XX% |
| Negative Tests | XX% | XX% |
| DB Verification | XX% | XX% |
| Cleanup | XX% | XX% |

---

## Test Run Summary

| | Baseline | Final |
|---|---|---|
| Total | N | N |
| Passed | N | N |
| Failed | N | N |
| Duration | Xs | Xs |

---

## Fixes Applied (N)

### Fix 1 — [file]:TC-NN
**Root cause:** one sentence  
**Change:** what was changed (before → after), no code block needed  
**Commit:** `abc1234 fix(qa): ...`  
**Regression test added:** TC-NN in same file  
**Status:** ✅ Verified / ⚠️ Best-effort  

---

## Deferred Issues (N)

Issues that were not fixed (with reason):

| Issue | File | Reason deferred |
|---|---|---|
| TC01 still failing | 04-put-cancel-contract.cy.js | App-side bug — DB returns 500, not a test issue |

---

## Coverage Gaps

### ❌ Not Started (N modules)
| Module | Swagger Endpoints | Priority |
|---|---|---|
| lca-module | 12 | High |

### ⚠️ Partial Coverage
| Module | Tests Present | Key Gaps |
|---|---|---|
| contracts-module | 8 | No auth test, no 404 test on GET by ID |

---

## Top 3 Remaining Risks

1. **[severity]** — description + file + business risk
2. ...
3. ...

---

## Next Steps

- Run `/generate-api-test` to add missing lca-module tests
- Run `/add-test-cases` on contracts-module to add auth and 404 coverage
- Run `/qa-only` after next deploy to verify nothing regressed
```

---

## CRITICAL RULES

1. **One commit per fix** — never bundle multiple fixes in one commit
2. **One regression test per fix** — must be red before fix, green after
3. **Never fix app-side bugs** — if the API is broken, document it as deferred
4. **Never refactor** — touch only the failing lines
5. **`failOnStatusCode: false`** on every test case — always assert manually
6. **Revert immediately** if a fix causes a previously passing test to fail
7. **Stop after 10 fixes or 3 consecutive reverts** — report remainder as deferred
8. **Never hardcode credentials** — use `Cypress.env("LOGIN_EMAIL")` etc.
9. If `ECONNREFUSED` errors appear — the app is not running; halt immediately and report environment issue
10. Every fix must be re-tested before moving to the next one — never stack untested fixes
11. **Use the knowledge base both ways** — read `cypress/knowledge/*` in triage (known `FP-###`, known 5xx app-bugs, flaky history) and write back new patterns/quirks/run results so each QA run compounds on the last
