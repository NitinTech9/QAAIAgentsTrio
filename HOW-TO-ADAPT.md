# How to Adapt This Framework to a New Project

This guide explains how to take the QA agents framework in this repo and adapt it to a different product or team. The framework is project-agnostic by design -- all project-specific values live in `.claude/project-config.json`.

---

## Step 1 -- Clone or Fork This Repo

Copy the entire repo structure. The key directories are:

```
.claude/
  agents/                 # 4 agent orchestrators
  commands/               # 13 reusable command steps
  project-config.json     # <-- the only file you MUST edit
  settings.json           # permissions and deny rules
cypress/
  e2e/
    API/                  # generated API specs land here
    UI/                   # generated UI specs land here
    cases/                # manual test case markdown + ticket context
    pages/                # Page Object files for UI tests
  support/
    commands.js           # custom Cypress commands (login, CSRF, etc.)
```

## Step 2 -- Edit `project-config.json`

Open `.claude/project-config.json` and update every section:

### 2a. Jira Settings

```jsonc
"jira": {
  "cloudId": "your-org.atlassian.net",   // your Jira cloud instance
  "testIssueType": "Test",               // issue type for test cases (Test, Sub-task, etc.)
  "issueLinkType": "Test",               // link type between story and test
  "batchSize": 8,                        // how many tests to create per Jira API batch
  "testAssigneeAccountId": null          // Jira account ID, or null for unassigned
}
```

**How to find your cloudId**: Open any Jira issue, the URL is `https://<cloudId>/browse/PROJ-123`.

### 2b. Paths

Every path is relative to the repo root:

```jsonc
"paths": {
  "ticketContext": "cypress/e2e/cases/.ticket-context",
  "manualCases":   "cypress/e2e/cases",
  "apiTests":      "cypress/e2e/API",
  "uiTests":       "cypress/e2e/UI",
  "pages":         "cypress/e2e/pages",
  "support":       "cypress/support/commands.js",
  "dataFactory":   "cypress/support/dataFactory.js",
  "tasks":         "cypress/tasks",
  "fixtures":      "cypress/fixtures",
  "logs":          "cypress/logs",
  "reports":       "cypress/reports",
  "screenshots":   "cypress/screenshots",
  "namingConventions": "NAMING_CONVENTIONS.md"
}
```

If your project uses a different test runner directory (e.g., `tests/` instead of `cypress/`), update all paths here. The agents and commands never hardcode paths -- they always read from config.

### 2c. Auth

```jsonc
"auth": {
  "loginCommand": "cy.loginAndGetSessionCookie()",
  "sessionCookieAlias": "@sessionCookie",
  "csrfTokenAlias": "@csrfToken"
}
```

Replace with your app's authentication mechanism:
- **Cookie-based auth**: Keep the structure above, update the command name
- **Bearer token auth**: Change `loginCommand` to whatever custom command generates a token, update aliases
- **No auth**: Set `loginCommand` to `null` -- the agents will skip auth setup in generated specs

### 2d. Test Limits

```jsonc
"testLimits": {
  "bugMaxTests": 2,
  "storyMaxTests": 4
}
```

Controls how many automated test cases each automation agent generates per ticket. Bugs get fewer (focused reproduction), stories get more (happy path + edge cases).

### 2e. Run Commands

```jsonc
"runCommand": {
  "headed":   "npx cypress run --spec \"{specFile}\" --headed --reporter mochawesome",
  "headless": "npx cypress run --spec \"{specFile}\" --reporter mochawesome",
  "withEnv":  "CYPRESS_ENV={env} npx cypress run --spec \"{specFile}\" --reporter mochawesome"
}
```

`{specFile}` and `{env}` are placeholders replaced at runtime by the `run-tests` command. Adapt the reporter, browser flags, or env variable name to your project.

### 2f. Product Code Roots

```jsonc
"productCode": {
  "rootPaths": [
    "/absolute/path/to/your/backend",
    "/absolute/path/to/your/frontend"
  ],
  "sourceGlobs": ["*.go", "*.js", "*.jsx", "*.ts", "*.tsx", "*.sql"],
  "excludeDirs": ["node_modules", ".git", "dist", "build", "coverage", "vendor"]
}
```

- `rootPaths`: Absolute paths to the product source code repos the agents will analyze. Add as many as needed.
- `sourceGlobs`: File extensions to search when analyzing code for a ticket. Add your language (e.g., `*.py`, `*.rb`, `*.java`).
- `excludeDirs`: Directories to skip during code analysis.

### 2g. Postman (Optional)

```jsonc
"postman": {
  "collectionsPath": "postman/collections",
  "authType": "cookie",
  "loginEndpoint": "/api/auth/login"
}
```

If you don't use Postman, you can leave this section as-is -- the postman agent simply won't be invoked.

## Step 3 -- Update `settings.json`

Edit `.claude/settings.json`:

1. **additionalDirectories**: Point to your product source code repos (same as `productCode.rootPaths`)
2. **deny rules**: Block sensitive files in your product repos (`config.toml`, `.env`, `credentials.*`, `secrets.*`, etc.)

Example:

```json
{
  "permissions": {
    "deny": [
      "Read(path/to/repo/config.toml)",
      "Read(path/to/repo/.env)",
      "Read(path/to/repo/**/*credentials*)",
      "Read(path/to/repo/**/*secret*)"
    ]
  }
}
```

## Step 4 -- Adapt Auth in `cypress/support/commands.js`

The `loginCommand` from config must exist as a real Cypress custom command. Create or update it:

```javascript
Cypress.Commands.add('loginAndGetSessionCookie', () => {
  // Your app's login flow
  cy.request('POST', '/api/auth/login', {
    username: Cypress.env('USERNAME'),
    password: Cypress.env('PASSWORD')
  }).then((resp) => {
    // Extract and alias session cookie
    cy.wrap(resp.headers['set-cookie']).as('sessionCookie');
    // Extract CSRF token if applicable
    cy.wrap(resp.body.csrfToken).as('csrfToken');
  });
});
```

## Step 5 -- Update `analyze-code.md` Grep Patterns (Optional)

The `analyze-code` command uses framework-specific grep patterns to find routes, handlers, and models. The current patterns target Go (Chi router):

- `addAuthAPIRoute`, `chi.URLParam` for route discovery
- `func.*Handler` for handler functions

If your backend uses a different language/framework, edit `.claude/commands/analyze-code.md` and update the grep patterns in the "Discover product source code" section. For example:

| Framework | Route pattern | Handler pattern |
|-----------|--------------|-----------------|
| Go (Chi) | `addAuthAPIRoute`, `chi.URLParam` | `func.*Handler` |
| Express.js | `router\.(get\|post\|put\|delete)` | `(req, res)` |
| Django | `path\(`, `urlpatterns` | `def.*view` |
| Rails | `resources :`, `get '` | `def (create\|update\|show)` |
| Spring Boot | `@(Get\|Post\|Put\|Delete)Mapping` | `@RestController` |

## Step 6 -- Verify the Setup

Run the verification steps in [HOW-TO-RUN.md](HOW-TO-RUN.md) to confirm everything is wired up correctly.

---

## Architecture Reference

### Agents (4 independent orchestrators)

| Agent | Purpose | Pipeline Steps |
|-------|---------|---------------|
| `manual-test-generator` | Generate manual test cases | fetch-ticket -> analyze-code -> create-manual-test-cases -> post-tests-to-jira |
| `api-automation-test-generator` | Generate API Cypress specs | (manual gate) -> create-api-automated -> create-schema-validation -> validate-spec api -> run-tests api |
| `ui-automation-test-generator` | Generate UI Cypress specs | (manual gate) -> create-ui-automated -> validate-spec ui -> run-tests ui |
| `postman-collection-generator` | Generate Postman collections | (reuse ticket context) -> create-postman-collection |

### Key Design Principles

1. **Manual-first hard gate**: Automation agents refuse to run unless manual test cases exist
2. **Pipeline state**: Each agent reads/writes `TICKET_ID-pipeline-state.json` to track progress and avoid re-running completed steps
3. **Idempotent Jira posting**: A ledger file (`TICKET_ID-test-keys.json`) prevents duplicate test issues
4. **Human approval gates**: Before posting to Jira and before executing tests
5. **Scoped validation**: `validate-spec` and `run-tests` take `api|ui` parameter with distinct state keys
6. **Type tagging**: Every manual test has `Type: UI | API | Mixed` so automation agents can route correctly
7. **Config-driven**: No hardcoded paths, URLs, or credentials in agents or commands

### How to Invoke

From Claude Code CLI:

```bash
# From within the QA repo
claude
> /manual-test-generator TS-12345

# From a different directory
claude --directory /path/to/TCARegressionSuite-QA
> /manual-test-generator TS-12345
```

From VS Code (Claude Code extension):
- Open the command palette and type the agent name, or type `/manual-test-generator TS-12345` in the chat.
