# Create Postman Collection

You are given a Jira ticket ID: **$ARGUMENTS**

Let `TICKET_ID` = the first token of `$ARGUMENTS`.

**If `TICKET_ID` does not match `[A-Z]+-[0-9]+`, stop immediately and tell the user:**
> "A Jira ticket ID is required. Usage: `/create-postman-collection <TICKET-ID>`"
**Do not proceed.**

## Setup: Read Project Config

Read `.claude/project-config.json` and extract all values. Then read `.claude/project-config.local.json` if it exists — merge its values over the base config (local takes precedence).

Extract:
- `project.postman.*` — `collectionsPath`, `authType`, `loginEndpoint`, `csrfEndpoint`
- `project.testFramework` — reference only; paths live under `project.paths.*`
- `project.paths.*` — `apiTests`, `uiTests`, `tasks`, `fixtures`, `ticketContext`, `manualCases`
- `project.jira.cloudId` — `CLOUD_ID`
- `project.name` — `PROJECT_NAME`

## Check Pipeline State

Read `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json` (canonical shape).
If `steps["generate-postman-collection"]` is `done`, print: `✔ Postman collection already generated — skipping` and exit.

## Prerequisites (self-healing)

Required:
- `{config.paths.ticketContext}/TICKET_ID.json` — ticket context
- `{config.paths.ticketContext}/TICKET_ID-analysis.md` — code analysis with API endpoints

**Self-healing:** If any are missing, auto-run the prerequisite command instead of stopping:
1. If `TICKET_ID.json` is missing → read and execute `.claude/commands/fetch-ticket.md` with `TICKET_ID`. Announce: `🔄 Missing ticket context — auto-running /fetch-ticket`
2. If `TICKET_ID-analysis.md` is missing → read and execute `.claude/commands/analyze-code.md` with `TICKET_ID`. Announce: `🔄 Missing code analysis — auto-running /analyze-code`

Run in order (fetch before analyze).

## Read All Context

Read these files in full:
1. `{config.paths.ticketContext}/TICKET_ID.json` — ticket summary, issue type
2. `{config.paths.ticketContext}/TICKET_ID-analysis.md` — API endpoints, request/response structures
3. `{config.paths.manualCases}/TICKET_ID.md` (if it exists) — use test scenarios to write better Postman test scripts

Also read relevant existing spec files from `{config.paths.apiTests}/<module>/` (use Grep scoped to `apiTests` with the ticket keywords) to extract:
- Actual request body structures
- Header names and patterns
- Status codes expected per endpoint
- Query/path parameters

## Determine Auth Strategy

Read `project.postman.authType`:

| `authType` | Strategy |
|---|---|
| `"cookie"` | Session cookie in `Cookie` header — pre-request script calls login endpoint |
| `"bearer"` | JWT/Bearer token in `Authorization` header — pre-request script calls auth endpoint |
| `"apikey"` | API key in a custom header — collection variable |
| `"none"` | No auth — public endpoints only |

## Build the Postman Collection

Generate a valid **Postman Collection v2.1 JSON** with this structure:

```json
{
  "info": {
    "_postman_id": "<generate a UUID>",
    "name": "PROJECT_NAME: <ticket-summary>",
    "description": "Auto-generated for TICKET_ID — <ticket-summary>\nGenerated: <ISO date>",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": "<auth object based on authType>",
  "variable": "<collection variables>",
  "event": ["<collection-level pre-request script for auth>"],
  "item": ["<folder per module, each containing request items>"]
}
```

### Collection Variables

Always include these base variables (values left blank):

```json
[
  { "key": "base_url",     "value": "",  "type": "string" },
  { "key": "auth_token",   "value": "",  "type": "string" },
  { "key": "csrf_token",   "value": "",  "type": "string" },
  { "key": "session_cookie", "value": "", "type": "string" }
]
```

Add additional variables found in the analysis (e.g. `contract_id`, `store_id`, `user_id`).

### Collection-Level Pre-Request Script

Use `project.postman.loginEndpoint` and `project.postman.csrfEndpoint` as the URLs (do not hardcode).

**Whiz auth is cookie-based, not token-based:** `POST /session` with `{ email, password }` sets the session cookie (Postman stores it in the cookie jar and auto-sends it on subsequent same-origin requests); a follow-up `GET /api/session` returns the gorilla CSRF token that mutations (`POST`/`PUT`/`DELETE`) must send as the `x-csrf-token` header. Do NOT read a bearer `token` from the login body — there isn't one. (Phizz is different: server-to-server `/auth` + `/ext` routes use a `Phizz-Checksum` = `SHA512(body + PHIZZ_AUTH_SALT)` header and no session/CSRF — model that separately if the ticket targets Phizz.)

```javascript
// Whiz cookie + CSRF flow. Field names come from GET /api/session — verify against a
// real response and keep the first that matches.
const baseUrl       = pm.collectionVariables.get("base_url");
const loginEndpoint = "<LOGIN_ENDPOINT_FROM_CONFIG>";   // e.g. /session
const csrfEndpoint  = "<CSRF_ENDPOINT_FROM_CONFIG>";    // e.g. /api/session
const csrf          = pm.collectionVariables.get("csrf_token");

if (!csrf || csrf === "") {
    pm.sendRequest({
        url: baseUrl + loginEndpoint,
        method: "POST",
        header: { "Content-Type": "application/json" },
        body: {
            mode: "raw",
            raw: JSON.stringify({
                email:    pm.environment.get("TEST_EMAIL")    || "your-email",
                password: pm.environment.get("TEST_PASSWORD") || "your-password"
            })
        }
    }, function (loginErr, loginRes) {
        // Session cookie is now in Postman's cookie jar for baseUrl and is sent
        // automatically on later requests. Fetch the CSRF token for mutations.
        if (!loginErr && loginRes.code === 200) {
            pm.sendRequest({ url: baseUrl + csrfEndpoint, method: "GET" }, function (csrfErr, csrfRes) {
                if (!csrfErr && csrfRes.code === 200) {
                    const body = csrfRes.json();
                    pm.collectionVariables.set("csrf_token", body.csrfToken || body.csrf_token || body.token || "");
                }
            });
        }
    });
}
```

### Request Item Structure

For each API endpoint identified in the analysis, create a request with:
- Proper method, URL with `{{base_url}}` prefix, path/query parameters
- Headers including Cookie and x-csrf-token (disabled for GET)
- Request body for POST/PUT (omit for GET/DELETE)
- Test scripts asserting status code, response time, body structure

### Negative / Auth Test Requests

For each endpoint that requires auth, add a duplicate request in a **"Negative Tests"** subfolder with Cookie header removed, asserting `401` or `403`.

## Determine Output File Path

Slugify the ticket summary into kebab-case. Build:

```
OUTPUT_PATH = {config.postman.collectionsPath}/TICKET_ID-<slug>.postman_collection.json
```

Create the directory if it doesn't exist via Bash: `mkdir -p "<config.postman.collectionsPath>"`

## Save the Collection

Write the complete JSON to `OUTPUT_PATH` with 2-space indent. Validate via Bash:

```bash
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log('Valid JSON ✅');" "<OUTPUT_PATH>"
```

If validation fails, fix the JSON before reporting success.

## Update Pipeline State

Merge into `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json`:
- Set `steps["generate-postman-collection"]` = `"done"`
- Set `lastUpdated` = current ISO timestamp
- Preserve all other `steps` keys

## Output

Print:
- Collection name
- Output file path (OUTPUT_PATH)
- Total requests generated (count)
- Folders created (list)
- Collection variables that need to be set before running
- Any endpoints where request body or response structure was uncertain (needs manual review)
