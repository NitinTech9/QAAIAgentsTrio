# Fetch Jira Ticket

You are given a Jira ticket ID: **$ARGUMENTS**

`$ARGUMENTS` may optionally contain a second positional token (used by other commands). Only the first token (the ticket ID) is used here.

**If `$ARGUMENTS` is empty or the first token does not match `[A-Z]+-[0-9]+`, stop immediately and tell the user:**
> "A Jira ticket ID is required. Usage: `/fetch-ticket <TICKET-ID>` (e.g. `/fetch-ticket PROJ-1234`)"
**Do not proceed with any further steps.**

Let `TICKET_ID` = the first token of `$ARGUMENTS`.

## Setup: Read Project Config

Read `.claude/project-config.json` and extract all values. Then read `.claude/project-config.local.json` if it exists — merge its values over the base config (local takes precedence).

Extract:
- `project.jira.cloudId` → `CLOUD_ID`
- `project.paths.ticketContext` → `CONTEXT_DIR`

## Canonical Pipeline State Shape

All commands and agents use this exact shape. Read/write `steps.<key>` — not top-level keys.

```json
{
  "ticketId": "TICKET_ID",
  "steps": {
    "fetch-ticket": "pending|done|skipped"
  },
  "lastUpdated": "<ISO timestamp>"
}
```

## Check Pipeline State

Read `{CONTEXT_DIR}/TICKET_ID-pipeline-state.json` (if it exists).
If `steps["fetch-ticket"]` is `done`, print: `✔ Fetch ticket already completed — skipping` and exit.

## Resolve Cloud ID

The config `cloudId` may be a site domain (e.g. `your-org.atlassian.net`) or a UUID. The Jira MCP tools require the actual cloud ID (UUID format).

**If `CLOUD_ID` does NOT look like a UUID** (i.e. it contains `.` or letters without hyphens):
1. Call `mcp__atlassian__getAccessibleAtlassianResources` to list available sites
2. Find the site whose `url` contains the configured domain
3. Use that site's `id` as the actual `CLOUD_ID`
4. If no match is found, try using the configured value as-is (the MCP adapter may resolve it)

Cache the resolved UUID — do not re-discover on every call.

## Fetch Issue Details

Use `mcp__atlassian__getJiraIssue`:
- `cloudId`: `CLOUD_ID` (resolved UUID)
- `issueIdOrKey`: `TICKET_ID`
- `fields`: `["summary","description","issuetype","status","priority","labels","components","fixVersions","attachment","subtasks","comment"]`
- `expand`: `renderedFields`
- `responseContentFormat`: `markdown`

## Handle Jira API Errors

If `getJiraIssue` returns an error, classify it and respond accordingly:

| Error | Meaning | Action |
|---|---|---|
| **404 Not Found** | Ticket ID doesn't exist or no access | Stop. Print: `❌ Jira ticket TICKET_ID not found. Verify the ticket ID exists and you have access.` |
| **401 Unauthorized** | Auth token expired or invalid | Stop. Print: `❌ Jira authentication failed. Re-authenticate via the Atlassian MCP connection.` |
| **403 Forbidden** | No permission for this project | Stop. Print: `❌ No permission to access TICKET_ID. Check your Jira project permissions.` |
| **Network / timeout** | Jira unreachable | Stop. Print: `❌ Could not reach Jira. Check your network connection and MCP server status.` |
| **Other error** | Unexpected | Stop. Print the raw error message so the user can diagnose. |

Do NOT proceed with empty/partial data. Do NOT create placeholder files on error.

## Extract Comments Reliably

Comments are now guaranteed in the response under `fields.comment.comments` (because we explicitly requested the `comment` field above). Extract **every comment** — do not truncate or summarise.

Each comment must include:
- `author` — `author.displayName`
- `created` — `created` timestamp
- `body` — full markdown text

If `fields.comment.comments` is missing or empty, record an empty comments array. Do **not** fall back to `searchJiraIssuesUsingJql` — that tool returns issue metadata, not comments.

## Extract and Save Ticket Context

Save to `{CONTEXT_DIR}/TICKET_ID.json`:

```json
{
  "ticketId": "TICKET_ID",
  "summary": "...",
  "issueType": "Story|Bug|...",
  "status": "...",
  "priority": "...",
  "labels": [],
  "components": [{"id": "...", "name": "..."}],
  "fixVersions": [{"id": "...", "name": "..."}],
  "description": "... (full markdown) ...",
  "acceptanceCriteria": "...",
  "attachments": [],
  "comments": [
    {
      "author": "Display Name",
      "created": "2026-01-13T10:00:00.000Z",
      "body": "... full comment text ..."
    }
  ],
  "subtasks": []
}
```

For each subtask entry in `fields.subtasks`, call `getJiraIssue` again to fetch its full details if needed for analysis — otherwise store only key + summary.

## Extract Discussion Insights

Read description + every comment. Save to `{CONTEXT_DIR}/TICKET_ID-discussion.md`:

```markdown
# Discussion Insights: TICKET_ID

## Final Understanding of the Bug / Feature
<Summarise what the ticket is actually asking for, based on description + all comments>

## Key Decisions from Comments
- e.g. "Comment by John on Jan 5: confirmed the issue only affects monthly plans"

## Scenarios Mentioned in Comments

## Open Questions / Ambiguities

## Impact on Test Cases
<How the discussion changes or refines the test cases vs. description alone>
```

## Update Pipeline State

Update `{CONTEXT_DIR}/TICKET_ID-pipeline-state.json`:
- If the file does not exist, create it with the canonical shape above
- Set `steps["fetch-ticket"]` = `"done"`
- Set `lastUpdated` = current ISO timestamp
- **Merge** — never overwrite other keys already present in `steps`

## Output

Print a summary:
- Title, type, status, priority
- Key acceptance criteria
- Number of comments fetched and key insights extracted
- Confirm both files saved:
  - `{CONTEXT_DIR}/TICKET_ID.json`
  - `{CONTEXT_DIR}/TICKET_ID-discussion.md`
