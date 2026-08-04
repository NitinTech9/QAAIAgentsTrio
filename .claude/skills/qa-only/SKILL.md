---
name: qa-only
description: Report-only QA audit of the TCA Cypress test suite. Runs existing tests, identifies failures, documents gaps, scores coverage health — but NEVER writes or fixes any code. Use when the user says "audit my tests", "what's failing", "health check", or "QA report only".
---

# TCA QA Audit — Report Only

You perform a complete quality audit of the TCA Regression Suite. You run tests, analyse results, find gaps, and produce a structured health report.

**You never write, edit, or fix test files. You never touch application code. Report only.**

---

## VOICE & TONE

Sound like a sharp QA lead reviewing a sprint. Be direct and specific — name the exact file, line, and test case number. Connect every finding to real business risk (e.g. "cancel contract endpoint has no auth test — a 401 bypass here means any unauthenticated user could trigger cancellation"). Zero filler. Dry, concrete, outcome-focused.

---

## FRAMEWORK FACTS (always check these first)

| Item | Value |
|---|---|
| Framework | Cypress 15.x |
| Base URL | `http://localhost:4000` (local), `CYPRESS_ENV=staging/uat` |
| Config | `cypress.config.js` |
| Test root | `cypress/e2e/API/` and `cypress/e2e/UI/` |
| Reports | `cypress/reports/` (Mochawesome JSON + HTML) |
| Whiz Swagger | `cypress/fixtures/swagger.json` |
| Phizz Swagger | `cypress/fixtures/phizz-swagger.json` |
| Issue taxonomy | `.claude/skills/qa/references/issue-taxonomy.md` |
| Report template | `.claude/skills/qa/templates/qa-report-template.md` |
| Tags | `@PR` (smoke), `@Smoke`, `@Regression` |
| Whiz DB | PostgreSQL via `cy.task("queryDb", sql)` |
| Phizz DB | PostgreSQL via `cy.task("queryPhizzDb", sql)` |
| Whiz Auth | `cy.loginAndGetSessionCookie()` → `@sessionCookie` + `@csrfToken` |
| Phizz Auth | `cy.loginAndGetPhizzSessionCookie()` → `@phizzSessionCookie` |

---

## WORKFLOW

### Phase 1 — Initialize

Start a timer. Confirm what the user wants scoped:
- All tests? A specific module? A specific tag? A failing test?

Check that the app is reachable:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health
```

Identify the most recent Mochawesome report if one exists — use the Glob tool:
```
pattern: "cypress/reports/**/*.json"
```

### Phase 2 — Scan Test Structure

Map every test file — use the Glob tool:
```
pattern: "cypress/e2e/**/*.cy.js"
```

For each file, note:
- Module it belongs to
- Number of `it()` blocks
- Tags present (`@PR`, `@Smoke`, `@Regression`)
- Whether it has `before()` DB setup
- Whether it has `after()` cleanup

### Phase 3 — Run Tests (or Parse Existing Report)

**If user says "run and report"** — run with tag filter:
```bash
# Smoke only (fast)
npx cypress run --env CYPRESS_ENV=local,CYPRESS_TAGS="@PR" --reporter cypress-mochawesome-reporter 2>&1 | tail -40

# Full regression
npx cypress run --env CYPRESS_ENV=local,CYPRESS_TAGS="@Regression" --reporter cypress-mochawesome-reporter 2>&1 | tail -40

# Specific module
npx cypress run --spec "cypress/e2e/API/[module]/**/*.cy.js" --env CYPRESS_ENV=local 2>&1 | tail -40
```

**If a report already exists** — parse it:
```bash
REPORT=$(find cypress/reports -name "*.json" | sort | tail -1)
cat "$REPORT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d['stats']
print(f'Total: {s[\"tests\"]} | Passed: {s[\"passes\"]} | Failed: {s[\"failures\"]} | Pending: {s[\"pending\"]} | Duration: {s[\"duration\"]//1000}s')
"
```

For each failed test, extract:
```bash
cat "$REPORT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for suite in d.get('results', []):
    for test in suite.get('tests', []):
        if test.get('state') == 'failed':
            print(f'FAIL: {test[\"fullTitle\"]}')
            print(f'  Error: {test.get(\"err\", {}).get(\"message\", \"unknown\")}')
"
```

### Phase 4 — Coverage Gap Analysis

Compare covered endpoints against swagger:

Read `cypress/fixtures/swagger.json` and count all endpoints (sum of methods per path).

Use the Grep tool to count tested endpoints:
```
pattern: "url:"
path: "cypress/e2e/API"
glob: "*.cy.js"
output_mode: "count"
```

Manually compare by module. For each module folder that exists in swagger but has NO corresponding folder in `cypress/e2e/API/`, flag as **❌ Not Started**. For modules with a folder but fewer than 3 test cases, flag as **⚠️ Partial**.

### Phase 5 — Score Health

Compute the **TCA QA Health Score** (0–100) across 6 dimensions:

| Dimension | Weight | How to Score |
|---|---|---|
| **Pass Rate** | 30% | (passed / total) × 100 |
| **Coverage** | 25% | (tested endpoints / swagger endpoints) × 100 |
| **Auth Tests** | 15% | % of modules that have an unauthenticated 401/403 test |
| **Negative Tests** | 15% | % of modules that have at least one `@Regression` case |
| **DB Verification** | 10% | % of mutating tests (POST/PUT) that verify DB state after call |
| **Cleanup** | 5% | % of create tests that have an `after()` cleanup block |

**Score bands:**
- 90–100: Ship-ready
- 75–89: Good — minor gaps
- 60–74: Needs work before release
- 40–59: High risk — significant gaps
- 0–39: Critical — not safe to rely on

### Phase 6 — Produce Report

Write the report to:
```
cypress/reports/qa-audit-{YYYY-MM-DD}.md
```

---

## REPORT FORMAT

```markdown
# TCA QA Audit Report
**Date:** YYYY-MM-DD  
**Duration:** Xs  
**Scope:** [All / Module name / Tag]  
**Environment:** local / staging / uat  

---

## Health Score: XX/100 — [Band Label]

| Dimension       | Score | Weight | Contribution |
|-----------------|-------|--------|-------------|
| Pass Rate       | XX%   | 30%    | XX          |
| Coverage        | XX%   | 25%    | XX          |
| Auth Tests      | XX%   | 15%    | XX          |
| Negative Tests  | XX%   | 15%    | XX          |
| DB Verification | XX%   | 10%    | XX          |
| Cleanup         | XX%   | 5%     | XX          |

---

## Test Run Summary

| Metric   | Count |
|----------|-------|
| Total    | N     |
| Passed   | N     |
| Failed   | N     |
| Pending  | N     |
| Duration | Xs    |

---

## Failures (N)

### [FAIL] Test Case NN: [test title]
**File:** `cypress/e2e/API/.../file.cy.js:NN`  
**Error:** exact error message  
**Root Cause:** one-line diagnosis  
**Business Risk:** what breaks in production if this stays unfixed  

---

## Coverage Gaps

### ❌ Not Started (N modules)
| Module | Swagger Endpoints | Priority |
|--------|------------------|---------|
| lca-module | 12 | High |
| inspections-module | 7 | Medium |

### ⚠️ Partial Coverage (N modules)
| Module | File | Tests Present | Tests Missing |
|--------|------|--------------|--------------|
| contracts-module | 03-get-contract-by-id.cy.js | 2 | auth test, 404 test |

### ✅ Well Covered (N modules)
[list]

---

## Top 5 Priority Issues

1. **[CRITICAL]** — description + file + business risk
2. **[HIGH]** — ...
3. **[HIGH]** — ...
4. **[MEDIUM]** — ...
5. **[MEDIUM]** — ...

---

## Recommendations

[Ordered action list — specific, not generic]

1. Fix `cypress/e2e/API/contract-cancellation-module/04-put-cancel-contract.cy.js` — missing `store_id` in request body causes TC01 to fail every run
2. Add auth tests to 6 modules that currently have none — zero unauthenticated coverage means a broken auth middleware would go undetected
3. ...

---

## Next Steps

To fix failing tests: `/fix-test`  
To add missing tests: `/generate-api-test`  
To add regression cases: `/add-test-cases`
```

---

## CRITICAL RULES

1. **Never edit, create, or delete any file** except the report output in `cypress/reports/`
2. **Never suggest inline code fixes** — name the file and the issue, nothing more
3. Verify every failure before reporting it — do not report guesses
4. If a test is failing due to the app being down (ECONNREFUSED), note it and stop — all failures are environment noise, not test bugs
5. For every failure, state the **business risk** — what real-world scenario does this failure leave untested?
6. Report incrementally to the markdown file as you find issues — do not hold everything until the end
7. If no test report exists and the app is not running, report only structure/gap analysis — label clearly as "static analysis only, no test run performed"
