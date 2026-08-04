# Create Manual Test Cases

You are given a Jira ticket ID: **$ARGUMENTS**

Let `TICKET_ID` = the first token of `$ARGUMENTS`.

**If `TICKET_ID` does not match `[A-Z]+-[0-9]+`, stop immediately and tell the user:**
> "A Jira ticket ID is required. Usage: `/create-manual-test-cases <TICKET-ID>`"
**Do not proceed.**

## Setup: Read Project Config

Read `.claude/project-config.json` and extract all values. Then read `.claude/project-config.local.json` if it exists — merge its values over the base config (local takes precedence). Extract all `project.paths.*` values.

## Check Pipeline State

Read `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json` (canonical shape).
If `steps["create-manual-test-cases"]` is `done`, print: `✔ Manual test cases already generated — skipping` and exit.

## Prerequisites (self-healing)

The following files must exist:
- `{config.paths.ticketContext}/TICKET_ID.json` — ticket context
- `{config.paths.ticketContext}/TICKET_ID-discussion.md` — discussion insights
- `{config.paths.ticketContext}/TICKET_ID-analysis.md` — code analysis

**Self-healing:** If any are missing, auto-run the prerequisite command instead of stopping:

1. If `TICKET_ID.json` or `TICKET_ID-discussion.md` is missing → read and execute `.claude/commands/fetch-ticket.md` with `TICKET_ID`, then continue.
2. If `TICKET_ID-analysis.md` is missing → read and execute `.claude/commands/analyze-code.md` with `TICKET_ID`, then continue.

Run them in order (fetch-ticket before analyze-code, since analyze-code depends on the ticket JSON).

**When running standalone** (not via the agent): announce the self-healing so the user knows what happened:
> `🔄 Missing TICKET_ID-analysis.md — auto-running /analyze-code first`

## Read and Analyse All Context

Read all three files in full before writing a single test case:

1. **`TICKET_ID.json`** — description, acceptance criteria, issue type, status
2. **`TICKET_ID-discussion.md`** — key decisions, scenarios, and scope changes from comments
3. **`TICKET_ID-analysis.md`** — affected API endpoints, DB tasks, available commands, Page Objects, and the **Requirements vs Code Comparison** section

**Discussion takes precedence over description.** If a comment clarifies, overrides, or narrows the scope defined in the description, the test cases must reflect the final agreed position from the comment thread — not the original description.

**The Requirements vs Code Comparison section is the primary driver for test scenarios.** Before writing test cases, read the comparison table in `TICKET_ID-analysis.md` and derive the full test scenario set from it:

| Comparison Status | What to generate |
|---|---|
| ✅ Implemented as required | Positive test confirming the behaviour works |
| ⚠️ Partially implemented | Test that exercises the partial path AND a negative test exposing the gap |
| ❌ Not implemented | Test case marked `**Expected to Fail**` — documents the missing behaviour |
| 🔍 Undocumented code behaviour | Test case to protect and document the behaviour |
| Out of scope (per discussion) | Do NOT generate — note it as explicitly excluded |

Before writing test cases, reason through:
- What the ticket originally asked for (from description)
- What the comment discussion changed or clarified (from discussion.md)
- What the code actually does vs. what was required (from analysis.md comparison table)
- Which scenarios from comments must be covered as test cases
- Any scenarios that were explicitly ruled out in comments (do not write tests for these)

## Generate Manual Test Cases

Write to `{config.paths.manualCases}/TICKET_ID.md` using this format.

**Test cases are grouped into sections. Each section MUST have a `- **Type:**` line that is one of: `UI`, `API`, or `Mixed`.** The automation agents route tests based on this field — sections without a Type will be skipped.

Each test case is a single numbered line starting with "Verify that..." — concise, self-contained, and readable without extra metadata.

```markdown
# Test Cases: <TICKET-ID> - <Ticket Title>

## Ticket Summary
<Brief summary>

## Module / Feature
<Which module — e.g. auto-claims-module, contracts-module, admin-module>

## Preconditions
- User is logged in with valid credentials
- <Additional preconditions from ticket>

## Test Cases

### <Section Name> (e.g. "Component & Labor Description Dropdown Behavior")

- **Type:** UI | API | Mixed
1. Verify that <concise test scenario description>
2. Verify that <concise test scenario description>

### <Next Section Name>

- **Type:** API
3. Verify that <concise test scenario description>
4. Verify that <concise test scenario description>
```

### Grouping Guidelines

Group related test cases into logical sections based on the area they cover. Common section patterns:
- **UI Layout & State** — visual layout, disabled states, read-only behavior
- **Core Feature Behavior** — main happy-path user interactions
- **API Negative Tests** — missing params, invalid inputs, error responses
- **Authentication & Authorization** — 401, 403, role-based access
- **Data Persistence & Save/Reload** — save, refresh, DB verification
- **Backward Compatibility** — migration, pre-existing data, regression
- **Edge Cases** — boundary values, empty results, concurrent scenarios

Use section names that are specific to the feature, not generic.

### Test Case Writing Guidelines

1. **Section-level Type tagging is mandatory** — write `UI` for purely browser interaction tests, `API` for purely HTTP/endpoint tests, `Mixed` if the section covers UI + API together.
2. **Each test case is one numbered line** starting with "Verify that..." — no sub-bullets, no steps, no expected results as separate fields. The statement itself must be clear enough to understand what to verify and what the expected outcome is.
3. **Numbering is sequential across sections** — do not restart numbering per section (e.g. section 1 has 1-5, section 2 continues from 6).
4. **Comparison-first** — use the Requirements vs Code Comparison table in `TICKET_ID-analysis.md` as the primary source for deciding which test cases to write.
5. **Discussion-first over description** — if the comment thread refines or overrides the description, generate test cases based on the final agreed position.
6. **Cover all acceptance criteria** from the Jira ticket, updated by any comment clarifications.
7. **Cover specific scenarios from comments** — if a commenter described a reproduction case or edge case, write a test case for it.
8. **Respect scope decisions from comments** — if a commenter said "we won't fix X in this ticket", do not write test cases for those scenarios.
9. **Include positive tests** — happy path: valid inputs, expected behavior.
10. **Include negative tests** — invalid inputs, missing required fields, error responses.
11. **Include auth tests** — unauthenticated (401), unauthorized roles (403).
12. **Include edge cases** — boundary values, empty arrays, large payloads.
13. **Include persistence tests** — save, reload, DB verification where applicable.
14. **Include backward compatibility** — if the feature changes existing behavior, verify pre-existing data still works.

## Test Count Advisory

Read `config.testLimits` from the project config. Manual test cases are **not hard-limited** (unlike automation specs), but if the total count exceeds a reasonable threshold, warn the user:

- If total test cases > 30: print a warning:
  > ⚠️ Generated N test cases — this is unusually high. Consider whether all are necessary before posting to Jira. The review gate in `/post-tests-to-jira` will let you remove any before creating issues.
- If total test cases <= 30: no warning needed.

This is advisory only — do not truncate or drop test cases.

## Update Pipeline State

Merge into `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json`:
- Set `steps["create-manual-test-cases"]` = `"done"`
- Set `lastUpdated` = current ISO timestamp

## Output

Print:
- Number of manual test cases created
- Number of sections
- Breakdown by Type: `UI: N, API: N, Mixed: N`
- File path: `{config.paths.manualCases}/TICKET_ID.md`
