---
name: qa-help
description: Onboarding guide and setup-state checker for the QA agents framework. Use when the user asks "where do I start", "what do I do next", "how does this work", "am I set up correctly", or seems lost. Checks config, scaffold, env, MCPs, and per-ticket pipeline state, then prints a personalized next-step checklist.
---

# QA Framework Help (`/qa-help`)

You answer one question: **"what should this person do next?"** Inspect the actual state of the repo, then print a short, personalized checklist — never a generic docs dump. If the user passed a ticket ID (any `^#?[A-Za-z0-9][A-Za-z0-9._-]*$` token in `$ARGUMENTS`), also report that ticket's pipeline position.

## Checks (run in order, stop narrating — collect results, then report once)

### 1. Config exists and is filled in
- Read `.claude/project-config.json`. Missing → **next step is `/qa-init`**; skip the remaining checks except MCP.
- Parse it (`node -e "JSON.parse(...)"`). Invalid → report the parse error and the offending region.
- Flag unfilled placeholders (each one is a ✗ with the fix):
  - `project.name` = `"YourProject"`
  - `jira.cloudId` = `"your-org.atlassian.net"` (only matters for the Jira agents — mark as ⚠ optional)
  - `productCode.rootPaths` = `[]` and no `.claude/project-config.local.json` (needed by `/analyze-code` — ⚠)
  - Any `/absolute/path/to/your/...` placeholder in `.claude/settings.json` `additionalDirectories`/`deny` (⚠)
- Sanity: `testFramework` is `cypress` or `playwright`, and `paths.apiTests` matches it (a `playwright` framework with `cypress/...` paths = ✗ mismatch, suggest `/qa-init` sync mode). Confirm `.claude/templates/{testFramework}-javascript.md` exists.

### 2. Framework scaffold present
- Framework config file exists (`cypress.config.js` / `playwright.config.js`)? `node_modules/` installed? Key `paths.*` folders exist (Glob a few)? Missing → **`/qa-init`** (it fills gaps non-destructively).

### 3. Credentials / env file
- `config.app.envFile` exists? If not: point at the example file to copy (`cypress.env.example.json` / `.env.example`) and remind: never commit it.
- If it exists, do NOT read or print its values — only check the required key *names* are present (compare against the example file; if no example file exists, check for the key names in config: `app.emailKey`, `app.passwordKey`).

### 4. Login command implemented
- Read `config.paths.support`; if it still contains a `TODO` marker in the login function, flag: generated specs will fail auth until this is implemented (skip this check when `auth.primary.loginCommand` is null, e.g. demo mode).

### 5. MCP connections (only matters for the agent pipeline)
- Jira agents need Atlassian MCP tools (names contain `atlassian`); `@ui-automation-test-generator` also needs browser MCP tools (names contain `claude-in-chrome`). Check whether such tools are available to you right now; if not, mark ⚠ with: connect via `/mcp` (CLI) or claude.ai connector settings. Local skills (`/qa-run`, `/generate-api-test`, …) work without them.

### 6. Environment preflight
- Don't duplicate `/doctor` — just check whether the backend at `config.app.primaryBaseUrl` answers (`curl -s -o /dev/null -w "%{http_code}"`). Down → point at `/doctor` for the full diagnosis.

### 7. Ticket status (only if a ticket ID was given)
- Read `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json`. Report each step ✓/pending and name the exact next command (e.g. steps show manual cases done but no API spec → `@api-automation-test-generator TICKET_ID`). No state file → `@manual-test-generator TICKET_ID` is the entry point.

## Report format

```
# QA Framework — where you are

✔ Config filled in (cypress + JavaScript)
✔ Scaffold present, dependencies installed
✗ cypress.env.json missing        → cp cypress.env.example.json cypress.env.json, fill credentials
⚠ Login command still a TODO      → implement cy.loginAndGetSessionCookie() in cypress/support/commands.js
⚠ Atlassian MCP not connected     → needed only for @manual-test-generator etc.; connect via /mcp
✔ Backend reachable (http://localhost:4000)

## Your next step
1. Copy + fill the env file (above)
2. Implement the login command
3. Run /doctor to confirm, then @manual-test-generator <TICKET-ID>
```

Keep it to one screen. Every ✗/⚠ line carries its exact remediation command. End with the single most important next action, not a menu. If everything passes and no ticket was given, suggest the demo (`/qa-init demo` in a scratch repo) or `@manual-test-generator <TICKET-ID>` as the starting point — and if the `.claude/` files were recently adapted or upgraded, `/qa-selftest quick` to verify the framework itself.
