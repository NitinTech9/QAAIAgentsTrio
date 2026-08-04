---
name: audit-coverage
description: Audit what API endpoints are already tested vs missing, compared against the swagger.json. Use when the user asks "what's not covered", "show coverage gaps", or "what tests are missing".
---

# Audit Test Coverage Against Swagger

You perform a full test coverage audit by comparing the swagger.json API spec against the existing Cypress test files.

---

## STEP 1 — Load the swagger specs

Read both swagger files:
- **Whiz (main TCA platform):** `cypress/fixtures/swagger.json`
- **Phizz (claims platform):** `cypress/fixtures/phizz-swagger.json`

Extract every endpoint as: `METHOD /path` (e.g. `GET /api/stores`, `POST /api/contracts`)

Keep Whiz and Phizz endpoints separate in the analysis — they are different backends.

---

## STEP 2 — Scan existing test files

Use the Glob tool to find all test files:
```
pattern: "cypress/e2e/API/**/*.cy.js"
```

For each file, read it and extract the `cy.api({ method, url })` calls to build a list of covered endpoints.

Separate tests by backend:
- Files in `cypress/e2e/API/phizz-module/` → Phizz coverage
- All other API test folders → Whiz coverage

---

## STEP 3 — Compare and classify

For each swagger endpoint, classify as:

| Status | Meaning |
|---|---|
| ✅ Covered | A test file exists with at least one happy-path test case |
| ⚠️ Partial | File exists but only has 1 test case or only negative tests |
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

## ❌ Missing — lca-module (12 endpoints)
- GET  /api/lca/invoices
...
```

### Priority recommendation

After listing all gaps, recommend which modules to tackle first based on:
1. Business criticality (core sales/contracts flow = highest)
2. Number of missing endpoints per module
3. Whether existing partial tests can be quickly completed

---

## OUTPUT FORMAT

Always end with:
```
To generate tests for a missing module, run:
/generate-api-test write tests for [module name]
```
