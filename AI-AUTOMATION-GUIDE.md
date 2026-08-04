# AI Automation Guide

**How to use the AI-powered agents, commands, and skills in the TCA Regression Suite**

This guide explains the three-tier automation system built into this framework using Claude Code. Everything runs inside your IDE (VS Code extension) or terminal (`claude` CLI).

---

## Table of Contents

- [Getting Started](#getting-started)
- [Key Concepts](#key-concepts)
- [System Overview](#system-overview)
- [Tier 1 -- Skills (Ad-Hoc, No Jira)](#tier-1----skills-ad-hoc-no-jira)
- [Tier 2 -- Commands (Individual Pipeline Steps)](#tier-2----commands-individual-pipeline-steps)
- [Tier 3 -- Agents (Full Jira Pipelines)](#tier-3----agents-full-jira-pipelines)
- [End-to-End Walkthrough](#end-to-end-walkthrough)
- [Decision Guide -- What to Use When](#decision-guide----what-to-use-when)
- [Real-World Scenarios](#real-world-scenarios)
- [Two-Backend Architecture (Whiz + Phizz)](#two-backend-architecture-whiz--phizz)
- [Configuration Reference](#configuration-reference)
- [Sample Output Files](#sample-output-files)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### What You Need

| Requirement | Why |
|---|---|
| **Claude Code** | VS Code extension or `claude` CLI — this is where you type all commands |
| **Jira access** | The Atlassian MCP connection must be configured (agents fetch tickets and post results to Jira) |
| **Node.js + Cypress** | The test framework — `npm install` should already be done |
| **Product source code** | The Whiz and/or Phizz repos cloned locally (for code analysis) |

### First-Time Setup (2 minutes)

```bash
# 1. Clone this repo and install dependencies
git clone <repo-url> && cd TCARegressionSuite-QA
npm install

# 2. Set up your local config with your machine-specific paths
cp .claude/project-config.local.example.json .claude/project-config.local.json

# 3. Edit the local config — set the paths to your local Whiz/Phizz repos
# Open .claude/project-config.local.json and update productCode.rootPaths:
#   "/Users/yourname/work/go/src/phizz"
#   "/Users/yourname/work/go/src/whiz"

# 4. Verify the Atlassian MCP connection is active in Claude Code
# (You should see "Atlassian" in your MCP server list)
```

### Your First Run

Pick a Jira ticket and try:

```
@manual-test-generator TCA-456
```

The agent will:
1. Fetch the ticket from Jira (you'll see the title and description printed)
2. Search your source code for related endpoints
3. Generate manual test cases (you'll see the full list)
4. Ask for your approval before posting anything to Jira

That's it. If anything goes wrong, check [Troubleshooting](#troubleshooting).

---

## Key Concepts

Before diving into the tiers, here are the core ideas that every agent and command relies on.

### Pipeline State

Every Jira ticket gets a `pipeline-state.json` file that tracks which steps have been completed:

```json
{
  "ticketId": "TCA-456",
  "steps": {
    "fetch-ticket": "done",
    "analyze-code": "done",
    "create-manual-test-cases": "done",
    "post-tests-to-jira": "pending",
    "create-api-automated-test-cases": "pending",
    "create-schema-validation": "pending",
    "validate-api-spec": "pending",
    "run-api-tests": "pending"
  },
  "lastUpdated": "2026-06-17T10:30:00.000Z"
}
```

**Why it matters:** If you run an agent and it gets interrupted (VS Code closes, network drops, context limit), just rerun the same command. The agent reads this file, sees which steps are already "done", skips them, and picks up where it left off.

### Self-Healing

When a command needs a file that doesn't exist yet (e.g., `/create-manual-test-cases` needs the ticket context but you never ran `/fetch-ticket`), instead of failing with an error, it **automatically runs the missing prerequisite** first.

```
You run:  /create-manual-test-cases TCA-456
Missing:  TCA-456.json doesn't exist
Agent:    🔄 Missing ticket context — auto-running /fetch-ticket
          ✔ Fetch ticket completed
          Now continuing with create-manual-test-cases...
```

This means you can run any command at any point — it fills in the gaps.

### Idempotent + Force Rerun

Running the same command twice is always safe — completed steps are skipped. To regenerate from scratch, add `force`:

```
@manual-test-generator TCA-456          # skips all "done" steps
@manual-test-generator TCA-456 force    # resets all steps, reruns everything
```

### Human Gates

Agents **stop and ask for your approval** before creating Jira issues or posting comments. Exception: the UI automation agent executes generated tests automatically (headless, local) — generated automation is only done when it has run green; use the `skip-run` flag to opt out.

### Hard Gates vs Soft Dependencies

- **Hard gate** = the agent will STOP and refuse to continue (e.g., API agent requires manual test cases to exist)
- **Soft dependency / self-heal** = the agent auto-runs the missing step (e.g., code analysis auto-runs fetch-ticket if needed)

---

## System Overview

The AI automation has **three tiers**, each serving a different need:

```
                         ┌─────────────────────────────────────────────┐
                         │          TIER 3: AGENTS                     │
                         │   Full Jira-driven pipelines                │
                         │   @manual-test-generator TKT-123            │
                         │   @api-automation-test-generator TKT-123    │
                         │                                             │
                         │   Internally chains multiple commands:      │
                         │   ┌───────────────────────────────────────┐ │
                         │   │      TIER 2: COMMANDS                 │ │
                         │   │  Individual pipeline steps            │ │
                         │   │  /fetch-ticket                        │ │
                         │   │  /analyze-code                        │ │
                         │   │  /create-manual-test-cases             │ │
                         │   │  /create-api-automated-test-cases      │ │
                         │   │  /validate-spec                       │ │
                         │   │  /run-tests                           │ │
                         │   │  /post-tests-to-jira                  │ │
                         │   └───────────────────────────────────────┘ │
                         └─────────────────────────────────────────────┘

                         ┌─────────────────────────────────────────────┐
                         │          TIER 1: SKILLS                     │
                         │   Standalone, ad-hoc, no Jira needed        │
                         │   /generate-api-test                        │
                         │   /generate-ui-test                         │
                         │   /fix-test                                 │
                         │   /add-test-cases                           │
                         │   /qa          /qa-only                     │
                         │   /audit-coverage                           │
                         └─────────────────────────────────────────────┘
```

**Key difference:**
- **Skills** = you describe what you want in plain English, get instant results
- **Commands** = you pick a specific step to run (requires a Jira ticket ID)
- **Agents** = you give a ticket ID, the agent runs the entire workflow end-to-end

---

## Tier 1 -- Skills (Ad-Hoc, No Jira)

Skills are slash commands you type into Claude Code. They work immediately with no setup -- just describe what you need.

**When to use:** Quick, everyday work. No Jira ticket needed. No prerequisites.

---

### /generate-api-test -- Create API Tests

Generates a complete Cypress API spec file from a PR, curl command, or plain description.

**Three ways to trigger:**

```
# From a GitHub PR
/generate-api-test
Write tests for PR #42

# From a curl command
/generate-api-test
curl -X POST http://localhost:4000/api/contracts -H "Cookie: session=abc" -d '{"name":"test"}'

# From a description
/generate-api-test
Write tests for GET /api/stores/{id}
```

**What it produces:**
- A complete `.cy.js` spec file in the correct module folder
- Happy path tests (200/201) tagged `@PR @Smoke`
- Negative tests (400/422, 404) tagged `@Regression`
- Unauthenticated test (401/403) tagged `@Regression`
- `before()` hook with DB queries if needed
- `after()` cleanup for create/update tests
- Ready-to-run command printed at the end

**Example output file:** `cypress/e2e/API/contracts-module/05-post-create-contract.cy.js`

---

### /generate-ui-test -- Create UI Tests

Generates a Cypress UI spec file from a described browser workflow.

```
/generate-ui-test
Write a UI test for the login page with valid and invalid credentials
```

**What it produces:**
- A `.cy.js` UI spec file using Page Object pattern
- Creates a new Page Object file if one doesn't exist for the module
- `beforeEach` with session login + `cy.visit()`
- Happy path + validation error + access control tests

**Example output file:** `cypress/e2e/UI/login-module/01-login.cy.js`

---

### /fix-test -- Fix a Failing Test

Diagnoses and fixes a failing Cypress test. Just paste the error.

```
/fix-test
# Then paste the terminal error output, e.g.:
# CypressError: cy.task('queryDb') failed with the following error:
# error: column "odometer" does not exist
```

**What it does:**
1. Classifies the error type (wrong DB column, wrong table name, missing field, auth issue)
2. Reads the failing test file
3. Cross-references the swagger spec for correct field names
4. Applies the **minimal fix** -- only changes the failing lines
5. Shows you the before/after diff

**Common fixes it handles:**
- Wrong DB table name (`cancellation_reasons` -> `cancel_reasons`)
- Wrong DB column (`odometer` -> hardcoded `mileage = 50000`)
- Missing required fields in request body
- Missing CSRF token on POST/PUT/DELETE
- Auth hook in wrong lifecycle method

---

### /add-test-cases -- Expand an Existing Test File

Adds new test cases to a file without modifying existing tests.

```
/add-test-cases
Add negative tests and DB verification to cypress/e2e/API/contracts-module/01-get-contracts.cy.js
```

**What you can ask for:**
- "add regression cases" -- unauthenticated, missing fields, invalid ID, boundary values
- "add validation tests" -- each required field missing one at a time
- "add DB verification" -- `cy.task("queryDb", ...)` after POST/PUT to confirm data persisted
- "uncomment the commented tests" -- fixes and uncomments commented-out test blocks

**Rules it follows:**
- Continues test case numbering from the last existing one
- Reuses existing `let` variables
- Adds to existing `before()` hook instead of creating a second one
- Never modifies passing test cases

---

### /qa -- Full QA Cycle (Run + Fix + Report)

Runs the entire test suite, fixes failures, adds regression tests, and produces a health report.

```
/qa
```

**What it does (7 phases):**
1. Pre-flight check (app running? clean git state?)
2. Baseline run (execute all `@PR` tests, capture pass/fail counts)
3. Triage failures (classify each error, prioritize `before()` failures first)
4. Fix loop (for each failure: read file, identify root cause, apply minimal fix, commit atomically, re-run to verify, add regression test)
5. Coverage gap analysis (compare swagger endpoints vs test files)
6. Final run (re-run to get after-fix counts)
7. Write report (`cypress/reports/qa-report-YYYY-MM-DD.md`)

**Safety guardrails:**
- Stops after 10 fixes or 3 consecutive reverts
- Each fix is an atomic git commit: `fix(qa): 04-put-cancel-contract.cy.js:TC01 -- add missing store_id`
- Reverts immediately if a fix breaks previously passing tests
- Never fixes app-side bugs -- documents them as deferred

---

### /qa-only -- Read-Only Health Check

Same analysis as `/qa` but **never modifies any code**. Safe to run anytime.

```
/qa-only
```

**What it produces:**
- TCA QA Health Score (0-100) across 6 dimensions
- Pass Rate, Coverage, Auth Tests, Negative Tests, DB Verification, Cleanup
- List of all failures with root cause and business risk
- Coverage gaps grouped by module
- Top 5 priority issues
- Actionable recommendations

**Health score bands:**
| Score | Band | Meaning |
|---|---|---|
| 90-100 | Ship-ready | Safe to release |
| 75-89 | Good | Minor gaps to address |
| 60-74 | Needs work | Fix before release |
| 40-59 | High risk | Significant gaps |
| 0-39 | Critical | Not safe to rely on |

---

### /audit-coverage -- Find Coverage Gaps

Compares your swagger specs against existing test files to find untested endpoints.

```
/audit-coverage
```

**What it produces:**
- Total endpoint count from both Whiz and Phizz swagger specs
- Classification of every endpoint: Covered / Partial / Missing
- Missing endpoints grouped by module
- Priority recommendations (which modules to tackle first)

**Output example:**
```
Total endpoints in swagger:     436 (Whiz) + 181 (Phizz)
Covered:                        285  (46%)
Partially covered:               42  (7%)
Missing:                        290  (47%)
```

---

## Tier 2 -- Commands (Individual Pipeline Steps)

Commands are the building blocks that agents use internally. You can also run them standalone when you want **step-by-step control**.

**When to use:** You have a Jira ticket but want to run one step at a time, review between steps, or re-run a specific step.

### How Agents Chain Commands

Each agent internally calls a specific set of commands in order. Here's which agent uses which commands:

```
                    /fetch-ticket
                         │
                    /analyze-code
                         │
              ┌──────────┼──────────────────┐
              │          │                  │
     /create-manual  /create-api-auto  /create-ui-auto    /create-postman
       -test-cases    -test-cases       -test-cases         -collection
              │          │                  │
     /post-tests    /validate-spec     /validate-spec
       -to-jira      (api)              (ui)
                         │                  │
                    /run-tests          /run-tests
                      (api)              (ui)

  ──────────────  ──────────────────  ──────────────    ──────────────
  @manual-test-   @api-automation-    @ui-automation-   @postman-
  generator       test-generator      test-generator    collection-
                                                        generator
```

> Every command can also be run standalone. If you run a command and its prerequisites don't exist, it self-heals by running the missing steps first.

---

### Command Details

#### /fetch-ticket TKT-123

Connects to Jira via the Atlassian MCP, downloads the ticket's full details (summary, description, comments, subtasks, attachments), and saves structured files locally. Also builds a "discussion insights" document that summarizes key decisions from the comment thread.

- **Reads:** Jira API (via MCP)
- **Saves:** `docs/.ticket-context/TKT-123.json` + `TKT-123-discussion.md`
- **Pipeline key:** `fetch-ticket`

#### /analyze-code TKT-123 [pr:N]

Searches the product source code (both Whiz and Phizz repos) for files related to the ticket. Extracts keywords from the ticket, greps both repos, reads matching files, and produces a comparison table showing which requirements are implemented vs missing.

- **Reads:** Ticket context JSON + source code repos (from `productCode.rootPaths` in local config)
- **Saves:** `docs/.ticket-context/TKT-123-analysis.md`
- **Pipeline key:** `analyze-code`
- **PR mode:** With `pr:42`, only reads files changed in that PR instead of grepping the whole repo. If the PR has more than 10 source files, lists all files and asks the user whether to increase the limit
- **Default:** Without `pr:<N>`, defaults to full keyword scan across all product repos

#### /create-manual-test-cases TKT-123

Reads the ticket context, discussion insights, and code analysis, then generates manual test cases in a structured markdown format. Each test case is a single "Verify that..." line, grouped by section and tagged with Type: UI, API, or Mixed.

- **Reads:** `TKT-123.json` + `TKT-123-discussion.md` + `TKT-123-analysis.md`
- **Saves:** `docs/test-cases/TKT-123.md`
- **Pipeline key:** `create-manual-test-cases`
- **Self-heals:** Auto-runs `/fetch-ticket` and `/analyze-code` if their outputs are missing

#### /post-tests-to-jira TKT-123

Creates Jira Test issues for each manual test case and links them to the parent ticket. Has a human review gate — presents the full list and waits for you to approve, remove, update, or add test cases before creating anything.

- **Reads:** `docs/test-cases/TKT-123.md` + `TKT-123.json`
- **Saves:** `docs/.ticket-context/TKT-123-test-keys.json` (ledger mapping TC numbers to Jira keys)
- **Pipeline key:** `post-tests-to-jira`
- **Human gate:** Must type "approve" or "yes" to proceed

#### /create-api-automated-test-cases TKT-123

Reads the manual test cases tagged `Type: API` or `Type: Mixed` and generates a Cypress API spec file with `cy.api()` calls, proper auth, DB setup, and test tags.

- **Reads:** Manual test cases + ticket context + code analysis
- **Saves:** `cypress/e2e/API/<module>/[NN]-[method]-[resource].cy.js`
- **Pipeline key:** `create-api-automated-test-cases`
- **Hard gate:** Manual test cases must exist

#### /create-ui-automated-test-cases TKT-123

Reads the manual test cases tagged `Type: UI` or `Type: Mixed` and generates a Cypress UI spec file using the Page Object pattern. Creates a new Page Object if one doesn't exist.

- **Reads:** Manual test cases + ticket context + code analysis + existing Page Objects
- **Saves:** `cypress/e2e/JiraTicket/TS_<NUMBER>_<FeatureDescription>.cy.js` when the current git branch name contains the ticket ID, else `cypress/e2e/UI/<module>/[NN]-[action-description].cy.js` + optional Page Object
- **Pipeline key:** `create-ui-automated-test-cases`
- **Hard gate:** Manual test cases must exist

#### /validate-spec TKT-123 api|ui

Runs 10 automated checks (API) on a generated spec file and auto-fixes most issues (missing tags, missing auth hooks, placeholder text, etc.). Only marks the step as done if all checks pass. UI specs run the first 8 — checks 9–10 are API-only.

- **Reads:** The generated spec file (found via Grep for the ticket ID)
- **Saves:** Edits applied inline to the spec file
- **Pipeline key:** `validate-api-spec` or `validate-ui-spec`

**The checks:**

| # | Check | Auto-fix? |
|---|---|---|
| 1 | Ticket ID present in test names | Yes |
| 2 | No placeholder text (`[NN]`, `<endpoint>`, `<module-name>`) | Attempts |
| 3 | Required hooks (`beforeEach` with auth, `afterEach` with `clearCookies`) | Yes |
| 4 | Tags on every `it()` block | Yes (defaults to `@Regression`) |
| 5 | Unauthenticated test present | Yes (adds one) |
| 6 | `failOnStatusCode: false` on all `cy.api()` calls | Yes |
| 7 | No hardcoded credentials | Report only |
| 8 | Syntax check via `node --check` | Attempts |
| 9 | **No 5xx accepted in status assertions** (API) — hard gate | Report only (blocks `done`) |
| 10 | **Schema-validation spec exists** for each 200-JSON endpoint (API) | Auto-generates missing; notes non-JSON |

#### /run-tests TKT-123 api|ui [headed|headless] [local|staging|uat]

Executes the Cypress spec, retries on failure (up to 3 times with automatic diagnosis and fix), and posts a structured results comment to Jira. The API agent asks for approval before invoking it; the UI agent invokes it automatically (headless local by default).

- **Reads:** The spec file + run command templates from config
- **Saves:** Test results in `cypress/reports/` + Jira comment
- **Pipeline key:** `run-api-tests` or `run-ui-tests`
- **Human gate:** Must approve before tests execute

**Arguments:**

| Argument | Options | Default |
|---|---|---|
| Type | `api` or `ui` | Required |
| Mode | `headed` (visible browser) or `headless` (terminal only) | `headless` for api, `headed` for ui |
| Environment | `local`, `staging`, `uat` | `local` |

**Examples:**
```
/run-tests TKT-123 api headless local     # API tests, no browser, localhost
/run-tests TKT-123 ui headed local        # UI tests, visible browser, localhost
/run-tests TKT-123 api headless staging   # API tests against staging environment
```

#### /create-postman-collection TKT-123

Generates a Postman Collection v2.1 JSON with all endpoints from the ticket's code analysis, pre-configured auth scripts, collection variables, and negative test copies.

- **Reads:** Ticket context + code analysis + existing API specs + manual test cases (optional)
- **Saves:** `postman/collections/TKT-123-<slug>.postman_collection.json`
- **Pipeline key:** `generate-postman-collection`

### Running Commands Standalone

You can run any command independently — if its prerequisites are missing, it self-heals.

```
# Already have manual test cases? Jump straight to automation:
/create-api-automated-test-cases TKT-123

# Just want to validate a spec you wrote manually?
/validate-spec TKT-123 api

# Just want to run and report?
/run-tests TKT-123 api headless local
```

---

## Tier 3 -- Agents (Full Jira Pipelines)

Agents are intelligent orchestrators that chain multiple commands into a complete, end-to-end workflow. You give them a Jira ticket ID, and they handle everything — from fetching the ticket details to generating tests and posting results back to Jira.

**When to use:** You have a Jira ticket and want the full workflow done automatically from start to finish.

### How Agents Work

**Think of agents as senior QA engineers** who already know the process. When you hand them a ticket:

1. **They read the project config** — `.claude/project-config.json` (shared, checked in) and `.claude/project-config.local.json` (your machine-specific paths, gitignored). This tells them where source code lives, which Jira instance to use, and what auth strategy to apply.

2. **They track progress** — Every ticket gets a `pipeline-state.json` file in `docs/.ticket-context/` that records which steps are done. If the agent is interrupted (you close VS Code, network drops, context runs out), just rerun it with the same command — it picks up where it left off, skipping completed steps.

3. **They self-heal** — If a prerequisite file is missing (e.g., you run the API automation agent but ticket context wasn't fetched yet), the agent automatically runs the missing step first instead of stopping.

4. **They ask before acting on Jira** — Agents wait for explicit approval before creating Jira issues. The UI automation agent runs its generated tests automatically (headless local by default; `headed`/`staging`/`skip-run` flags available) so specs are always verified, not just written.

### Agent Flags

Every agent accepts optional flags after the ticket ID:

| Flag | What It Does | Example |
|---|---|---|
| `force` | Resets this agent's pipeline steps to "pending" so they run again from scratch | `@manual-test-generator TCA-456 force` |
| `pr:<N>` | Scopes the code analysis step to only scan files changed in PR #N, instead of grepping the entire codebase. If more than 10 source files changed, you'll be asked to increase the limit | `@manual-test-generator TCA-456 pr:42` |

Flags can be combined: `@manual-test-generator TCA-456 force pr:42`

> **Note:** The `force` flag is scoped per agent. Running `@api-automation-test-generator TCA-456 force` only resets the API automation steps — it does NOT re-fetch the ticket or re-analyze code. To regenerate everything, run `@manual-test-generator TCA-456 force` first.

---

### @manual-test-generator -- Generate Manual Test Cases

This is the **first agent you run for any Jira ticket**. It fetches the ticket from Jira, analyzes the related source code, generates manual test cases, and posts them to Jira as Test issues linked to the parent ticket. The automation agents (`@api-automation-test-generator` and `@ui-automation-test-generator`) require these manual test cases as input, so this must always run first.

#### Usage Examples

```
# Standard run — full pipeline from fetch to post
@manual-test-generator TCA-456

# Force regenerate everything (resets all 4 steps to pending)
@manual-test-generator TCA-456 force

# Scope code analysis to only files changed in PR #42
@manual-test-generator TCA-456 pr:42

# Both flags together
@manual-test-generator TCA-456 force pr:42
```

#### Detailed Pipeline Flow

```
@manual-test-generator TKT-123 [force] [pr:<N>]
│
├── Step 1: /fetch-ticket TKT-123
│   │
│   │  Downloads the Jira ticket and builds a structured context file
│   │  that all subsequent steps use as their source of truth.
│   │
│   ├── Reads project config (.claude/project-config.json + local overrides)
│   ├── Resolves Jira cloud ID (auto-discovers UUID from domain if needed)
│   ├── Calls Jira MCP → getJiraIssue with fields:
│   │   summary, description, issuetype, status, priority, labels,
│   │   components, fixVersions, attachment, subtasks, comment
│   ├── Extracts every comment (author displayName, created timestamp, full body text)
│   ├── Optionally re-fetches subtask details via additional getJiraIssue calls
│   ├── Builds discussion insights document:
│   │   ├── Final understanding of the bug/feature (description + all comments combined)
│   │   ├── Key decisions from comments (who said what, and when)
│   │   ├── Scenarios mentioned in discussion thread
│   │   ├── Open questions or ambiguities
│   │   └── How the discussion changes test scope vs. description alone
│   ├── Saves: docs/.ticket-context/TKT-123.json (full ticket data)
│   ├── Saves: docs/.ticket-context/TKT-123-discussion.md (discussion analysis)
│   └── Sets: pipeline-state → fetch-ticket = "done"
│
├── Step 2: /analyze-code TKT-123 [pr:<N>]
│   │
│   │  Searches the product source code (Whiz + Phizz repos) to understand
│   │  what code exists for the ticket's requirements. Produces a comparison
│   │  table that drives test case generation in Step 3.
│   │
│   ├── Self-heals: if TKT-123.json missing → auto-runs /fetch-ticket first
│   ├── Reads ticket context JSON to extract search keywords
│   ├── Source code scan (two modes):
│   │   ├── PR mode (pr:<N>): calls `gh pr view <N> --json files`,
│   │   │   reads only the changed source files (default limit: 10).
│   │   │   If file count exceeds limit, lists all files and asks
│   │   │   user to increase the limit or read all
│   │   └── Full mode (default): greps both Whiz + Phizz source repos
│   │       by keyword, reads max 5 matching files per repo
│   ├── Scans existing test suite structure:
│   │   ├── API specs in cypress/e2e/API/
│   │   ├── UI specs in cypress/e2e/UI/
│   │   ├── Page Objects in cypress/e2e/pages/
│   │   ├── Custom Cypress tasks in cypress/tasks/
│   │   ├── Custom Cypress commands in cypress/support/
│   │   └── Fixtures in cypress/fixtures/
│   ├── Builds "Requirements vs Code Comparison" table:
│   │   ├── ✅ Implemented as required — code matches the ticket requirement
│   │   ├── ⚠️ Partially implemented — code exists but doesn't fully satisfy the requirement
│   │   ├── ❌ Not implemented — requirement exists in ticket but no matching code found
│   │   └── 🔍 Undocumented code behavior — code does something not mentioned in the ticket
│   ├── Identifies: API endpoints (method + URL), DB tables, available Cypress commands
│   ├── Saves: docs/.ticket-context/TKT-123-analysis.md
│   └── Sets: pipeline-state → analyze-code = "done"
│
├── Step 3: /create-manual-test-cases TKT-123
│   │
│   │  Reads ALL context from Steps 1-2 and generates human-readable test cases.
│   │  The comparison table from Step 2 is the primary driver — not just the ticket
│   │  description. Discussion comments override the description where they conflict.
│   │
│   ├── Self-heals: auto-runs /fetch-ticket + /analyze-code if outputs missing
│   ├── Reads all 3 context files:
│   │   ├── TKT-123.json — description, acceptance criteria, issue type
│   │   ├── TKT-123-discussion.md — key decisions, scope changes from comments
│   │   └── TKT-123-analysis.md — endpoints, DB tables, comparison table
│   ├── Generates test cases based on the comparison table:
│   │   ├── ✅ Implemented → positive test confirming the behavior works
│   │   ├── ⚠️ Partial → test exercising partial path + negative test exposing gap
│   │   ├── ❌ Not implemented → test marked "Expected to Fail"
│   │   └── 🔍 Undocumented → test to protect and document the behavior
│   ├── Groups test cases into logical sections:
│   │   e.g. "UI Layout & State", "Core Feature Behavior", "API Negative Tests",
│   │   "Authentication & Authorization", "Data Persistence", "Edge Cases"
│   ├── Each section tagged with Type: UI | API | Mixed
│   │   └── This tag drives routing: API agent picks API/Mixed, UI agent picks UI/Mixed
│   ├── Each test case is a single "Verify that..." line (concise, no sub-steps)
│   ├── Numbering is sequential across ALL sections (1, 2, 3... not reset per section)
│   ├── Advisory warning if total exceeds 30 test cases (not a hard limit)
│   ├── Saves: docs/test-cases/TKT-123.md
│   └── Sets: pipeline-state → create-manual-test-cases = "done"
│
├── Step 4: /post-tests-to-jira TKT-123
│   │
│   │  Creates Jira Test issues for each manual test case and links them to the
│   │  parent ticket. This is the only step that modifies Jira, so it has a human
│   │  review gate — nothing is created until you explicitly approve.
│   │
│   ├── Reads manual test cases + ticket context
│   ├── Loads existing ledger (TKT-123-test-keys.json) for idempotency
│   ├── Duplicate detection (two-pass):
│   │   ├── Primary: match by test case number (stable even if text was edited)
│   │   └── Fallback: match by normalized summary text (for newly added items)
│   ├── HUMAN REVIEW GATE:
│   │   ├── Presents full table: #, Summary, Section, Type, Already In Jira
│   │   ├── You can: remove, update, add, or approve
│   │   ├── Warns if removing/updating a test already posted to Jira (orphan risk)
│   │   └── Loops until you explicitly say "approve" or "yes"
│   ├── Fetches parent issue fields via getJiraIssue:
│   │   components, fixVersions, priority, labels
│   ├── Identifies assignee (from config or current Jira user)
│   ├── Creates Test issues in batches of 8 via createJiraIssue
│   │   ├── Each issue inherits parent's components, fixVersions, priority, labels
│   │   └── Ledger saved after EACH batch (crash-safe — safe to interrupt mid-run)
│   ├── Links each Test issue to parent ticket via createIssueLink
│   ├── Posts summary comment to parent ticket with full test case table
│   ├── Saves ledger: docs/.ticket-context/TKT-123-test-keys.json
│   └── Sets: pipeline-state → post-tests-to-jira = "done"
│       └── If any links failed: sets "partial" (rerun retries only the failed links)
│
└── Final Summary: ticket details, files analyzed, TCs generated, Jira keys created
```

#### What It Produces

| Output | Location |
|---|---|
| Ticket context JSON | `docs/.ticket-context/TKT-123.json` |
| Discussion insights | `docs/.ticket-context/TKT-123-discussion.md` |
| Code analysis | `docs/.ticket-context/TKT-123-analysis.md` |
| Manual test cases | `docs/test-cases/TKT-123.md` |
| Jira issue ledger | `docs/.ticket-context/TKT-123-test-keys.json` |
| Pipeline state | `docs/.ticket-context/TKT-123-pipeline-state.json` |

#### Key Behaviors

| Behavior | How It Works |
|---|---|
| **Self-healing** | Steps 2 and 3 auto-run missing prerequisites instead of hard-stopping. Works both via the agent AND when running commands standalone |
| **Idempotent** | Rerun the same command — it skips completed steps automatically. Use `force` to regenerate from scratch |
| **Human gate** | Step 4 shows you every test case and waits for explicit approval before creating anything in Jira |
| **Crash-safe** | The Jira issue ledger saves after each batch of 8. If interrupted, rerun picks up from the last saved batch |
| **Resume partial** | If Step 4 was `partial` (some links failed), rerun skips the review gate entirely and retries only failed links |
| **Orphan warnings** | If you remove or update a test case that was already posted to Jira, the agent warns you with the Jira key |
| **Duplicate detection** | Matches by test case number first (stable across text edits), falls back to normalized summary text for new items |

---

### @api-automation-test-generator -- Generate + Run API Tests

Takes the manual test cases tagged `Type: API` or `Type: Mixed` (generated by `@manual-test-generator`) and converts them into a runnable Cypress API spec file. Then validates the spec for common issues, runs the tests, and posts the results back to Jira as a comment.

**Prerequisite:** Manual test cases must exist (`docs/test-cases/TKT-123.md`). Run `@manual-test-generator` first.

#### Usage Examples

```
# Standard run — generate spec, validate, and run tests
@api-automation-test-generator TCA-456

# Force regenerate the API spec + revalidate + rerun (keeps fetch/analyze from prior run)
@api-automation-test-generator TCA-456 force

# Scope code analysis to PR-changed files (if analyze-code hasn't run yet)
@api-automation-test-generator TCA-456 pr:42

# Both flags together
@api-automation-test-generator TCA-456 force pr:42
```

#### Detailed Pipeline Flow

```
@api-automation-test-generator TKT-123 [force] [pr:<N>]
│
├── Hard Gate: Manual test cases must exist at docs/test-cases/TKT-123.md
│   └── MISSING → STOP. "Run @manual-test-generator first"
│
├── Self-Heal Prerequisites (auto-runs if context files are missing):
│   ├── Missing TKT-123.json → auto-runs /fetch-ticket
│   └── Missing TKT-123-analysis.md → auto-runs /analyze-code
│
├── Step 1: /create-api-automated-test-cases TKT-123
│   │
│   │  Reads the manual test cases and generates a production-ready Cypress API
│   │  spec file. Only picks up sections tagged Type: API or Type: Mixed —
│   │  sections tagged Type: UI are left for the UI automation agent.
│   │
│   ├── Reads manual test cases (API and Mixed sections ONLY, ignores Type: UI)
│   ├── Reads ticket context + code analysis for:
│   │   ├── API endpoints (method + URL)
│   │   ├── Available DB tasks in cypress/tasks/
│   │   └── Available custom commands in cypress/support/
│   ├── Applies test limits from config:
│   │   ├── Bug tickets: max 2 automated tests (reproduce + regression)
│   │   └── Story tickets: target 8 tests PER SPEC FILE — multi-layer tickets
│   │       get multiple spec files (visibility / API results / UI results),
│   │       plus role-matrix both-directions coverage on every screen
│   │   └── Skipped manual TCs are listed so you know what wasn't automated
│   ├── Generates spec file with:
│   │   ├── before() — DB queries to set up test data (only if matching task exists)
│   │   ├── beforeEach() — login command + session cookie + CSRF token
│   │   ├── afterEach() — cy.clearCookies()
│   │   ├── Happy path tests — tagged @PR @Smoke (200/201 responses)
│   │   ├── Negative/edge tests — tagged @Regression (400/422, missing fields)
│   │   ├── Unauthenticated test — tagged @Regression (expects 401/403)
│   │   └── after() — cleanup for POST/PUT tests (optional)
│   ├── If a spec for the same endpoint already exists, appends new it() blocks
│   ├── Saves: cypress/e2e/API/<module>/[NN]-[method]-[resource].cy.js
│   └── Sets: pipeline-state → create-api-automated-test-cases = "done"
│
├── Step 2: Create Schema Validation (auto — same change as the spec)
│   │
│   │  For every endpoint the spec automates that returns a 200 JSON body, adds a
│   │  hand-style draft-07 schema in cypress/fixtures/schemas/<name>.schema.json and
│   │  one per-endpoint spec in cypress/e2e/API/schema-validation/<whiz|phizz>/
│   │  (cy.fixture + to.be.jsonSchema). Reuses an existing schema if present; skips
│   │  non-JSON responses (PDF/CSV/307 download).
│   └── Sets: pipeline-state → create-schema-validation = "done"
│
├── Step 3: /validate-spec TKT-123 api
│   │
│   │  Runs 10 automated checks (API) on the generated spec and auto-fixes most issues.
│   │  Only marks the step as "done" if all checks pass.
│   │
│   ├── Finds the spec file via Grep(TKT-123) in cypress/e2e/API/
│   ├── Runs 10 validation checks:
│   │   ├── 1. Ticket ID present in every it() description (auto-fix: prepends [TKT-123])
│   │   ├── 2. No placeholder text like [NN], <endpoint> (auto-fill from analysis)
│   │   ├── 3. beforeEach with auth + afterEach with clearCookies (auto-fix: adds missing)
│   │   ├── 4. Tags on every it() block (auto-fix: defaults to @Regression)
│   │   ├── 5. Unauthenticated test present (auto-fix: appends one)
│   │   ├── 6. failOnStatusCode: false on all cy.api() calls (auto-fix: adds it)
│   │   ├── 7. No hardcoded credentials (report only — flags for manual fix)
│   │   ├── 8. Syntax check via node --check (auto-fix: common bracket/comma issues)
│   │   ├── 9. No 5xx accepted in status assertions — HARD GATE (report only; blocks "done")
│   │   └── 10. Schema-validation spec exists for each 200-JSON endpoint (auto-generates missing)
│   ├── Cross-checks DB task names in before() against actual tasks in cypress/tasks/
│   └── Sets: pipeline-state → validate-api-spec = "done"
│
├── Step 4: /run-tests TKT-123 api headless local
│   │
│   │  Executes the validated spec, retries on failure, and posts a structured
│   │  results comment to the Jira ticket.
│   │
│   ├── HUMAN APPROVAL GATE → asks before running
│   │   └── You can: approve / skip / change env (staging, uat) / change mode (headed)
│   ├── Resolves run command from config template (substitutes spec path + env)
│   ├── Executes: npx cypress run --spec "<file>" --reporter mochawesome
│   ├── On failure: up to 3 retries with automatic diagnosis and fix:
│   │   ├── Selector/locator issues → fixes selectors in the spec
│   │   ├── Auth issues → fixes login command or session/CSRF handling
│   │   ├── DB setup issues → fixes queries in before() hook
│   │   └── Timing issues → adds cy.wait() or increases timeout
│   ├── Posts results to Jira via addCommentToJiraIssue:
│   │   pass/fail counts, duration, failure details, report path
│   │   └── If Jira post fails (auth/network), logs warning but doesn't block — results saved locally
│   └── Sets: pipeline-state → run-api-tests = "done"
│
└── Final Summary: spec file path, test count, validation results, run results
```

#### What It Produces

| Output | Location |
|---|---|
| Cypress API spec | `cypress/e2e/API/<module>/[NN]-[method]-[resource].cy.js` |
| Validation report | Printed to console (fixes applied inline) |
| Test results | Jira comment on parent ticket |
| HTML report | `cypress/reports/html/index.html` |

#### Key Behaviors

| Behavior | How It Works |
|---|---|
| **Hard gate** | Manual test cases MUST exist before this agent will start. No bypass, no auto-generation |
| **Self-healing** | Auto-runs fetch-ticket + analyze-code if their outputs are missing. Works both via agent AND standalone |
| **Test limits** | Bug tickets: max 2 automated tests. Story tickets: max 4. Skipped TCs are listed so you know what was left out |
| **Appends, not duplicates** | If a spec for the same endpoint already exists, adds new it() blocks instead of creating a second file |
| **3-retry loop** | When tests fail, the agent reads the error, diagnoses the root cause, fixes the spec, and reruns — up to 3 times |
| **Idempotent** | Rerun skips completed steps. Use `force` to regenerate the spec, revalidate, and rerun |
| **Human gate** | None for test execution — runs automatically (headless local). Flags: `headed`, `staging`/`uat`, `skip-run` |

#### Known Limitations

| # | Issue |
|---|---|
| 1 | No Phizz ticket routing — all generated tests use Whiz auth. Config has `auth.phizz` but no agent auto-detects Phizz tickets |
| 2 | Schema validation tests ARE auto-generated for 200-JSON endpoints (pipeline Step 2 → schema JSON in `cypress/fixtures/schemas/` + a per-endpoint spec in `schema-validation/`). Non-JSON responses (PDF/CSV/307) are skipped by design and noted in the spec |
| 3 | DB assertions for POST/PUT/DELETE not auto-generated. You may need to add `cy.task("queryDb")` assertions manually |

---

### @ui-automation-test-generator -- Explore + Generate + Run UI Tests

Takes the manual test cases tagged `Type: UI` or `Type: Mixed`, **explores the live app in a browser** to capture verified selectors / DOM / async & modal behavior / exact error text / DB test data, then converts them into a Cypress browser test spec using the Page Object pattern. Then validates the spec, runs the tests (headless local by default), and posts results to Jira.

**Prerequisites:**
- Manual test cases with `Type: UI` or `Type: Mixed` sections must exist. Run `@manual-test-generator` first.
- **Browser MCP (`claude-in-chrome`) connected** and the **app running locally** (Whiz `:4000`, Phizz `:3000`) — the exploration step drives the real app. DB creds in `cypress.env.json` for test-data discovery.
- Login uses **Option A (auto-detect session):** the agent reuses an already-logged-in browser; only if no session is live does it fill your email and pause for you to type the password + click Login. It never types/reads your password. (The generated specs still authenticate programmatically, so test *runs* need no human.)

#### Usage Examples

```
# Standard run — explore live app, generate UI spec, validate, and run headless
@ui-automation-test-generator TCA-456

# Watch the run in a visible browser
@ui-automation-test-generator TCA-456 headed

# Force re-explore + regenerate the UI spec + revalidate + rerun
@ui-automation-test-generator TCA-456 force

# Scope code analysis to PR-changed files
@ui-automation-test-generator TCA-456 pr:42

# Both flags together
@ui-automation-test-generator TCA-456 force pr:42
```

#### Detailed Pipeline Flow

```
@ui-automation-test-generator TKT-123 [force] [pr:<N>]
│
├── Hard Gate 1: Manual test cases must exist at docs/test-cases/TKT-123.md
│   └── MISSING → STOP. "Run @manual-test-generator first"
│
├── Hard Gate 2: UI test cases presence check (unique to this agent)
│   │  Reads TKT-123.md and counts sections tagged Type: UI or Type: Mixed.
│   │  If the ticket only has API tests, this agent has nothing to do.
│   ├── Counts sections tagged Type: UI or Type: Mixed
│   └── ZERO → STOP. "No UI tests found. Suggest @api-automation-test-generator"
│
├── Self-Heal Prerequisites (auto-runs if context files are missing):
│   ├── Missing TKT-123.json → auto-runs /fetch-ticket
│   └── Missing TKT-123-analysis.md → auto-runs /analyze-code
│
├── Browser & Login Setup (Option A — auto-detect session):
│   ├── Opens the app in the Claude Browser
│   ├── Auto-detects an existing session (no redirect to /login) → continues
│   └── Else fills email, PAUSES for you to type the password + Login, then continues
│       (never types/reads the password)
│
├── Step 1: /explore-live-app TKT-123
│   │
│   │  Drives the real app through the manual-case flow to capture ground truth.
│   │
│   ├── DB-driven test-data discovery (psql, creds from cypress.env.json)
│   │   └── Encodes every precondition; flags destructive/stateful & scarce data
│   ├── Walks each UI/Mixed flow: navigate → read_page/javascript_tool for exact
│   │   selectors → screenshots → real clicks into modals/confirmations
│   ├── Captures async behavior (badges that don't re-render → reload/DB poll),
│   │   network calls (read_network_requests), and EXACT error/toast text
│   ├── Writes docs/.ticket-context/TKT-123-exploration.md (authoritative selectors)
│   └── Sets: pipeline-state → explore-live-app = "done"
│
├── Step 2: /create-ui-automated-test-cases TKT-123
│   │
│   │  Generates a Cypress UI spec using the Page Object pattern. Selectors are
│   │  NEVER hardcoded in the spec — they live in a Page Object class — and come
│   │  from the exploration notes (verified), not guessed from source.
│   │
│   ├── Reads manual test cases (UI and Mixed sections ONLY, ignores Type: API)
│   ├── Reads TKT-123-exploration.md (AUTHORITATIVE selectors/flow/errors/data)
│   ├── Reads ticket context + code analysis (role-gating, backend error strings)
│   ├── Discovers existing Page Objects via Glob cypress/e2e/pages/**/*.js
│   │   └── Reuses existing Page Object methods and selectors where available
│   ├── Generates spec file with:
│   │   ├── Import statement for the Page Object class
│   │   ├── beforeEach() — login command + cy.visit() to the target page
│   │   ├── afterEach() — cy.clearCookies() + cy.clearLocalStorage()
│   │   ├── Happy path flows — tagged @PR @Smoke (valid inputs, expected outcomes)
│   │   ├── Negative/validation flows — tagged @Regression (invalid inputs, error states)
│   │   └── Access control test — tagged @Regression (unauthenticated → redirect to /login)
│   ├── Creates a new Page Object if none exists for the module:
│   │   ├── Class with getter methods for each element selector
│   │   ├── Action methods (navigateTo, fillField, clickSubmit, etc.)
│   │   └── Saves: cypress/e2e/pages/<domain>/<ModuleName>Page.js (auth/, store/, claims/, lca/, admin/<section>/)
│   ├── Saves: cypress/e2e/JiraTicket/TS_<NUMBER>_<Feature>.cy.js (ticket ID in branch name)
│   │          else cypress/e2e/UI/<module>/[NN]-[action-description].cy.js
│   └── Sets: pipeline-state → create-ui-automated-test-cases = "done"
│
├── Step 3: /validate-spec TKT-123 ui
│   │
│   │  Same 8-check validation as the API agent, with UI-specific differences.
│   │
│   ├── Finds spec file via Grep(TKT-123) in cypress/e2e/UI/ (and JiraTicket/)
│   ├── Runs 8 validation checks (same as API checks 1–8, with these differences;
│   │   │                          checks 9–10 are API-only and not run for UI):
│   │   ├── Check 5: verifies login-redirect test instead of 401/403 status test
│   │   └── Check 6: failOnStatusCode check SKIPPED (not applicable to UI tests)
│   └── Sets: pipeline-state → validate-ui-spec = "done"
│
├── Step 4: /run-tests TKT-123 ui headless local auto
│   │
│   │  Runs automatically (the `auto` token skips the approval gate). Default is
│   │  HEADLESS local — pass `headed` to watch, `staging`/`uat` for other envs,
│   │  `skip-run` to generate/validate only.
│   │
│   ├── No approval prompt (agent pipeline auto-approves)
│   ├── On failure: up to 3 retries with automatic diagnosis and fix:
│   │   ├── Selector issues → fixes selectors in the Page Object
│   │   ├── Auth issues → fixes login command or cookie handling
│   │   ├── Timing/async → adds cy.wait()/reload or increases timeout
│   │   └── React controlled-input value lost → one-shot native setter + input event
│   ├── After a green headless run, re-runs headed if the user asked for `headed`
│   ├── Posts results to Jira via addCommentToJiraIssue
│   │   └── If Jira post fails, logs warning — results saved locally
│   └── Sets: pipeline-state → run-ui-tests = "done"
│
└── Final Summary: exploration notes path, spec path, Page Objects used/created,
    test count, screenshot paths
```

#### What It Produces

| Output | Location |
|---|---|
| Live-app exploration notes | `docs/.ticket-context/TKT-123-exploration.md` (verified selectors, DOM/async notes, exact error text, test-data query) |
| Cypress UI spec | `cypress/e2e/JiraTicket/TS_<NUMBER>_<Feature>.cy.js` (ticket ID in branch name) else `cypress/e2e/UI/<module>/[NN]-[action-description].cy.js` |
| Page Object (new) | `cypress/e2e/pages/<domain>/<ModuleName>Page.js` (domain folder: `auth/`, `store/`, `claims/`, `lca/`, `admin/<section>/`) |
| Validation report | Printed to console |
| Test results | Jira comment on parent ticket |
| Screenshots (on failure) | `cypress/screenshots/` |

#### Key Behaviors

| Behavior | How It Works |
|---|---|
| **Live-app exploration** | Drives the real app to capture verified selectors, DOM/async behavior, exact error text, and DB test data before writing the spec (Step 1) |
| **Option-A auth** | Auto-detects an existing browser session; only pauses for you to log in if none is live. Never types/reads your password |
| **UI-specific gate** | Stops early if ticket has no UI/Mixed test cases and suggests the API agent instead |
| **Page Object enforced** | Never hardcodes selectors in spec files. Always uses or creates a Page Object class, from exploration-verified selectors |
| **Headless by default** | UI tests run headless local by default; pass `headed` to watch. Runs automatically (no approval gate) |
| **Self-healing** | Auto-runs prerequisites if missing (fetch → analyze → explore). Works both via agent AND standalone |
| **3-retry loop** | On failure, reads the error, fixes the spec or Page Object, and reruns — up to 3 times |
| **Idempotent** | Rerun skips completed steps. Use `force` to re-explore, regenerate the spec, revalidate, and rerun |

#### Known Limitations

| # | Issue |
|---|---|
| 1 | No Phizz ticket routing — same as API agent |
| 2 | Exploration is interactive and browser-heavy — it needs the browser MCP (`claude-in-chrome`) connected and the app running locally, and (for a cold session) a one-time manual login. Not suited to fully-headless/cron runs |
| 3 | Exploration itself is non-deterministic (clicks may vary run to run); determinism of the *generated spec* comes from the captured selectors + DB-picked data, not the exploration session |

---

### @postman-collection-generator -- Generate Postman Collection

Analyzes the API endpoints related to a Jira ticket and generates a ready-to-import Postman Collection v2.1 JSON file. The collection includes pre-configured auth, request bodies, test assertions, and a negative-tests subfolder. Unlike the automation agents, this one does NOT require manual test cases — it works independently from code analysis alone.

**No hard prerequisites.** Manual test cases are optional (used for enrichment if they exist).

#### Usage Examples

```
# Standard run — fetch ticket, analyze code, generate collection
@postman-collection-generator TCA-456

# Force regenerate the collection (keeps fetch/analyze from prior run)
@postman-collection-generator TCA-456 force

# Scope code analysis to PR-changed files
@postman-collection-generator TCA-456 pr:42

# Both flags together
@postman-collection-generator TCA-456 force pr:42
```

#### Detailed Pipeline Flow

```
@postman-collection-generator TKT-123 [force] [pr:<N>]
│
├── Self-Heal Prerequisites (auto-runs if not done):
│   │  Unlike the automation agents, this agent has no "manual test cases" hard gate.
│   │  It only needs the ticket context and code analysis.
│   │
│   ├── /fetch-ticket TKT-123
│   │   ├── Fetches ticket from Jira (same as manual-test-generator Step 1)
│   │   ├── Saves: docs/.ticket-context/TKT-123.json + TKT-123-discussion.md
│   │   └── Sets: pipeline-state → fetch-ticket = "done"
│   │
│   └── /analyze-code TKT-123 [pr:<N>]
│       ├── Scans source code for API endpoints (same as manual-test-generator Step 2)
│       ├── Saves: docs/.ticket-context/TKT-123-analysis.md
│       └── Sets: pipeline-state → analyze-code = "done"
│
├── Optional Enrichment: Manual Test Cases
│   ├── Checks docs/test-cases/TKT-123.md
│   ├── EXISTS → reads test scenarios and expected status codes to write better
│   │   Postman test scripts (e.g. "expect status 200" instead of generic checks)
│   └── MISSING → proceeds without enrichment (NO hard gate)
│
├── Step 1: /create-postman-collection TKT-123
│   │
│   │  Builds a complete Postman Collection v2.1 JSON from the code analysis.
│   │  The collection is ready to import into Postman — just set the variables.
│   │
│   ├── Reads: ticket context, code analysis, manual test cases (if available)
│   ├── Reads: existing Cypress API specs for request body structures and headers
│   ├── Determines auth strategy from config:
│   │   ├── cookie — session cookie in Cookie header (pre-request script calls login endpoint)
│   │   ├── bearer — JWT/Bearer token in Authorization header
│   │   ├── apikey — API key in a custom header
│   │   └── none — public endpoints only
│   ├── Builds Postman Collection JSON with:
│   │   ├── Collection info (UUID, name from ticket summary, description, schema version)
│   │   ├── Collection-level pre-request script (auto-login on first request)
│   │   ├── Collection variables: base_url, auth_token, csrf_token, session_cookie
│   │   │   └── Plus dynamic variables discovered from analysis (contract_id, store_id, etc.)
│   │   ├── Request items per endpoint:
│   │   │   ├── Method, URL with {{base_url}} prefix, path/query parameters
│   │   │   ├── Headers (Cookie, x-csrf-token, Content-Type)
│   │   │   ├── Request body for POST/PUT (derived from code analysis + existing specs)
│   │   │   └── Test scripts asserting status code, response time, body structure
│   │   └── "Negative Tests" subfolder:
│   │       └── Duplicate of each auth-protected request with Cookie header removed,
│   │           asserting 401 or 403
│   ├── Validates JSON via: node -e "JSON.parse(...)"
│   ├── Creates output directory if needed: mkdir -p postman/collections/
│   ├── Saves: postman/collections/TKT-123-<slug>.postman_collection.json
│   └── Sets: pipeline-state → generate-postman-collection = "done"
│
├── HUMAN REVIEW GATE (interactive loop)
│   │  Unlike the other agents where the gate is approve/reject, this gate
│   │  lets you iteratively add or remove requests before finalizing.
│   │
│   ├── Displays request summary table:
│   │   #, Request Name, Method, Endpoint, Auth, Test Count
│   ├── You can:
│   │   ├── approve — finalize and optionally post to Jira
│   │   ├── add <endpoint> — add a missing request (e.g. "add DELETE /api/contracts/:id")
│   │   ├── remove <name> — remove a request by name
│   │   └── skip jira — save the file without posting a Jira comment
│   └── Loops until you approve
│
├── Optional: Post to Jira
│   ├── Posts comment via addCommentToJiraIssue with collection file path
│   └── Skipped if you said "skip jira"
│
└── Final Summary: endpoint count, file path, collection variables to set in Postman
```

#### What It Produces

| Output | Location |
|---|---|
| Postman Collection JSON | `postman/collections/TKT-123-<slug>.postman_collection.json` |
| Jira comment (optional) | Comment on parent ticket with collection file path |

#### Key Behaviors

| Behavior | How It Works |
|---|---|
| **No hard gate on manual TCs** | Works independently. Manual test cases enrich the collection but aren't required |
| **Interactive review loop** | You can add/remove requests iteratively, not just approve/reject. The collection file updates after each change |
| **4 auth strategies** | Supports cookie, bearer, apikey, none — configured in `project-config.json` |
| **Negative test subfolder** | Automatically generates unauthenticated duplicates of each protected endpoint |
| **JSON validation** | Verifies the output is valid JSON before declaring success |
| **Optional Jira posting** | Can skip with "skip jira" if you just want the file locally |
| **Self-healing** | Auto-runs fetch-ticket + analyze-code if their outputs are missing |
| **Idempotent** | Rerun skips completed steps. Use `force` to regenerate the collection |

#### Known Limitations

| # | Issue |
|---|---|
| 1 | No Phizz auth handling — collection always uses the Whiz login endpoint |
| 2 | Does not read swagger specs for endpoint discovery (relies only on code analysis) |
| 3 | No Postman Environment file generated. You must manually create environments in Postman |
| 4 | `postman/collections/` directory doesn't exist in repo. Created automatically at runtime |

---

### Agent Comparison Table

| Feature | Manual Test Gen | API Automation | UI Automation | Postman Collection |
|---|---|---|---|---|
| **Steps** | 4 (fetch → analyze → create → post) | 3 (create → validate → run) | 3 (create → validate → run) | 1 (create) + review loop |
| **Manual TCs required** | N/A (creates them) | Hard gate | Hard gate + UI count check | Optional enrichment |
| **Self-heals prerequisites** | All steps (agent + standalone) | Yes (agent + standalone) | Yes (agent + standalone) | Yes (agent + standalone) |
| **Force rerun flag** | `force` resets all steps | `force` resets API steps | `force` resets UI steps | `force` resets collection step |
| **PR-scoped scan** | `pr:<N>` supported | `pr:<N>` supported | `pr:<N>` supported | `pr:<N>` supported |
| **Human approval gate** | Step 4 (before Jira posting) | Step 3 (before test run) | None — auto-runs headless local (`headed`/`staging`/`skip-run` flags) | After generation (interactive loop) |
| **Local config support** | Yes | Yes | Yes | Yes |
| **Cloud ID auto-resolve** | Yes | Yes | Yes | Yes |
| **Jira error handling** | Yes (fetch + post) | Yes (fetch + run) | Yes (fetch + run) | Yes (fetch + comment) |
| **Phizz support** | Source scan: Yes. Auth: N/A | No routing | No routing | No routing |
| **Default run mode** | N/A | Headless | Headed (visible browser) | N/A |
| **Jira output** | Test issues created | Results comment | Results comment | File path comment (optional) |
| **Idempotent rerun** | Yes | Yes | Yes | Yes |
| **Pipeline state keys** | 4 | 5 | 5 | 3 |

### Rerun Behavior (All Agents)

All agents are idempotent. On rerun:
- Each step checks pipeline state and skips if "done"
- You see: `"Step already completed -- skipping"` for each finished step
- To force regeneration, use the `force` flag — each agent resets only its own steps:

```
@manual-test-generator TKT-123 force        # resets all 4 steps
@api-automation-test-generator TKT-123 force # resets only API steps
@ui-automation-test-generator TKT-123 force  # resets only UI steps
@postman-collection-generator TKT-123 force  # resets only collection step
```

### Known Limitations (All Agents)

| # | Issue | Workaround |
|---|---|---|
| 1 | **No Phizz ticket routing.** Config has `auth.phizz` but no agent auto-detects Phizz tickets. All generated tests use Whiz auth | Manually edit generated specs to use Phizz login command and base URL |
| 2 | **No git branch/commit guidance.** Generated files are written to the working tree but never committed | Review and commit generated files yourself |

---

## End-to-End Walkthrough

Here's exactly what happens when you run the full pipeline for a Jira ticket, step by step.

### Step 1: Generate Manual Test Cases + Post to Jira

```
@manual-test-generator TCA-456
```

**What you see:**

```
✔ Reading project config...
✔ Fetching TCA-456 from Jira...

  Title: Add ability to manually expire maintenance contracts
  Type: Story | Status: In Progress | Priority: Medium
  Comments: 3 fetched (key insight: "only affects non-Asbury stores")

✔ Saved: docs/.ticket-context/TCA-456.json
✔ Saved: docs/.ticket-context/TCA-456-discussion.md
✔ Pipeline state: fetch-ticket → done

✔ Analyzing source code...
  Scanned: whiz/controllers/contracts.go, whiz/models/contract.go (+ 3 more)
  Found: PUT /api/contracts/:id/expire, GET /api/contracts
  Comparison: 4 ✅ implemented, 1 ⚠️ partial, 1 ❌ not implemented

✔ Saved: docs/.ticket-context/TCA-456-analysis.md
✔ Pipeline state: analyze-code → done

✔ Generating manual test cases...
  Created 14 test cases across 4 sections (API: 8, UI: 4, Mixed: 2)

✔ Saved: docs/test-cases/TCA-456.md
✔ Pipeline state: create-manual-test-cases → done

  Manual Test Cases for TCA-456 — Review Before Posting

  | # | Summary                                           | Type | In Jira |
  |---|---------------------------------------------------|------|---------|
  | 1 | Verify that PUT /expire returns 200 for active... | API  | —       |
  | 2 | Verify that expired contract status changes to... | API  | —       |
  | 3 | Verify that the Expire button is disabled for...  | UI   | —       |
  ...

  Total: 14 new + 0 already created = 14 total

  Approve Manual Test Cases
  - approve — create issues in Jira
  - remove #3, #7 — remove specific test cases
  - update #2 to "Verify that..." — edit text
  - add: Verify that... — add a new test case
```

**You type:** `approve`

```
✔ Creating Test issues in Jira (batch 1 of 2)...
✔ Created: TCA-501, TCA-502, TCA-503, TCA-504, TCA-505, TCA-506, TCA-507, TCA-508
✔ Creating Test issues in Jira (batch 2 of 2)...
✔ Created: TCA-509, TCA-510, TCA-511, TCA-512, TCA-513, TCA-514
✔ All 14 issues linked to TCA-456
✔ Summary comment posted to TCA-456
✔ Pipeline state: post-tests-to-jira → done

Final Summary:
  Ticket: TCA-456 — Add ability to manually expire maintenance contracts
  Test cases: 14 created, 14 linked to parent
  Jira keys: TCA-501 through TCA-514
```

### Step 2: Generate and Run API Automation

```
@api-automation-test-generator TCA-456
```

**What you see:**

```
✔ Manual test cases found — proceeding with API automation
✔ fetch-ticket already completed — skipping
✔ analyze-code already completed — skipping

✔ Generating API spec from 8 API/Mixed test cases...
  Test limits: Story = target 8 tests per spec file (multiple spec files for multi-layer tickets)
  Automated: TC 1, 2, 5, 9 (happy path + negative + unauth)
  Skipped: TC 3, 4, 6, 7, 8 (exceeded limit — listed for reference)

✔ Saved: cypress/e2e/API/contracts-module/05-put-expire-contract.cy.js
✔ Pipeline state: create-api-automated-test-cases → done

✔ Validating spec...
  ✅ Ticket ID in test names
  ✅ No placeholder text
  ✅ Required hooks present
  ✅ Tags on all it() blocks
  ✅ Unauthenticated test present
  ✅ failOnStatusCode: false on all cy.api() calls
  ✅ No hardcoded credentials
  ✅ Syntax check passed
  Overall: READY TO RUN ✅

✔ Pipeline state: validate-api-spec → done

Run API Tests for TCA-456?
  Default: headless mode, local environment.
  - yes / approve — run with defaults
  - skip — finish without running
```

**You type:** `yes`

```
✔ Running: npx cypress run --spec "cypress/e2e/API/contracts-module/05-put-expire-contract.cy.js"

  ✅ TC-01: [TCA-456] Validate PUT /expire returns 200         (1.2s)
  ✅ TC-02: [TCA-456] Validate PUT /expire with invalid ID      (0.8s)
  ❌ TC-03: [TCA-456] Validate PUT /expire missing body         (0.9s)
     → Expected 400, got 500. Diagnosing...
     → Fix: request body was empty object, backend expects { reason: "" }
     → Retry 1/3...
  ✅ TC-03: [TCA-456] Validate PUT /expire missing body         (0.9s)  ← fixed
  ✅ TC-04: [TCA-456] Validate unauthenticated request          (0.5s)

  4 passing (4.3s)

✔ Results posted to Jira (TCA-456)
✔ Report: cypress/reports/html/index.html
✔ Pipeline state: run-api-tests → done
```

### Generated Files After Full Pipeline

After running both agents, here's what exists on disk:

```
docs/
├── .ticket-context/
│   ├── TCA-456.json                    ← ticket data from Jira
│   ├── TCA-456-discussion.md           ← comment analysis
│   ├── TCA-456-analysis.md             ← source code analysis
│   ├── TCA-456-test-keys.json          ← Jira issue ledger (TC# → key)
│   └── TCA-456-pipeline-state.json     ← tracks which steps are done
│
└── test-cases/
    └── TCA-456.md                      ← manual test cases

cypress/
├── e2e/
│   └── API/
│       └── contracts-module/
│           └── 05-put-expire-contract.cy.js  ← generated API spec
│
└── reports/
    └── html/
        └── index.html                  ← mochawesome test report
```

---

## Decision Guide -- What to Use When

### Quick Reference Table

| Scenario | What to Run | Tier |
|---|---|---|
| New Jira story, need full test coverage | `@manual-test-generator TKT-123` then `@api-automation-test-generator TKT-123` | Agent |
| PR just came in, need quick API tests | `/generate-api-test` + paste PR number or curl | Skill |
| A test is failing, need to fix it | `/fix-test` + paste the error | Skill |
| Want to add edge cases to an existing file | `/add-test-cases` on the file | Skill |
| Before release, check test health | `/qa-only` | Skill |
| Before release, fix all failures | `/qa` | Skill |
| Planning what to automate next | `/audit-coverage` | Skill |
| Need a Postman collection for an endpoint | `@postman-collection-generator TKT-123` | Agent |
| Want to re-run just the tests for a ticket | `/run-tests TKT-123 api headless local` | Command |
| Want to re-validate a spec after manual edits | `/validate-spec TKT-123 api` | Command |
| Need manual test cases posted to Jira only | `/create-manual-test-cases TKT-123` then `/post-tests-to-jira TKT-123` | Command |

### Flowchart

```
START: What do you need?
│
├── "I have a Jira ticket"
│   │
│   ├── "Full automation end-to-end"
│   │   └── Use AGENTS (@manual-test-generator, then @api-automation-test-generator)
│   │
│   └── "Just one specific step"
│       └── Use COMMANDS (/fetch-ticket, /analyze-code, etc.)
│
├── "No Jira ticket, just need tests"
│   │
│   ├── "For a specific endpoint or PR"
│   │   └── /generate-api-test or /generate-ui-test
│   │
│   └── "Expand an existing test file"
│       └── /add-test-cases
│
├── "Tests are broken"
│   │
│   ├── "One specific test is failing"
│   │   └── /fix-test
│   │
│   └── "Fix everything and report"
│       └── /qa
│
└── "I want a report, not changes"
    │
    ├── "What's failing?"
    │   └── /qa-only
    │
    └── "What's not covered?"
        └── /audit-coverage
```

---

## Real-World Scenarios

### Scenario 1: New Feature Story from Jira

A new Jira story `TCA-456` comes in: "Add endpoint to update store hours."

```bash
# Step 1: Generate manual test cases and post to Jira
@manual-test-generator TCA-456
# Review the test cases when prompted, approve them

# Step 2: Generate and run API automation
@api-automation-test-generator TCA-456
# Spec created, validated, executed — results posted to Jira

# Step 3: If the story has UI changes too
@ui-automation-test-generator TCA-456

# Step 4 (optional): Generate a Postman collection for the dev team
@postman-collection-generator TCA-456
```

For a detailed view of what you see at each step, see [End-to-End Walkthrough](#end-to-end-walkthrough).

---

### Scenario 2: Quick Tests for a Pull Request

A teammate opened PR #87 that adds a new `DELETE /api/stores/{id}` endpoint.

```bash
/generate-api-test
Write tests for PR #87
```

The skill reads the PR diff, detects the new endpoint, and generates a complete test file with delete, 404, and auth tests. No Jira ticket needed.

---

### Scenario 3: A Test Started Failing After a Backend Change

The CI pipeline shows `04-put-cancel-contract.cy.js` failing.

```bash
/fix-test
# Paste the error:
# CypressError: expected 400 to equal 200
# at Context.eval (cypress/e2e/API/contract-cancellation-module/04-put-cancel-contract.cy.js:45)
```

The skill reads the file, checks the swagger, finds the request body is missing `store_id`, fixes it, and shows you the diff.

---

### Scenario 4: Pre-Release Health Check

Before cutting a release, check the test suite health:

```bash
# Read-only audit first
/qa-only

# If failures found, auto-fix them
/qa

# Check what endpoints still lack test coverage
/audit-coverage
```

---

### Scenario 5: Expanding Test Coverage for a Module

You have `01-get-contracts.cy.js` with only happy path tests. Need more coverage.

```bash
/add-test-cases
Add regression cases and DB verification to cypress/e2e/API/contracts-module/01-get-contracts.cy.js
```

The skill reads the existing file, continues numbering from the last test case, and adds unauthenticated, missing field, invalid ID, and DB verification tests.

---

### Scenario 6: Building a Postman Collection for API Handoff

You need to share API documentation with a frontend developer.

```bash
@postman-collection-generator TCA-789
```

Generates a Postman Collection JSON with all endpoints from the ticket, pre-configured auth, and test assertions. Import directly into Postman.

---

### Scenario 7: Force Regenerating Tests After Requirements Changed

The Jira ticket `TCA-456` was updated — new acceptance criteria were added and a comment narrowed the scope. You already ran the manual test generator last week, but need new test cases based on the latest ticket state.

```bash
# Regenerate everything from scratch — re-fetches ticket, re-analyzes code, regenerates TCs
@manual-test-generator TCA-456 force

# Now regenerate the API spec to match the new manual TCs
@api-automation-test-generator TCA-456 force
```

**What `force` resets per agent:**
- `@manual-test-generator force` resets: `fetch-ticket`, `analyze-code`, `create-manual-test-cases`, `post-tests-to-jira`
- `@api-automation-test-generator force` resets: `create-api-automated-test-cases`, `validate-api-spec`, `run-api-tests`
- `@ui-automation-test-generator force` resets: `create-ui-automated-test-cases`, `validate-ui-spec`, `run-ui-tests`
- `@postman-collection-generator force` resets: `generate-postman-collection`

**Note:** Force is scoped. Running `@api-automation-test-generator TCA-456 force` does NOT re-fetch the ticket — it only regenerates the API spec. If you need fresh ticket data too, run `@manual-test-generator TCA-456 force` first.

---

### Scenario 8: Scoping Code Analysis to a Specific PR

A developer opens PR #42 for ticket `TCA-789`. Instead of scanning the entire Whiz and Phizz codebases, you want to analyze only the files changed in that PR.

```bash
# Generate manual TCs based only on PR-changed files
@manual-test-generator TCA-789 pr:42

# Or just run code analysis standalone with PR scope
/analyze-code TCA-789 pr:42
```

**What `pr:42` changes:**
- Instead of grepping both repos by keyword (which may find unrelated files), it calls `gh pr view 42 --json files` and reads only the changed source files (default limit: 10)
- If the PR has more than 10 source files, it lists all files and asks you whether to increase the limit or read all of them — no files are silently skipped
- Produces a more focused `TCA-789-analysis.md` with only the relevant endpoints and comparison table entries
- The rest of the pipeline (manual TCs, automation) uses this narrower analysis

**Note:** Without `pr:<N>`, the command defaults to a full keyword scan across all product repos.

**When to use `pr:<N>`:**
- The ticket touches a small, well-defined area of the codebase
- You want faster analysis (fewer files to read)
- You want to avoid false positives from keyword matching in unrelated code

**When NOT to use `pr:<N>`:**
- The PR is a large refactor touching many files
- You want the agent to find related code that wasn't changed in the PR (e.g., shared utilities)

---

## Two-Backend Architecture (Whiz + Phizz)

This framework tests **two separate backends**. The AI system is aware of both.

|                    | Whiz (Main TCA Platform)            | Phizz (Claims Platform)                  |
|--------------------|-------------------------------------|------------------------------------------|
| **Port**           | `localhost:4000`                    | `localhost:3000`                         |
| **Login command**   | `cy.loginAndGetSessionCookie()`     | `cy.loginAndGetPhizzSessionCookie()`     |
| **Session alias**   | `@sessionCookie` + `@csrfToken`     | `@phizzSessionCookie`                    |
| **Base URL**        | `baseUrl` (from cypress.config.js)  | `Cypress.env("PHIZZ_BASE_URL")`         |
| **DB task**         | `cy.task("queryDb", ...)`           | `cy.task("queryPhizzDb", ...)`           |
| **Swagger spec**    | `cypress/fixtures/swagger.json`     | `cypress/fixtures/phizz-swagger.json`    |
| **Test folder**     | `cypress/e2e/API/<module>-module/`  | `cypress/e2e/API/phizz-module/<feature>/`|
| **Env var prefix**  | none (`LOGIN_EMAIL`, `DB_HOST`)     | `PHIZZ_` (`PHIZZ_BASE_URL`, `PHIZZ_DB_HOST`) |

### How the AI Detects Which Backend

- **By test file location:** Files under `phizz-module/` -> Phizz; everything else -> Whiz
- **By curl cookie:** `_phizzsession` cookie -> Phizz; `_whizsession` -> Whiz
- **By port in URL:** `:3000` -> Phizz; `:4000` -> Whiz
- **By swagger:** The skills read both swagger files and report coverage separately

### Phizz-Specific Examples

```bash
# Generate tests for a phizz endpoint
/generate-api-test
Write tests for GET /api/automotive_claims on port 3000

# Audit phizz coverage
/audit-coverage
# Output will show separate sections for Whiz and Phizz coverage

# Fix a failing phizz test
/fix-test
# The skill detects phizz-module/ in the file path and uses phizz-swagger.json
```

---

## Configuration Reference

### Project Config

All agents and commands read `.claude/project-config.json` for paths, auth, and settings. **Local overrides** are read from `.claude/project-config.local.json` (gitignored) — local values take precedence over base config.

**Setup for new developers:**
```bash
cp .claude/project-config.local.example.json .claude/project-config.local.json
# Edit .claude/project-config.local.json with your local repo paths
```

| Config Key | Value | Used By |
|---|---|---|
| `paths.apiTests` | `cypress/e2e/API` | Where API specs are created |
| `paths.uiTests` | `cypress/e2e/UI` | Where UI specs are created |
| `paths.pages` | `cypress/e2e/pages` | Page Object files |
| `paths.fixtures` | `cypress/fixtures` | Test data and schemas |
| `paths.swaggerWhiz` | `cypress/fixtures/swagger.json` | Whiz API spec |
| `paths.swaggerPhizz` | `cypress/fixtures/phizz-swagger.json` | Phizz API spec |
| `auth.whiz.loginCommand` | `cy.loginAndGetSessionCookie()` | Whiz auth in generated tests |
| `auth.phizz.loginCommand` | `cy.loginAndGetPhizzSessionCookie()` | Phizz auth in generated tests |
| `testLimits.bugMaxTests` | `2` | Max automated tests for bug tickets |
| `testLimits.storyMaxTests` | `8` | Target automated tests per SPEC FILE for story tickets (multi-layer tickets get multiple spec files) |
| `productCode.rootPaths` | `[]` (set in local config) | Paths to Whiz/Phizz source repos for code analysis |
| `jira.cloudId` | `technine.atlassian.net` | Jira site (auto-resolved to UUID at runtime) |

### Test Tags

| Tag | When to Use | Run Command |
|---|---|---|
| `@PR` | Must pass before PR merge (happy path) | `npm run cy:pr` |
| `@Smoke` | Post-deployment sanity check | `npm run cy:smoke` |
| `@Regression` | Full coverage (negatives, edge cases, auth) | `npm run cy:regression` |

### File Naming Conventions

**API tests:** `[NN]-[http-method]-[resource-description].cy.js`
```
01-get-contracts-list.cy.js
03-post-create-contract.cy.js
04-put-cancel-contract.cy.js
```

**UI tests:** `[NN]-[action-description].cy.js`
```
01-login.cy.js
02-create-new-store.cy.js
03-view-contract-details.cy.js
```

**Ticket-branch UI tests:** when the current git branch contains a Jira ticket ID (e.g. `TS-17487_Tax_Overrides`), the spec goes to `cypress/e2e/JiraTicket/TS_<NUMBER>_<FeatureDescription>.cy.js` instead:
```
TS_17487_OverrideDMSTaxCancellation.cy.js
TS_14407_EnableCancelButton.cy.js
```

### Pipeline State

Each ticket's pipeline progress is tracked in `docs/.ticket-context/TKT-123-pipeline-state.json`. This prevents re-running completed steps.

**Shape of the file:**

```json
{
  "ticketId": "TKT-123",
  "steps": {
    "fetch-ticket": "done",
    "analyze-code": "done",
    "create-manual-test-cases": "done",
    "post-tests-to-jira": "done",
    "create-api-automated-test-cases": "pending",
    "create-schema-validation": "pending",
    "validate-api-spec": "pending",
    "run-api-tests": "pending"
  },
  "lastUpdated": "2026-06-17T10:30:00.000Z"
}
```

**Values:** `"pending"` (not started), `"done"` (completed), `"partial"` (partially completed — e.g., some Jira links failed), `"skipped"` (user chose to skip).

All agents share this ONE file per ticket. Each agent reads/writes only its own step keys and preserves other agents' keys.

**To force a re-run,** use the `force` flag:

```
@manual-test-generator TKT-123 force
```

Or manually delete the state file to reset everything:

```bash
rm docs/.ticket-context/TKT-123-pipeline-state.json
```

---

## Sample Output Files

These examples show what the generated files actually look like, so you know what to expect.

### Sample: TKT-123-analysis.md (Code Analysis)

```markdown
# Code Analysis: TCA-456 - Add ability to manually expire maintenance contracts

## Affected API Endpoints

| Method | Endpoint | Source File |
|---|---|---|
| PUT | /api/contracts/:id/expire | whiz/controllers/contracts.go:245 |
| GET | /api/contracts | whiz/controllers/contracts.go:38 |
| GET | /api/contracts/:id | whiz/controllers/contracts.go:95 |

## Database Tables

| Table | Relevant Columns |
|---|---|
| contracts | id, status, expire_date, expired_by, expire_reason |
| contract_status_history | contract_id, from_status, to_status, changed_at |

## Available Cypress Test Infrastructure

- **DB Task:** cy.task("queryDb", { sql: "SELECT * FROM contracts WHERE id = $1", params: [contractId] }) — plain-string SQL also accepted; prefer { sql, params } whenever a value is interpolated
- **Login Command:** cy.loginAndGetSessionCookie()
- **Existing Specs:** cypress/e2e/API/contracts-module/ (4 files)
- **Page Objects:** cypress/e2e/pages/ContractsPage.js

## Requirements vs Code Comparison

| # | Requirement (from Jira) | Code Status | Details |
|---|---|---|---|
| 1 | PUT /expire sets status to "Manually Expired" | ✅ Implemented | contracts.go:260 sets status |
| 2 | Only "Active" contracts can be expired | ✅ Implemented | contracts.go:250 checks status |
| 3 | Expire button disabled for non-Asbury stores | ⚠️ Partial | Controller has no store check |
| 4 | Activity log records the expiration | ❌ Not implemented | No audit trail code found |
| 5 | Contract list filters by expired status | 🔍 Undocumented | Filter exists but not in ticket |
```

### Sample: TKT-123.md (Manual Test Cases)

```markdown
# Test Cases: TCA-456 - Add ability to manually expire maintenance contracts

## Ticket Summary
Story to add a "Manually Expire" action for active maintenance contracts.

## Module / Feature
contracts-module

## Preconditions
- User is logged in with valid credentials
- At least one active maintenance contract exists in the system

## Test Cases

### Contract Expiration API

- **Type:** API
1. Verify that PUT /api/contracts/:id/expire returns 200 and sets status to "Manually Expired"
2. Verify that PUT /api/contracts/:id/expire returns 400 when contract is already expired
3. Verify that PUT /api/contracts/:id/expire returns 404 for non-existent contract ID
4. Verify that PUT /api/contracts/:id/expire returns 401 without authentication

### Contract Expiration UI

- **Type:** UI
5. Verify that the Expire button appears on active contract detail page
6. Verify that clicking Expire shows a confirmation dialog with reason field
7. Verify that the Expire button is disabled for already-expired contracts

### Data Persistence

- **Type:** Mixed
8. Verify that after expiring a contract, refreshing the page still shows "Manually Expired"
9. Verify that contract_status_history table has a new row after expiration
```

### Sample: TKT-123-test-keys.json (Jira Issue Ledger)

```json
{
  "parentTicket": "TCA-456",
  "tests": [
    { "number": 1, "jiraKey": "TCA-501", "summary": "Verify that PUT /api/contracts/:id/expire returns 200...", "type": "API", "linked": true },
    { "number": 2, "jiraKey": "TCA-502", "summary": "Verify that PUT /api/contracts/:id/expire returns 400...", "type": "API", "linked": true },
    { "number": 3, "jiraKey": "TCA-503", "summary": "Verify that PUT /api/contracts/:id/expire returns 404...", "type": "API", "linked": true }
  ],
  "linkFailures": []
}
```

---

## Troubleshooting

### "Manual test cases for TKT-123 do not exist"

The automation agents require manual test cases. Run the manual generator first:
```
@manual-test-generator TKT-123
```

### "Pipeline step already done -- skipping"

The pipeline state file remembers completed steps. To re-run, use the `force` flag:
```
@manual-test-generator TKT-123 force
@api-automation-test-generator TKT-123 force
```

Or manually delete the state file:
```bash
rm docs/.ticket-context/TKT-123-pipeline-state.json
```

### Agent vs Skill confusion

| If you typed... | It's a... | Needs Jira? |
|---|---|---|
| `@manual-test-generator TKT-123` | Agent | Yes |
| `/generate-api-test` | Skill | No |
| `/create-api-automated-test-cases TKT-123` | Command | Yes (needs ticket context) |

### "Which swagger is it reading?"

- Skills read both `cypress/fixtures/swagger.json` (Whiz) and `cypress/fixtures/phizz-swagger.json` (Phizz)
- They detect which one to use based on the test file location or endpoint URL

### Running in different environments

```bash
# Local (default)
/run-tests TKT-123 api headless local

# Staging
/run-tests TKT-123 api headless staging

# UAT
/run-tests TKT-123 api headless uat
```

### What gets committed to git?

- `/qa` makes atomic commits for each fix: `fix(qa): <file>:TC-NN -- <root cause>`
- All other skills/commands create or edit files but **do not commit** -- you review and commit yourself
- Agents create spec files but do not commit them
