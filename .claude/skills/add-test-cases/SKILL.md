---
name: add-test-cases
description: Add more test cases to an existing Cypress test file. Use when the user says "add more test cases to this file", "add negative tests", "add regression cases", or points at an existing test file and wants it expanded.
---

# Add Test Cases to an Existing Test File

You add new test cases to an existing test file without touching what already works.

**Framework check first:** read `project.testFramework` from `.claude/project-config.json` and the matching `.claude/templates/{testFramework}-javascript.md` — follow its syntax and conventions. The examples below use Cypress syntax; for Playwright, translate per the template and never emit `cy.*` calls into a Playwright suite.

**Step 0 — knowledge base:** before writing cases, check the knowledge folder (`config.paths.knowledge`, default `cypress/knowledge/`) — `api-behavior-notes.json` in particular, applied per `.claude/protocols/knowledge-protocol.md`; status assertions follow `.claude/protocols/status-assertions.md`. If the folder doesn't exist, skip this step.

The user will point at a file (or open it in the IDE) and say what kind of cases to add. If no file was pointed at, or the referenced file doesn't exist, ask which file to extend — do not guess.

---

## BEFORE YOU WRITE ANYTHING

1. **Read the full file** first — understand what test cases already exist
2. Note the **last test case number** — new cases continue from there (e.g., file ends at `Test Case 05` → start at `Test Case 06`)
3. Note the **variables already declared** — reuse them, do not redeclare
4. Note the **auth pattern** — session or bearer, match it exactly
5. Check if the file has a `before()` hook — if new test cases need DB data, add to the existing `before()`, do not create a second one

---

## WHAT KINDS OF CASES TO ADD

**If the user says "add regression cases":**
- Unauthenticated request → `expect 401 or 403`
- Missing required fields → `expect 400 or 422`
- Invalid/non-existent ID → `expect 404 or 400`
- Boundary/edge values
- Wrong data type for a field

**If the user says "add validation tests":**
- Each required field missing one at a time
- Field type mismatches (string where number expected, etc.)
- Empty string vs null vs missing key

**If the user says "add DB verification":**
- After a POST/PUT, query DB with `cy.task("queryDb", sql)` to confirm the row was created/updated
- After a DELETE/cancel, confirm the status changed
- If `project.dbVerification` is `false` in the config, the suite has no direct DB access — say so and skip instead of writing queries that can't run

**If the user says "uncomment the commented tests":**
- Read the commented-out test cases
- Fix any issues (wrong field names, wrong params) based on current swagger schema
- Uncomment and update them

---

## RULES

- Continue the test case numbering from the last existing one
- Same tag convention: `{ tags: ["@PR", "@Smoke"] }` for happy path, `{ tags: ["@Regression"] }` for negative/edge
- Reuse existing `let` variables — never redeclare them
- Keep `failOnStatusCode: false` on ALL test cases (even happy path) and assert manually
- Never use `cy.wait(<number>)`, `cy.logger()`, or TypeScript syntax
- Do not modify existing test cases — only append new ones inside the same `describe` block
- If a `before()` hook already exists, add new DB queries at the end of it — do not create a second `before()`

---

## OUTPUT FORMAT

Show only the **new test cases** you added (not the full file unless it's short).  
State: "Added Test Case XX through Test Case YY to `[file path]`"

Then show the run command:
```bash
CYPRESS_ENV=local npx cypress run --spec "cypress/e2e/API/<path>/<file>.cy.js"
```
