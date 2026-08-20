# QA Report

<!-- Copy this template to cypress/reports/qa-report-{YYYY-MM-DD}.md at the start of every /qa-run or /qa-audit run -->

---

## Metadata

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Duration | Xs |
| Run by | `/qa-run` or `/qa-audit` |
| Branch | [git branch name] |
| Environment | local / staging / uat |
| Base URL | [config.app.primaryBaseUrl] |
| Scope | All / Module: [name] / Tag: @PR @Smoke @Regression |
| Total test files scanned | N |
| Total `it()` blocks found | N |
| Fixes applied | N (only for `/qa-run`) |
| Regression tests added | N (only for `/qa-run`) |

---

## Health Score: XX/100 — [Ship-ready / Good / Needs Work / High Risk / Critical]

| Dimension | Score | Weight | Contribution | Notes |
|---|---|---|---|---|
| Pass Rate | XX% | 30% | XX | N passed / N total |
| Coverage | XX% | 25% | XX | N endpoints tested / N in swagger |
| Auth Tests | XX% | 15% | XX | N of N modules have 401/403 test |
| Negative Tests | XX% | 15% | XX | N of N modules have @Regression cases |
| DB Verification | XX% | 10% | XX | N of N POST/PUT tests verify DB state |
| Cleanup | XX% | 5% | XX | N of N create tests have after() |
| **TOTAL** | | | **XX** | |

**Score bands:** 90–100 Ship-ready · 75–89 Good · 60–74 Needs work · 40–59 High risk · 0–39 Critical

---

## Test Run Summary

| | Baseline | Final | Delta |
|---|---|---|---|
| Total | N | N | — |
| Passed ✅ | N | N | +N |
| Failed ❌ | N | N | -N |
| Pending ⏭️ | N | N | — |
| Duration | Xs | Xs | — |

---

## Top 3 Priority Issues

<!-- The three issues with highest business risk — link to full detail below -->

1. **[CRITICAL/HIGH]** `[file]:TC-NN` — [one-line description] · Risk: [what breaks in production]
2. **[HIGH/MEDIUM]** `[file]:TC-NN` — [one-line description] · Risk: [what breaks in production]
3. **[MEDIUM]** `[file]:TC-NN` — [one-line description] · Risk: [what breaks in production]

---

## Failures (N)

<!-- One block per failing test case -->

### [FAIL-001] TC-NN: [test case title]
**File:** `cypress/e2e/API/[module]/[file].cy.js`  
**Severity:** Critical / High / Medium / Low  
**Category:** Auth & Security / Request / Response / Database / Structure / Coverage / Environment  
**Sub-type:** [from issue-taxonomy.md]  

**Error:**
```
[exact error message from Cypress output]
```

**Root Cause:** [one sentence — what is actually wrong]  
**Business Risk:** [what real scenario is left untested or broken]  
**Fix Applied:** ✅ Verified / ⚠️ Best-effort / ❌ Reverted / 🔵 Deferred  
**Commit:** `[sha] fix(qa): [message]` _(only for /qa-run)_  
**Regression Test Added:** TC-NN _(only for /qa-run)_  

---

## Coverage Gaps

### ❌ Not Started — N modules

| Module Folder | Swagger Endpoints | Priority | Reason Not Started |
|---|---|---|---|
| `payments-module/` | 12 | High | Not yet implemented |
| `inspections-module/` | 7 | Medium | Not yet implemented |

### ⚠️ Partial Coverage — N modules

| Module | File | Tests Present | Key Gaps |
|---|---|---|---|
| `orders-module` | `03-get-order-by-id.cy.js` | 2 | No 404 test, no auth test |
| `order-cancellation-module` | `04-put-cancel-order.cy.js` | 5 | No DB cleanup |

### ✅ Well Covered — N modules

<!-- Modules with happy path + at least one negative + auth test -->
- `login-module` (4 TCs — happy path, invalid creds, missing fields, session)
- `health-module` (3 TCs — 200, SSO user, unauth)

---

## Issue Summary by Severity

| Severity | Count | Fixed (this run) | Deferred |
|---|---|---|---|
| Critical | N | N | N |
| High | N | N | N |
| Medium | N | N | N |
| Low | N | N | N |
| **Total** | N | N | N |

---

## Issue Summary by Category

| Category | Count |
|---|---|
| Auth & Security | N |
| Request / Contract | N |
| Response / Assertion | N |
| Database / State | N |
| Test Structure | N |
| Coverage Gap | N |
| Environment / Config | N |

---

## Fixes Applied (N) — `/qa-run` only

<!-- One block per fix committed -->

### Fix 1 — `[file]:TC-NN`
**Root cause:** [one sentence]  
**Change:** `[before]` → `[after]` (e.g. `cancellation_date` → `cancel_date`)  
**Files changed:** `cypress/e2e/API/[module]/[file].cy.js`  
**Commit:** `abc1234 fix(qa): [message]`  
**Re-test result:** ✅ Passed / ⚠️ Still failing with different error / ❌ Reverted  
**Regression test:** TC-NN added — guards against [condition]  

---

## Deferred Issues (N)

<!-- Issues not fixed in this run — with reason -->

| Issue | File | Severity | Reason Deferred |
|---|---|---|---|
| TC01 returns 500 | `04-put-cancel-order.cy.js` | High | App-side DB error — not a test bug |
| `payments-module` not covered | — | High | Not yet implemented — use `/generate-api-test` |

---

## Regression Comparison — include when a previous baseline report exists (omit otherwise)

| Metric | Baseline | Current | Delta |
|---|---|---|---|
| Health Score | XX/100 | XX/100 | +/-N |
| Total Issues | N | N | +/-N |
| Critical | N | N | +/-N |
| High | N | N | +/-N |

**Issues Fixed Since Baseline:**
- [issue description] — TC-NN in [file]

**New Issues Since Baseline:**
- [issue description] — TC-NN in [file] (regression introduced by [commit/change])

---

## Ship Readiness Statement

<!-- One paragraph — plain English verdict -->

> [e.g. "The test suite is currently passing X/N smoke tests. The contract cancellation module has a request body mismatch that has been fixed. 3 modules remain untested. Not recommended to rely on this suite as a merge gate until auth tests are added to all modules."]

---

## Recommended Next Actions

<!-- Ordered — most impactful first -->

1. `[specific action]` — `[file or command]` — [why it matters]
2. Run `/generate-api-test` for `payments-module` (12 endpoints, zero coverage)
3. Run `/add-test-cases` on `orders-module` to add 401/403 and 404 tests
4. Run `/qa-audit` after next deploy to confirm no regression

---

*Generated by `/qa-run` or `/qa-audit` skill*
