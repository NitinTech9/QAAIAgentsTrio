---
name: qa
description: Full QA cycle for the Cypress suite — run tests, identify failures, fix them with atomic commits, write regression test cases, and produce a health report. Use when the user says "run QA", "fix failing tests", "full QA pass", or "QA and fix".
---

# QA — Run, Fix, and Report

You perform a complete QA cycle: run the test suite, diagnose failures, apply minimal fixes with atomic commits, write regression tests for each fix, and deliver a health report showing before/after scores.

**Framework check first:** read `.claude/project-config.json` (`testFramework`, `paths.*`, `app.primaryBaseUrl`, `runCommand`, `dbVerification`) and the matching `.claude/templates/{testFramework}-javascript.md`. The commands below show the Cypress defaults — always substitute the configured values, and translate for Playwright per the template.

---

## VOICE & TONE

Sharp, product-minded, shipping-focused. Every fix is an atomic commit. Every fix gets a regression test. Name the exact file and line. Connect issues to user-facing risk. No hand-waving — if you fixed it, prove it with a re-run.

---

## FRAMEWORK FACTS

| Item | Value |
|---|---|
| Framework | `config.testFramework` (examples below: Cypress) |
| Base URL | `config.app.primaryBaseUrl` — env selected via the `CYPRESS_ENV` **process env var** |
| Config | `cypress.config.js` |
| Test root | `config.paths.apiTests` and `config.paths.uiTests` |
| Reports | `config.paths.reports` (Mochawesome) |
| Primary Swagger | `config.paths.swaggerPrimary` |
| Secondary Swagger (if any) | `config.paths.swaggerSecondary` |
| Issue taxonomy | `.claude/skills/qa/references/issue-taxonomy.md` |
| Report template | `.claude/skills/qa/templates/qa-report-template.md` |
| Tags | `@PR` (smoke), `@Smoke`, `@Regression` |
| Primary DB | PostgreSQL via `cy.task("queryDb", sql)` |
| Secondary DB (if any) | PostgreSQL via `cy.task("querySecondaryDb", sql)` |
| Primary Auth | `config.auth.primary.loginCommand` → its cookie/CSRF aliases |
| Secondary Auth (if any) | `config.auth.secondary.loginCommand` → its `sessionCookieAlias` |
| Git branch | Check with `git branch --show-current` |

**Primary DB tasks:** `queryDb` plus any purpose-built tasks registered in `cypress.config.js` (list them from `cypress/tasks/`)

**Secondary DB tasks:** `querySecondaryDb` (only if your suite tests a second backend)

**Known DB facts:**
Maintain a short list here of schema gotchas specific to your product, e.g.:
- Exact table names that are easy to get wrong (`cancel_reasons`, NOT `cancellation_reasons`)
- Columns that do/don't exist on frequently queried tables
- Valid status enum values
- Safe hardcoded values for test inputs

---

## WORKFLOW

### Phase 1 — Pre-flight

```bash
# Confirm clean working tree
git status --short

# Confirm app is reachable (URL from config.app.primaryBaseUrl — any HTTP status = up)
curl -s -o /dev/null -w "%{http_code}" "$PRIMARY_BASE_URL"

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

Run the full smoke suite and capture results. Tag filtering uses @cypress/grep's `grepTags` (NOT `CYPRESS_TAGS`), the environment is a **process env var** (the `--env` flag does not reach `cypress.config.js`), and the reporter comes from the config file — don't override it inline:
```bash
CYPRESS_ENV=local npx cypress run \
  --env grepTags=@PR \
  2>&1 | tee cypress/reports/qa-baseline-run.txt | tail -50
```

Parse the JSON report to get baseline counts (newest by mtime, node — no python dependency):
```bash
REPORT=$(ls -t $(find cypress/reports -name "*.json" | grep -v baseline) 2>/dev/null | head -1)
node -e '
const path=require("path");
const d=require(path.resolve(process.argv[1]));
const s=d.stats;
console.log(`BASELINE — Total: ${s.tests} | Passed: ${s.passes} | Failed: ${s.failures} | Duration: ${Math.round(s.duration/1000)}s`);
' "$REPORT"
```

Extract all failures — tests nest inside `suites` (recursively), so walk the tree; never read only `results[].tests`:
```bash
node -e '
const path=require("path");
const d=require(path.resolve(process.argv[1]));
const failures=[];
(function walk(s){
  (s.tests||[]).forEach(t=>{ if(t.state==="failed"||t.fail)
    failures.push({title:t.fullTitle,error:(t.err||{}).message||""}); });
  (s.suites||[]).forEach(walk);
})({suites:d.results||[]});
console.log(JSON.stringify(failures,null,2));
' "$REPORT" > cypress/reports/failures-baseline.json
cat cypress/reports/failures-baseline.json
```

### Phase 3 — Triage Failures

**First, consult the knowledge base** (`cypress/knowledge/_README.md` → "Protocol for agents &
skills"). For each failure:
- Match the error against `cypress/knowledge/failure-patterns.json` (`patterns`) — a matching
  `FP-###` already tells you the cause + proven fix; jump straight to it in Phase 4.
- Check `cypress/knowledge/api-behavior-notes.json` (`known_500_bugs`) — if the failing
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
Cross-reference against swagger if needed (path from `config.paths.swaggerPrimary`):
```bash
node -e '
const path=require("path");
const s=require(path.resolve(process.argv[1]));
for (const [p, methods] of Object.entries(s.paths || {}))
  if (p.toLowerCase().includes("cancel")) console.log(p, Object.keys(methods));
' "cypress/fixtures/swagger.json"
```

**4c. Apply the minimal fix**  
Use the Edit tool. Change only the failing lines. Do not:
- Refactor passing code
- Add comments
- Rename variables
- Change test case structure

**4d. Commit the fix atomically**
```bash
git add [exactly the files you changed — the spec, plus any Page Object/support/fixture file touched]
git commit -m "fix(qa): [file].cy.js:TC-NN — [one-line description of what was wrong]"
```

Commit message format: `fix(qa): [file-name]:TC-NN — [root cause fixed]`  
Example: `fix(qa): 04-put-cancel-order.cy.js:TC01 — add missing store_id and quantity to request body`

**4e. Re-run the fixed test**
```bash
CYPRESS_ENV=local npx cypress run \
  --spec "cypress/e2e/API/[module]/[file].cy.js" \
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
        url: "/api/orders/cancel",
        body: {
            order_id: orderId,
            cancel_date: today,
            cancel_reason_id: cancelReasonId,
            quantity: 1,
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

Read the swagger file(s) and count endpoints:
- `config.paths.swaggerPrimary` (primary app)
- `config.paths.swaggerSecondary` (secondary app, if your suite tests one)

If the primary swagger path is null or missing, skip the Coverage dimension and redistribute its weight (see Phase 6).

Use the Grep tool to count tested endpoints:
```
pattern: "url:"
path: "cypress/e2e/API"
glob: "*.cy.js"
output_mode: "count"
```

Report coverage separately per backend. Flag missing modules (no folder exists) as **❌ Not Started**. Flag modules with <3 test cases as **⚠️ Partial**.

### Phase 6 — Final Run & Health Score

```bash
CYPRESS_ENV=local npx cypress run \
  --env grepTags=@PR \
  2>&1 | tail -30
```

Compute QA Health Score (0–100):

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

If `project.dbVerification` is `false`, drop the DB Verification dimension and redistribute its 10% weight proportionally; do the same for Coverage when no swagger is configured.

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

## REPORT FORMAT (condensed reminder — the template file copied above is canonical; fill ALL of its sections)

```markdown
# QA Report
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
| TC01 still failing | 04-put-cancel-order.cy.js | App-side bug — DB returns 500, not a test issue |

---

## Coverage Gaps

### ❌ Not Started (N modules)
| Module | Swagger Endpoints | Priority |
|---|---|---|
| payments-module | 12 | High |

### ⚠️ Partial Coverage
| Module | Tests Present | Key Gaps |
|---|---|---|
| orders-module | 8 | No auth test, no 404 test on GET by ID |

---

## Top 3 Remaining Risks

1. **[severity]** — description + file + business risk
2. ...
3. ...

---

## Next Steps

- Run `/generate-api-test` to add missing payments-module tests
- Run `/add-test-cases` on orders-module to add auth and 404 coverage
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
