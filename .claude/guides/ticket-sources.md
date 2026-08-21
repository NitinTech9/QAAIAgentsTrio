# Ticket Sources

Single source of truth for **how to read a ticket and how to write test cases back**, for every
supported tracker. `fetch-ticket.md` and `post-tests.md` branch on
`ticketSource.type` and follow the matching section here. Nothing else in the framework
talks to a tracker directly.

`ticketSource.type` ∈ `jira` | `github` | `azure` | `clickup` | `none`.

**Adding a source** means adding one section here plus one enum value in
`.claude/schemas/project-config.schema.json`. Do not create per-source command files —
that triplicates ~90% identical boilerplate.

---

## Ticket ID validation

The ID shape differs per source. Validate with the pattern for the configured type and
reject early with the usage message rather than making a doomed API call.

| Type | ID pattern | Example |
|---|---|---|
| `jira` | `^[A-Z][A-Z0-9]+-[0-9]+$` | `PROJ-1234` |
| `github` | `^#?[0-9]+$` | `#412` or `412` |
| `azure` | `^[0-9]+$` | `88213` |
| `clickup` | `^[A-Za-z0-9]+$` | `86b2xyz` |
| `none` | `^[A-Za-z0-9._-]+$` | `LOCAL-1`, `checkout-flow` |

`TICKET_ID` is used verbatim as the filename stem for all context artifacts, so strip a
leading `#` for `github` before using it in paths.

---

## The normalized ticket contract

Every source **must** produce `{CONTEXT_DIR}/TICKET_ID.json` in this exact shape. Downstream
commands (`analyze-code`, `create-manual-test-cases`, the automation generators) read only
this file and never know which tracker it came from.

```json
{
  "ticketId": "…",
  "source": "jira|github|azure|clickup|none",
  "url": "… or null",
  "summary": "…",
  "issueType": "Story|Bug|Task",
  "status": "…",
  "priority": "… or null",
  "labels": [],
  "components": [],
  "fixVersions": [],
  "description": "… full markdown …",
  "acceptanceCriteria": "… or null",
  "attachments": [],
  "comments": [{ "author": "…", "created": "…", "body": "…" }],
  "subtasks": []
}
```

Fields a source cannot supply are `null` or `[]` — never omitted, never invented. When
`issueType` has no native equivalent, map it: a label/tag containing `bug` → `Bug`,
otherwise `Story`. `issueType` drives `testLimits.bugMaxTests` vs `storyMaxTests`, so it
must always be one of the three values above.

---

## `jira`

Config: `ticketSource.jira` (falls back to `project.jira` for pre-1.0 configs).
Requires the **Atlassian MCP** connection.

**Tool naming (canonical rule — every command that names a Jira tool defers here).** Jira tool
names in this guide and in the commands use the local server prefix `mcp__atlassian__*`. With the
claude.ai connector the same tools live under `mcp__claude_ai_Atlassian__*`. The suffix (the part
after the final `__`) is identical — resolve by **name-contains**: use whichever connected tool
carries the same suffix, never fail just because the written prefix isn't present.

**Cloud ID resolution.** `cloudId` may be a site domain or a UUID. If it is not a UUID,
call `mcp__atlassian__getAccessibleAtlassianResources`, find the site whose `url` contains
the configured domain, and use its `id`. If no match, pass the configured value through
unchanged. Cache the resolved UUID for the run.

**Fetch.** `mcp__atlassian__getJiraIssue` with
`fields: ["summary","description","issuetype","status","priority","labels","components","fixVersions","attachment","subtasks","comment"]`,
`expand: renderedFields`, `responseContentFormat: markdown`.

Comments come back under `fields.comment.comments` because `comment` is requested
explicitly — extract **every** one (author.displayName, created, body). Never fall back to
`searchJiraIssuesUsingJql` for comments; it returns metadata only.

**Post.** `mcp__atlassian__createJiraIssue` per test case (issue type
`ticketSource.jira.testIssueType`, assignee `testAssigneeAccountId`, batches of
`batchSize`), then `mcp__atlassian__createIssueLink` with `issueLinkType` to link each test
to the story. Summary comment via `mcp__atlassian__addCommentToJiraIssue`.

**Errors:** 404 → ticket missing or no access · 401 → re-authenticate the MCP · 403 →
project permissions · timeout → network/MCP status. Stop on all of them. Never write
partial or placeholder context files.

---

## `github`

Config: `ticketSource.github.repo` (`owner/name`), `testLabel`. Uses the `gh` CLI —
no MCP needed. Verify with `gh auth status` and stop with a login hint if it fails.

**Fetch.**
```bash
gh issue view "$TICKET_ID" --repo "$REPO" \
  --json number,title,body,state,labels,comments,url,assignees,milestone
```
Mapping: `title`→`summary` · `body`→`description` · `state`→`status` ·
`labels[].name`→`labels` · `milestone.title`→`fixVersions[0]` · `comments[]`→`comments`
(`author.login`→`author`, `createdAt`→`created`) · `priority`→`null` unless a
`priority:*` label exists · `components`/`subtasks`→`[]`.

`issueType`: `Bug` if any label matches `bug|defect|regression` (case-insensitive), else `Story`.

**Post.** One issue per test case:
```bash
gh issue create --repo "$REPO" --title "$TITLE" --body-file "$BODY_FILE" \
  --label "$TEST_LABEL"
```
Then link back by commenting on the parent with the created issue numbers:
```bash
gh issue comment "$TICKET_ID" --repo "$REPO" --body-file "$SUMMARY_FILE"
```
GitHub has no typed issue links — the parent comment **is** the link. Record created
numbers in the `TICKET_ID-test-keys.json` ledger exactly as for Jira so re-runs stay
idempotent.

**Errors:** `gh` not installed → tell the user to install it · `gh auth status` failing →
`gh auth login` · 404 → issue or repo not found.

---

## `azure`

Config: `ticketSource.azure.organization`, `project`, `testWorkItemType`,
`tokenEnvVar` (default `AZURE_DEVOPS_PAT`). REST API via `curl`; the PAT is read from the
env var and sent as basic auth. **Never** print the token or embed it in a saved file.

**Fetch.**
```bash
curl -s -u ":$PAT" \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/wit/workitems/$TICKET_ID?\$expand=all&api-version=7.0"
```
Mapping (all under `fields`): `System.Title`→`summary` ·
`System.Description` + `Microsoft.VSTS.Common.AcceptanceCriteria`→`description` /
`acceptanceCriteria` (both are HTML — convert to markdown) · `System.State`→`status` ·
`Microsoft.VSTS.Common.Priority`→`priority` · `System.Tags` (semicolon-separated)→`labels` ·
`System.AreaPath`→`components[0].name` · `System.WorkItemType`→`issueType`
(`Bug`→`Bug`, everything else→`Story`).

Comments are a separate call:
```bash
curl -s -u ":$PAT" \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/wit/workItems/$TICKET_ID/comments?api-version=7.0-preview.3"
```

**Post.** `POST .../_apis/wit/workitems/\$$TEST_TYPE?api-version=7.0` with
`Content-Type: application/json-patch+json` and an `add` op per field, then a second patch
adding a `System.LinkTypes.Hierarchy-Reverse` relation to the parent work item.

**Errors:** empty/missing PAT env var → stop and name the variable · 401 → PAT expired or
missing scopes (`Work Items: Read & Write`) · 404 → wrong org/project/ID.

---

## `clickup`

Config: `ticketSource.clickup.listId`, `tokenEnvVar` (default `CLICKUP_TOKEN`).

**Fetch.**
```bash
curl -s -H "Authorization: $CLICKUP_TOKEN" \
  "https://api.clickup.com/api/v2/task/$TICKET_ID?include_subtasks=true"
```
Mapping: `name`→`summary` · `description` (or `text_content`)→`description` ·
`status.status`→`status` · `priority.priority`→`priority` · `tags[].name`→`labels` ·
`subtasks[]`→`subtasks` · `url`→`url`. Comments:
`GET https://api.clickup.com/api/v2/task/$TICKET_ID/comment`, mapping
`user.username`→`author`, `date` (epoch ms → ISO)→`created`, `comment_text`→`body`.

`issueType`: `Bug` if any tag matches `bug|defect`, else `Story`.

**Post.** One task per test case in `listId`:
```bash
curl -s -X POST -H "Authorization: $CLICKUP_TOKEN" -H "Content-Type: application/json" \
  "https://api.clickup.com/api/v2/list/$LIST_ID/task" -d @payload.json
```
with `{"name": …, "markdown_description": …, "parent": "$TICKET_ID"}`. `parent` makes it a
subtask, which is ClickUp's link equivalent — no separate link call.

**Errors:** missing token env var → stop and name it · 401 → bad token ·
`OAUTH_027` → the token has no access to that list.

---

## `none`

No tracker. This is the **default for a first install** and the path that makes the
framework usable with zero integrations — the whole pipeline runs, output stays local.

Config: `ticketSource.none.outputDir` (default `docs/test-cases`).

**Fetch.** There is no API to call. Resolve the ticket from a local file, in order:

1. `{CONTEXT_DIR}/TICKET_ID.json` already exists → use it, print
   `✔ Using existing local ticket context` and mark the step done.
2. `{outputDir}/TICKET_ID.md` exists → parse it into the normalized contract. Recognized
   headings (case-insensitive, any level): `Summary`/`Title` → `summary`,
   `Description` → `description`, `Acceptance Criteria` → `acceptanceCriteria`,
   `Type` → `issueType`. Everything before the first heading is `description`.
   Unset fields → `null`/`[]`.
3. Neither exists → **stop**, do not invent a ticket:
   > `No local ticket found. Create {outputDir}/TICKET_ID.md with a Summary and Description (or a `## Acceptance Criteria` section), then re-run. Template: /qa-help`

Set `source: "none"` and `url: null`.

**Post.** Nothing leaves the machine. Write `{outputDir}/TICKET_ID-test-cases.md` — the
same rendered markdown a tracker would receive, one `##` section per test case — and print
the path. Still write the `TICKET_ID-test-keys.json` ledger (keys are the case IDs) so
re-runs remain idempotent and the automation generators' manual-cases gate is satisfied
identically to the tracker paths.

**Never** ask for approval to post, and never warn about missing credentials — there is
nothing to post and nothing to authenticate. A `none` run must be fully non-interactive.
