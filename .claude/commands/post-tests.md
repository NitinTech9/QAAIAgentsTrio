# Post Test Cases

You are given a ticket ID: **$ARGUMENTS**

Let `TICKET_ID` = the first token of `$ARGUMENTS`.

## Setup: Read Project Config

Read the config per `.claude/protocols/config-read.md`.

Extract:
- `project.ticketSource.type` → `SOURCE` (absent `ticketSource` block ⇒ pre-1.0 config ⇒ `SOURCE = "jira"`)
- `project.ticketSource.{SOURCE}` → `SRC` (for `jira`, fall back to the deprecated top-level `project.jira`)
- `project.paths.ticketContext` → `CONTEXT_DIR`
- `project.paths.manualCases` → `CASES_DIR`
- `project.paths.apiTests` and `project.paths.uiTests` — for spec file search

For `SOURCE = jira`, also extract from `SRC`: `cloudId` → `CLOUD_ID`, `testIssueType` → `TEST_ISSUE_TYPE`, `issueLinkType` → `LINK_TYPE`, `batchSize` → `BATCH_SIZE`, `testAssigneeAccountId` → `TEST_ASSIGNEE` (may be `null`). Extract `PROJECT_KEY` from `TICKET_ID` — all letters before the first dash.

**Validate `TICKET_ID`** against the pattern for `SOURCE` in the "Ticket ID validation" table in `.claude/guides/ticket-sources.md`. If it does not match, stop and print the expected shape for the configured source. Do not proceed.

## Local-Only Mode (`SOURCE = none`)

If `SOURCE = "none"`, this command **writes to disk and exits** — there is nothing to authenticate, nothing to approve, and nothing to link:

1. Render the same markdown a tracker would receive (one `##` section per test case) to `{SRC.outputDir}/TICKET_ID-test-cases.md`.
2. Write the ledger `{CONTEXT_DIR}/TICKET_ID-test-keys.json` with the test case numbers as keys, so re-runs stay idempotent and the automation generators' manual-cases gate is satisfied identically to the tracker paths.
3. Set `steps["post-tests"] = "done"` in pipeline state.
4. Print the output path.

**Skip the review gate.** A `none` run must be fully non-interactive — do not ask for approval to write a local file, and do not warn about absent credentials. Then stop; none of the sections below apply.

## Post Target (`SOURCE` ≠ `none`)

Read the section for `SOURCE` in `.claude/guides/ticket-sources.md` and follow its **Post** steps. The shape differs per tracker, and the "link" step is not the same operation everywhere:

| `SOURCE` | Creates | Links to parent by |
|---|---|---|
| `jira` | one issue of type `TEST_ISSUE_TYPE` per case | `createIssueLink` with `LINK_TYPE` |
| `github` | one issue per case, labelled `SRC.testLabel` | a comment on the parent listing the created numbers (GitHub has no typed links) |
| `azure` | one work item of type `SRC.testWorkItemType` | a `System.LinkTypes.Hierarchy-Reverse` relation patch |
| `clickup` | one task per case in `SRC.listId` | `"parent": TICKET_ID` in the create payload (no separate call) |

Run the same preflight as `fetch-ticket` (MCP connected / `gh` authenticated / token env var set) **before creating anything**. A partial post is worse than no post.

The sections below are written for the Jira path — they are the reference implementation. For other sources, keep every behaviour identical (review gate, ledger, batching, idempotency, resume, summary comment) and swap only the API call.

## Check Pipeline State

Read `{CONTEXT_DIR}/TICKET_ID-pipeline-state.json` (canonical shape).

**Legacy step key.** This step was named `post-tests-to-jira` before v1.0. If `steps["post-tests"]`
is absent but `steps["post-tests-to-jira"]` is present, **use the legacy value** as this step's
status, and write `steps["post-tests"]` with that same value on the next state update (leave the
legacy key in place — deleting it buys nothing and an older checkout would then re-post). Skipping
this fallback would treat an already-posted ticket as unposted and re-run the review gate on it.

- If `steps["post-tests"]` is `"done"`: print `✔ Tests already posted — skipping` and exit.
- If `steps["post-tests"]` is `"partial"`: set `RESUME_MODE = true`. This means some issues were created but linking failed. Skip the review gate and jump directly to **Link Test Issues to Parent** — only retry entries with `"linked": false` in the ledger.
- Otherwise: proceed normally (`RESUME_MODE = false`).

## Prerequisites

- Manual test cases at `{CASES_DIR}/TICKET_ID.md` — must exist.
- Ticket context at `{CONTEXT_DIR}/TICKET_ID.json` — must exist.

If the manual test cases file doesn't exist, tell the user to run `/create-manual-test-cases TICKET_ID` first and stop.

## Read Context

1. Read `{CASES_DIR}/TICKET_ID.md` and parse every test case. The format uses **sections** (### headings) with a `- **Type:** UI|API|Mixed` line, followed by numbered "Verify that..." statements. Each numbered line is one test case. The section's Type applies to all test cases within it.
2. Read `{CONTEXT_DIR}/TICKET_ID.json` for ticket context.
3. **Optional** — find existing automation spec files using the Grep tool (scoped to `apiTests` and `uiTests` with `glob: *.cy.js`, `pattern: TICKET_ID`). If none exist, proceed with manual only — that's OK.

## Load Existing Created-Keys Ledger (idempotency)

Read `{CONTEXT_DIR}/TICKET_ID-test-keys.json` if it exists. Build a map of already-created issues so the step is safe to resume.

**Duplicate detection — two-pass matching (number-first, then text):**
1. **Primary match: test case number** — match by the `number` field in the ledger. This is the stable identifier. If test case #3 was previously posted as `ABC-103`, it's the same test case even if the summary text changed (typo fix).
2. **Fallback match: summary text** — if a test case number doesn't exist in the ledger (e.g. new test case added between runs), fall back to fuzzy summary matching. Normalize both strings (lowercase, strip extra whitespace) before comparing.
3. **Conflict detection** — if a test case number matches but the summary text is substantially different (>50% changed), flag it in the review gate:
   > ⚠️ Test case #N was previously posted as `<JIRA-KEY>` with a different summary. The Jira issue summary will NOT be auto-updated.

## Review Gate — Manual Test Cases Approval

**If `RESUME_MODE = true`:** skip the review gate entirely. Print `🔄 Resuming from partial state — retrying failed links` and jump to **Link Test Issues to Parent**.

Before posting anything to Jira, present the full list to the user.

```
## Manual Test Cases for TICKET_ID — Review Before Posting

| # | Summary | Section | Type | Already In Jira |
|---|---------|---------|------|-----------------|
| 1 | Verify that ... | UI Layout & State | UI | — |
| 2 | Verify that ... | API Negative Tests | API | <KEY> (will skip) |
...

Total: X new + Y already created = Z total. New issues to be created in Jira as {TEST_ISSUE_TYPE}.
```

Ask:
> **Approve Manual Test Cases**
> - **Approve** — `yes` / `approve manual` to create new issues in Jira and link them to TICKET_ID
> - **Remove** — e.g. `remove #3, #7`
> - **Update** — e.g. `update #2 to "Verify that the new wording here"`
> - **Add** — e.g. `add: Verify that activity log records the change` (specify which section to add to)
>
> What would you like to do?

### Handle User Feedback

**Wait for the user's response.** Do NOT proceed to Jira until explicit approval.

Process feedback in a loop:
1. **Remove**: Before removing, check the ledger (`TICKET_ID-test-keys.json`) for each test case being removed. If a test case **already has a Jira key** in the ledger, warn the user:
   > ⚠️ Test case #N (`<JIRA-KEY>`) has already been posted to Jira. Removing it here will NOT delete the Jira issue — it will become an orphan. You may want to manually delete `<JIRA-KEY>` in Jira.
   Wait for the user to confirm they still want to remove it. Then delete from the list, update `{CASES_DIR}/TICKET_ID.md`, renumber remaining items, and re-display.
2. **Update**: Modify test case(s). If the test case already has a Jira key in the ledger, warn:
   > ⚠️ Test case #N (`<JIRA-KEY>`) is already in Jira. Updating here will NOT update the Jira issue summary. You may want to edit `<JIRA-KEY>` in Jira manually.
   Update `{CASES_DIR}/TICKET_ID.md`. Re-display.
3. **Add**: Add to the specified section with the next sequential number. Update `{CASES_DIR}/TICKET_ID.md`. Re-display.
4. **Approve**: Only when the user says `yes`, `approve`, `approve manual`, `looks good`, or `go ahead` — proceed.

Repeat until approved.

## Fetch Parent Issue Fields

Use `mcp__atlassian__getJiraIssue` (with the claude.ai connector the prefix is `mcp__claude_ai_Atlassian__` — resolve by suffix per the Tool-naming rule in `.claude/guides/ticket-sources.md`):
- `cloudId`: `CLOUD_ID`
- `issueIdOrKey`: `TICKET_ID`
- `fields`: `["components", "fixVersions", "priority", "labels"]`

Extract:
- `PARENT_COMPONENTS` = `fields.components` (array; may be empty)
- `PARENT_FIX_VERSIONS` = `fields.fixVersions` (array; may be empty)
- `PARENT_PRIORITY` = `fields.priority.name` (may be null)
- `PARENT_LABELS` = `fields.labels` (array; may be empty)

## Identify the Assignee

If `TEST_ASSIGNEE` (from config) is non-null, use it. Otherwise call `mcp__atlassian__atlassianUserInfo` to get the current user's `accountId` as the fallback.

## Create Test Issues in Jira (Idempotent + Incremental)

For each approved manual test case **not already in the ledger**:

Build `additional_fields` **conditionally** — only include fields when the parent has values, to avoid sending `{id: undefined}`:

```jsonc
{
  // include ONLY if PARENT_COMPONENTS is non-empty
  "components": [{"id": "<id>"}, ...],

  // include ONLY if PARENT_FIX_VERSIONS is non-empty
  "fixVersions": [{"id": "<id>"}, ...],

  // include ONLY if PARENT_PRIORITY is not null
  "priority": {"name": "<PARENT_PRIORITY>"},

  // include ONLY if PARENT_LABELS is non-empty
  "labels": [...]
}
```

Create each issue via `mcp__atlassian__createJiraIssue`:
- `cloudId`: `CLOUD_ID`
- `projectKey`: `PROJECT_KEY`
- `issueTypeName`: `TEST_ISSUE_TYPE`
- `summary`: `<test case text>` (the "Verify that..." statement, trimmed to 255 chars max)
- `assignee_account_id`: `<TEST_ASSIGNEE or current user>`
- `additional_fields`: `<conditionally built object above>`

**Incremental save (critical for resume):** Create issues in parallel **batches of `BATCH_SIZE`**. After each batch completes, append the new `tcId → jiraKey` mappings to `{CONTEXT_DIR}/TICKET_ID-test-keys.json` **before starting the next batch**. If the pipeline is interrupted, the next run reads this ledger and only creates what's missing.

## Link Test Issues to Parent

For each Test issue (from this run's new creations), create an issue link via `mcp__atlassian__createIssueLink`:
- `cloudId`: `CLOUD_ID`
- `inwardIssue`: `<created-test-issue-key>`
- `outwardIssue`: `TICKET_ID`
- `type`: `LINK_TYPE`

Run link creation in parallel. If a link creation fails, continue — record the failure in the ledger under a `linkFailures` array for later retry.

## Ledger Final Shape

```json
{
  "parentTicket": "TICKET_ID",
  "tests": [
    { "number": 1, "jiraKey": "ABC-101", "summary": "Verify that ...", "type": "UI", "linked": true },
    { "number": 2, "jiraKey": "ABC-102", "summary": "Verify that ...", "type": "API", "linked": true }
  ],
  "linkFailures": []
}
```

## Post Summary Comment to Parent Ticket

After all issues are created and linked, post a summary comment to the parent ticket so the team has visibility.

Use `mcp__atlassian__addCommentToJiraIssue`:
- `cloudId`: `CLOUD_ID`
- `issueIdOrKey`: `TICKET_ID`
- `body`: build from the ledger, format as:

```
🧪 *Manual Test Cases Created*

||#||Jira Key||Summary||Type||
|1|ABC-101|Verify that ...|UI|
|2|ABC-102|Verify that ...|API|
...

*Total:* X test cases created and linked.
*Generated by:* QA Automation Pipeline
```

If the comment post is rejected by a transient/auto-approval-classifier error (not a hard 401/403/404), retry the identical call up to 2 more times before giving up. If it still fails, log a warning but do not block — the test issues are already created. Apply the same retry to `createJiraIssue` / `createIssueLink` calls that fail transiently, and in the final Output report posted-vs-failed counts rather than assuming success.

## Update Pipeline State

Only mark `done` if all issues were created **and** all links succeeded. Otherwise mark the state as `"partial"` and warn the user which TCs need retry.

Merge into `{CONTEXT_DIR}/TICKET_ID-pipeline-state.json`:
- Set `steps["post-tests"]` = `"done"` | `"partial"`
- Set `lastUpdated` = current ISO timestamp
- Preserve all other `steps` keys

## Output

- Print a table: TC ID | Jira Key | Linked (✅/❌)
- Total created this run
- Total pre-existing (from ledger)
- Any link failures with their TC IDs
