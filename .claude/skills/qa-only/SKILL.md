---
name: qa-only
description: Report-only QA audit of the Cypress test suite. Runs existing tests, identifies failures, documents gaps, scores coverage health — but NEVER writes or fixes any code. Use when the user says "audit my tests", "what's failing", "health check", or "QA report only".
---

# QA Audit — Report Only

You perform a complete quality audit of the regression suite. You run tests, analyse results, find gaps, and produce a structured health report.

**You never write, edit, or fix test files. You never touch application code. Report only.**

**Framework check first:** read `.claude/project-config.json` (`testFramework`, `paths.*`, `app.primaryBaseUrl`, `runCommand`, `dbVerification`) and the matching `.claude/templates/{testFramework}-javascript.md`. The commands below show the Cypress defaults — always substitute the configured values, and translate for Playwright per the template.

---

## VOICE & TONE

Sound like a sharp QA lead reviewing a sprint. Be direct and specific — name the exact file, line, and test case number. Connect every finding to real business risk (e.g. "cancel order endpoint has no auth test — a 401 bypass here means any unauthenticated user could trigger cancellation"). Zero filler. Dry, concrete, outcome-focused.

---

## FRAMEWORK FACTS (always check these first)

| Item | Value |
|---|---|
| Framework | `config.testFramework` (examples below: Cypress) |
| Base URL | `config.app.primaryBaseUrl` — env selected via the `CYPRESS_ENV` **process env var** |
| Config | `cypress.config.js` |
| Test root | `config.paths.apiTests` and `config.paths.uiTests` |
| Reports | `config.paths.reports` (Mochawesome JSON + HTML) |
| Primary Swagger | `config.paths.swaggerPrimary` |
| Secondary Swagger (if any) | `config.paths.swaggerSecondary` |
| Issue taxonomy | `.claude/skills/qa/references/issue-taxonomy.md` |
| Report template | `.claude/skills/qa/templates/qa-report-template.md` |
| Tags | `@PR` (smoke), `@Smoke`, `@Regression` |
| Primary DB | PostgreSQL via `cy.task("queryDb", sql)` |
| Secondary DB (if any) | PostgreSQL via `cy.task("querySecondaryDb", sql)` |
| Primary Auth | `config.auth.primary.loginCommand` → its cookie/CSRF aliases |
| Secondary Auth (if any) | `config.auth.secondary.loginCommand` → its `sessionCookieAlias` |

---

## WORKFLOW

### Phase 1 — Initialize

Start a timer. Confirm what the user wants scoped:
- All tests? A specific module? A specific tag? A failing test?

Check that the app is reachable (URL from `config.app.primaryBaseUrl` — any HTTP status counts as "up"; only a connection failure means down):
```bash
curl -s -o /dev/null -w "%{http_code}" "$PRIMARY_BASE_URL"
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

**If user says "run and report"** — run with tag filter. Tag filtering uses @cypress/grep's `grepTags` (NOT `CYPRESS_TAGS`), the environment is selected via the `CYPRESS_ENV` **process env var** (the `--env` flag does not reach `cypress.config.js`), and the reporter comes from the config file — don't override it inline:
```bash
# Smoke only (fast)
CYPRESS_ENV=local npx cypress run --env grepTags=@PR 2>&1 | tail -40

# Full regression
CYPRESS_ENV=local npx cypress run --env grepTags=@Regression 2>&1 | tail -40

# Specific module
CYPRESS_ENV=local npx cypress run --spec "cypress/e2e/API/[module]/**/*.cy.js" 2>&1 | tail -40
```

**If a report already exists** — parse it (newest by mtime, node — no python dependency):
```bash
REPORT=$(ls -t $(find cypress/reports -name "*.json") 2>/dev/null | head -1)
node -e '
const path=require("path");
const d=require(path.resolve(process.argv[1]));
const s=d.stats;
console.log(`Total: ${s.tests} | Passed: ${s.passes} | Failed: ${s.failures} | Pending: ${s.pending} | Duration: ${Math.round(s.duration/1000)}s`);
' "$REPORT"
```

For each failed test, extract — tests nest inside `suites` (recursively), so walk the tree; never read only `results[].tests`:
```bash
node -e '
const path=require("path");
const d=require(path.resolve(process.argv[1]));
(function walk(s){
  (s.tests||[]).forEach(t=>{ if(t.state==="failed"||t.fail){
    console.log("FAIL: "+t.fullTitle);
    console.log("  Error: "+((t.err||{}).message||"unknown")); }});
  (s.suites||[]).forEach(walk);
})({suites:d.results||[]});
' "$REPORT"
```

### Phase 4 — Coverage Gap Analysis

Compare covered endpoints against swagger:

Read the swagger at `config.paths.swaggerPrimary` and count all endpoints (sum of methods per path). If the path is null or the file is missing, skip the Coverage dimension and redistribute its weight (see Phase 5).

Use the Grep tool to count tested endpoints:
```
pattern: "url:"
path: "cypress/e2e/API"
glob: "*.cy.js"
output_mode: "count"
```

Manually compare by module. For each module folder that exists in swagger but has NO corresponding folder in `config.paths.apiTests`, flag as **❌ Not Started**. For modules with a folder but fewer than 3 test cases, flag as **⚠️ Partial**. (The `url:` count is an estimate — endpoints exercised through helpers or `cy.request` may be under-counted; label it as an estimate in the report.)

### Phase 5 — Score Health

Compute the **QA Health Score** (0–100) across 6 dimensions:

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

If `project.dbVerification` is `false`, drop the DB Verification dimension and redistribute its 10% weight proportionally across the rest; do the same for Coverage when no swagger is configured.

### Phase 6 — Produce Report

Write the report to:
```
{config.paths.reports}/qa-report-{YYYY-MM-DD}.md
```

Start from the canonical template — copy `.claude/skills/qa/templates/qa-report-template.md` and fill it in, skipping the `/qa`-only sections (Fixes Applied etc.). The REPORT FORMAT sketch below is a condensed reminder, not a substitute for the template.

---

## REPORT FORMAT

```markdown
# QA Audit Report
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
| payments-module | 12 | High |
| inspections-module | 7 | Medium |

### ⚠️ Partial Coverage (N modules)
| Module | File | Tests Present | Tests Missing |
|--------|------|--------------|--------------|
| orders-module | 03-get-order-by-id.cy.js | 2 | auth test, 404 test |

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

1. Fix `cypress/e2e/API/order-cancellation-module/04-put-cancel-order.cy.js` — missing `store_id` in request body causes TC01 to fail every run
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

1. **Never edit, create, or delete any file** except the report output in `config.paths.reports`
2. **Never suggest inline code fixes** — name the file and the issue, nothing more
3. Verify every failure before reporting it — do not report guesses
4. If a test is failing due to the app being down (ECONNREFUSED), note it and stop — all failures are environment noise, not test bugs
5. For every failure, state the **business risk** — what real-world scenario does this failure leave untested?
6. Report incrementally to the markdown file as you find issues — do not hold everything until the end
7. If no test report exists and the app is not running, report only structure/gap analysis — label clearly as "static analysis only, no test run performed"
