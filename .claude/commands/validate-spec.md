# Validate Generated Spec

You are given: **$ARGUMENTS** — `<TICKET-ID> [api|ui]`

Parse `$ARGUMENTS`:
- `TICKET_ID` = first token (must match `[A-Z]+-[0-9]+`)
- `SPEC_TYPE` = second token — must be `api` or `ui`. If missing or invalid, **stop** and ask the user:
  > "Usage: `/validate-spec <TICKET-ID> <api|ui>` — e.g. `/validate-spec PROJ-1234 api`"

Derive:
- `STATE_KEY` = `"validate-" + SPEC_TYPE + "-spec"` (e.g. `validate-api-spec` or `validate-ui-spec`)
- `SEARCH_ROOT` = `{config.paths.apiTests}` when SPEC_TYPE=api; `{config.paths.uiTests}` when SPEC_TYPE=ui. In both cases ALSO search `{config.paths.jiraTicketTests}` — ticket-branch specs live there (see Spec File Placement in create-ui-automated-test-cases.md).

## Setup: Read Project Config

Read `.claude/project-config.json` and extract all values. Then read `.claude/project-config.local.json` if it exists — merge its values over the base config (local takes precedence).

**Framework template:** read `.claude/templates/{config.testFramework}-javascript.md` and follow its spec skeleton, assertion style, run/report facts, and validation rules. Inline examples in this file use Cypress syntax — when `config.testFramework` is not `cypress`, translate them per the template file; never emit `cy.*` calls into a non-Cypress suite. Extract `project.paths.*`.

## Check Pipeline State

Read `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json` (canonical shape).
If `steps[STATE_KEY]` is `done`, print: `✔ Spec validation already completed — skipping` and exit.

## Find the Spec File

Constrain search to `SEARCH_ROOT` so the API and UI agents never touch each other's specs.

**Step 1** — Use the **Grep** tool (not bash `grep`):
- `pattern`: `TICKET_ID`
- `path`: `SEARCH_ROOT`
- `glob`: `*.cy.js` (Cypress) or `*.spec.js` (Playwright — per the framework template)

**Step 2** — If no match: read `{config.paths.ticketContext}/TICKET_ID.json`, extract 2–3 keywords from the summary, and Grep for those:
- `pattern`: `<keyword1>|<keyword2>`
- `path`: `SEARCH_ROOT`
- `glob`: `*.cy.js` (Cypress) or `*.spec.js` (Playwright — per the framework template)

**Step 3** — If still no match: use **Glob** with `{SEARCH_ROOT}/**/*.cy.js (or *.spec.js per the framework template)` sorted by mtime, show the 5 most recent, and ask the user:
> "I couldn't automatically find the `SPEC_TYPE` spec file for TICKET_ID. Here are the most recently modified spec files — which one should I validate?"

Do not proceed until a single spec file is confirmed. Record its absolute path as `SPEC_FILE`.

## Validation Checks

Read `SPEC_FILE` and run each check. Auto-fix where possible; report items that need manual review.

### Check 1: Ticket ID in Test Names
- Every `it()` block must reference `TICKET_ID` in its description string.
- **Auto-fix:** If missing, prepend `[TICKET_ID] ` to each `it()` description.

### Check 2: No Placeholder Text
Scan for any unresolved placeholders:
- `[NN]`, `[endpoint]`, `[action]`, `[Feature Name]`, `<log-filename>`, `<module-name>`, `<ModuleName>`, `<resource>`
- **Report:** List each placeholder found with line number. Attempt to infer correct values from the analysis file and auto-fill; otherwise flag for manual fix.

### Check 3: Required Hooks Present
- `beforeEach` block must exist with authentication setup
- `afterEach` block must exist with `cy.clearCookies()`
- If `before()` DB setup is present, verify the SQL query references a real task/table (cross-check against `{config.paths.tasks}/`)
- **Auto-fix:** Add missing `afterEach(() => { cy.clearCookies(); })` if absent.

### Check 4: Tags Applied to Every `it()` Block
- Every `it()` must have a `{ tags: [...] }` options object.
- Tags must be one of: `@PR`, `@Smoke`, `@Regression`.
- **Auto-fix:** If tags are missing entirely, add `{ tags: ["@Regression"] }` as a safe default.

### Check 5: Unauthenticated / Access-Control Test Present
- **API spec:** at least one `it()` asserts 401 or 403 when no auth headers are sent.
- **UI spec:** at least one `it()` asserts redirect to login when cookies are cleared.
- **Auto-fix:** If missing, append a standard unauthenticated test to the `describe` block.

### Check 6: `failOnStatusCode: false` on All `cy.api()` Calls (API only)
- Only applies when `SPEC_TYPE = api`.
- All `cy.api()` calls must include `failOnStatusCode: false`.
- **Auto-fix:** Add `failOnStatusCode: false` to any `cy.api()` call that is missing it.

### Check 7: No Hardcoded Credentials
- Scan for hardcoded usernames, passwords, tokens, or connection strings.
- **Report:** Flag any found — must be moved to `Cypress.env()` or fixtures.

### Check 8: Syntax Check
Run a syntax parse via Bash:
```bash
node --check "<SPEC_FILE>"
```
If it fails, report the error with line number and attempt to fix obvious issues (missing brackets, commas, etc.).

### Check 9: No 5xx Accepted in Status Assertions (API only) — HARD GATE
Per `CONTRIBUTING/testing-standards/feedback_status_assertions.md`, a test must be able to FAIL — an assertion must **never** accept a 5xx (a 5xx means the app broke and the test must surface it, not pass). Scan the spec with a **multi-line-aware** scanner (a single-line `grep` misses a `oneOf([\n 200,\n 500\n])` split across lines — BSD `grep` on macOS has no `-P`, so use Node):
```bash
node -e '
const fs=require("fs"),src=fs.readFileSync(process.argv[1],"utf8");
const bad=[]; let m;
const arr=/oneOf\(\s*\[[\s\S]*?\]/g;            // each oneOf array, spans newlines
while((m=arr.exec(src))) if(/\b5\d{2}\b/.test(m[0])) bad.push([m.index,"5xx inside oneOf"]);
const eq=/to\.(equal|include)\(\s*5\d{2}\b/g;    // to.equal(5xx) / to.include(5xx)
while((m=eq.exec(src))) bad.push([m.index,"5xx status assertion"]);
for(const [i,msg] of bad) console.log(`line ${src.slice(0,i).split(/\n/).length}: ${msg}`);
process.exit(bad.length?1:0);
' "<SPEC_FILE>"
```
- **Report (do NOT auto-fix):** list each offending line. The correct code is a judgment call (assert the precise expected code; if the endpoint legitimately 5xx's, that's a backend bug to flag, not absorb). This is a **hard gate** — if any 5xx-accepting assertion exists, mark the spec `NEEDS REVIEW` and do not set pipeline state `done`.

### Check 9b: No Ambiguous 2xx/4xx Status Assertion (API only) — HARD GATE
A `oneOf` that accepts both a 2xx and a 4xx passes whether the call succeeds or fails, so it catches nothing. Scan the spec with the same multi-line-aware approach (honoring the `// status-ambiguous:` escape hatch on the offending line):
```bash
node -e '
const fs=require("fs"),src=fs.readFileSync(process.argv[1],"utf8");
const arr=/oneOf\(\s*\[[\s\S]*?\]/g; const bad=[]; let m;
while((m=arr.exec(src))){
  const b=m[0]; if(!(/\b2\d{2}\b/.test(b)&&/\b4\d{2}\b/.test(b))) continue;
  const eol=src.indexOf("\n",arr.lastIndex);                       // escape hatch check
  if(/status-ambiguous/.test(src.slice(m.index,eol<0?undefined:eol))) continue;
  bad.push(m.index);
}
for(const i of bad) console.log(`line ${src.slice(0,i).split(/\n/).length}: ambiguous 2xx/4xx oneOf`);
process.exit(bad.length?1:0);
' "<SPEC_FILE>"
```
- Assert the precise code — probe the endpoint (curl / prior run output) if unsure.
- Escape hatch for genuinely state-dependent flows: a `// status-ambiguous: <reason>` comment on the same line (the pre-commit hook honors the same marker, on added lines only).
- Watch for the fake-unauthenticated trap: the login command sets the session cookie in the browser jar, so an "unauthenticated" cy.api() without an explicit Cookie header STILL sends it. Truly unauthenticated tests must call `cy.clearCookies()` first — the API then rejects with **401/403** for `/api/*`.

### Check 10: Schema Validation Exists for 200-JSON Endpoints (API only)
Per `feedback_schema_validation.md`, every automated endpoint that returns a 200 JSON body must have a matching schema-validation spec (same change). For each distinct endpoint this spec asserts a 200 on:
- Derive its path (strip base URL + query; treat `${...}`/numeric segments as params).
- Search `cypress/e2e/API/schema-validation/{primary,secondary}/` for a spec exercising the same route (params as wildcards).
- **Report:** list any 200-JSON endpoint with no schema counterpart. **Auto-remediate** by reading and executing `.claude/commands/create-schema-validation.md` with `$ARGUMENTS = TICKET_ID` to generate the missing schema fixture + per-endpoint spec; if it can't be generated (non-JSON 307/PDF/CSV, or no data), note the reason instead. Skip endpoints whose response is non-JSON.

### Check 11: DB Assertion on Every Mutation (API only) — HARD GATE
**Skip this check entirely when `config.dbVerification === false`** (the suite has no direct DB access, e.g. demo mode) — note `⚠ DB verification disabled in config — persistence not proven` in the report instead of failing.

Per `CONTRIBUTING/testing-standards/feedback_db_assertions.md`, a `POST`/`PUT`/`PATCH`/`DELETE`
`cy.api()` that **successfully mutates state** must be backed by a DB assertion (`cy.task("queryDb", …)` /
`cy.task("querySecondaryDb", …)`) proving the change persisted (or the row is gone, for DELETE). A spec that
mutates but only asserts the HTTP status can pass while the write silently failed. Scan the spec — flag
only when a mutation is paired with a **2xx success assertion** and no DB query, so negative-only specs
(that assert 4xx) and non-persisting endpoints are not false-flagged:
```bash
node -e '
const fs=require("fs"),src=fs.readFileSync(process.argv[1],"utf8");
const mutates=/method:\s*["'"'"'](POST|PUT|PATCH|DELETE)["'"'"']/i.test(src);
const assertsSuccess=/to\.equal\(\s*20[0-9]\b/.test(src) || /oneOf\(\s*\[[^\]]*\b20[0-9]\b/.test(src);
const hasDb=/cy\.task\(\s*["'"'"'](queryDb|querySecondaryDb)/.test(src);
if(mutates && assertsSuccess && !hasDb){ console.log("mutation asserts a 2xx success but has NO cy.task queryDb/querySecondaryDb assertion"); process.exit(1); }
process.exit(0);
' "<SPEC_FILE>"
```
- **Report (do NOT auto-fix):** if a spec successfully mutates but has no DB-query task, mark it
  `NEEDS REVIEW` and list it — the correct assertion (which table/row/column proves persistence) is a
  judgment call. This is a **hard gate**: such a spec blocks `done`.
- **Exempt** (not flagged): specs with zero mutations; negative-only mutation tests (assert 4xx, never a
  2xx); and mutations whose success response is non-JSON/non-persisting (PDF, CSV, 307 — note the reason).

## Validation Report

Print a summary table:

```
## Spec Validation Report: TICKET_ID (SPEC_TYPE)

| Check | Status | Action Taken |
|-------|--------|--------------|
| Ticket ID in test names | ✅ Pass | — |
| No placeholder text | ⚠️ Warning | Found [endpoint] on line 23 — needs manual fix |
| Required hooks present | ✅ Pass | afterEach auto-added |
| Tags on all it() blocks | ✅ Pass | — |
| Unauth / access-control test | ✅ Pass | — |
| failOnStatusCode: false | ✅ Pass | Added to 2 cy.api() calls |
| No hardcoded credentials | ✅ Pass | — |
| Syntax check | ✅ Pass | — |
| No 5xx accepted in assertions | ✅ Pass | — (or ❌ Fail — `oneOf([…,500])` on line 41) |
| No ambiguous 2xx/4xx oneOf | ✅ Pass | — (or ❌ Fail — `oneOf([200, 403])` on line 57) |
| Schema validation exists | ✅ Pass | — (or ⚠️ generated 2 missing schema specs / noted 1 non-JSON) |
| DB assertion on mutations | ✅ Pass | — (or ❌ Fail — 2 mutations, no `cy.task("queryDb")`) |

Overall: READY TO RUN ✅  (or: NEEDS REVIEW ⚠️)
```

If any check is `NEEDS REVIEW`, do **not** mark pipeline state `done` — ask the user to resolve issues first. **Checks 9 (no 5xx) and 11 (DB assertion on mutations) are hard gates** — a single offending spec blocks `done`.

## Update Pipeline State

Only if all checks pass (no unresolved warnings):
- Merge into `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json`:
  - Set `steps[STATE_KEY]` = `"done"`
  - Set `lastUpdated` = current ISO timestamp
  - Preserve all other `steps` keys
