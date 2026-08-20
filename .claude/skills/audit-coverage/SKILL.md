---
name: audit-coverage
description: Audit what API endpoints are already tested vs missing, compared against the swagger.json. Use when the user asks "what's not covered", "show coverage gaps", or "what tests are missing".
---

# Audit Test Coverage Against Swagger

You perform a full test coverage audit by comparing the swagger.json API spec against the existing Cypress test files.

---

## STEP 1 — Load the swagger specs

Read `.claude/project-config.json` first — the swagger paths come from config:
- **Primary app:** `config.paths.swaggerPrimary`
- **Secondary app (if your suite tests one):** `config.paths.swaggerSecondary`

If `swaggerPrimary` is null or the file doesn't exist, stop and tell the user: coverage auditing needs a swagger/OpenAPI spec — export one from the backend and set `paths.swaggerPrimary` in `.claude/project-config.json`.

Extract every endpoint as: `METHOD /path` (e.g. `GET /api/stores`, `POST /api/orders`)

If there are two backends, keep their endpoints separate in the analysis.

---

## STEP 2 — Scan existing test files

Use the Glob tool to find all test files under `config.paths.apiTests`:
```
pattern: "{config.paths.apiTests}/**/*.cy.js"     (Cypress; use the template's spec glob for Playwright)
```

If `cypress/knowledge/api-catalog.json` exists, use it as the primary endpoint→spec map and verify it by scanning — it is the suite's source of truth for what is covered where.

For each file, read it and extract the `cy.api({ method, url })` calls to build a list of covered endpoints. Also catch `cy.request(...)` calls and template-literal URLs where practical — and note in the report that endpoints exercised through helpers may be under-counted.

Separate tests by backend (if there are two):
- Files in the secondary app's module folder (e.g. `cypress/e2e/API/<secondary-app>-module/`) → secondary coverage
- All other API test folders → primary coverage

---

## STEP 3 — Compare and classify

For each swagger endpoint, classify as:

| Status | Meaning |
|---|---|
| ✅ Covered | A test file exists with at least one happy-path test case |
| ⚠️ Partial | File exists but has only 1 test case, or has no happy-path case (every case is tagged `@Regression` only) |
| ❌ Missing | No test file or test case found for this endpoint |

---

## STEP 4 — Output the report

### Summary table
```
Total endpoints in swagger:     XXX
✅ Covered:                      XXX  (XX%)
⚠️  Partially covered:           XXX  (XX%)
❌ Missing:                      XXX  (XX%)
```

### Grouped by module (missing only)

Group missing endpoints by their natural module area:

```
## ❌ Missing — sales-module (8 endpoints)
- GET  /api/new-sale/supporting-data
- POST /api/new-sale
- GET  /api/sales/{id}
...

## ❌ Missing — payments-module (12 endpoints)
- GET  /api/payments/invoices
...
```

### Priority recommendation

After listing all gaps, recommend which modules to tackle first based on:
1. Business criticality (your core revenue flow = highest)
2. Number of missing endpoints per module
3. Whether existing partial tests can be quickly completed

---

## OUTPUT FORMAT

Always end with:
```
To generate tests for a missing module, run:
/generate-api-test write tests for [module name]
```
