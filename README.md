# QA AI Agents Trio

A shareable **Claude Code setup for QA automation** — AI agents, slash commands, and skills that generate manual test cases from Jira tickets, write API/UI automation (Cypress), build Postman collections, and run + fix + report on test suites.

This repo is an extraction of the `.claude` setup from a production Cypress regression suite, genericized so any team can copy it into their own test repo and start using it.

## What's inside

```
.claude/
  agents/                          # 4 agent orchestrators
    manual-test-generator.md         # Jira ticket -> manual test cases (run this FIRST)
    api-automation-test-generator.md # manual cases -> Cypress API specs
    ui-automation-test-generator.md  # manual cases -> Cypress UI specs (explores the live app)
    postman-collection-generator.md  # manual cases -> Postman collection
  commands/                        # reusable pipeline steps (/fetch-ticket, /analyze-code,
                                   #   /explore-live-app, /validate-spec, /run-tests,
                                   #   /post-tests-to-jira, /pr, ...) plus /qa-init —
                                   #   interactive first-time project scaffolding
  templates/                       # per-framework fact sheets (cypress-javascript.md,
                                   #   playwright-javascript.md) the generators follow
  skills/                          # local skills, no Jira needed:
                                   #   /qa, /qa-only, /fix-test, /generate-api-test,
                                   #   /generate-ui-test, /add-test-cases, /audit-coverage, /doctor
  project-config.json              # ALL project-specific values live here — the one file you MUST edit
  project-config.local.example.json# per-developer overrides (copy to project-config.local.json, git-ignored)
  settings.json                    # permissions, deny rules, and safety hooks

CLAUDE.md                # example project memory template with placeholders — adapt to your repo
HOW-TO-ADAPT.md          # step-by-step guide to adapting this framework to YOUR project — start here
AI-AUTOMATION-GUIDE.md   # full reference for the agent pipeline and commands
```

## Getting started (for a new team)

**Just want to see it work?** Run `/qa-init demo` in a scratch repo — it sets up a sandbox against a public API (no backend, no Jira, no credentials) with a pre-seeded demo ticket, so you can watch the full pipeline run in ~10 minutes.

**Starting from scratch (no test suite yet)?** Copy the `.claude/` folder into an empty repo and run `/qa-init` — it interviews you (Cypress+JavaScript or Playwright+JavaScript, one or two backends, DB, Jira), scaffolds the full folder structure and config files, and writes all the paths/run-commands into `.claude/project-config.json` automatically. Then skip to step 5.

**Lost at any point?** Run `/qa-help` — it inspects your actual setup state (config, scaffold, env file, MCP connections, per-ticket pipeline progress) and prints a personalized "here's your next step" checklist.

**Adapted or upgraded the framework?** Run `/qa-selftest` — a regression suite for the `.claude/` folder itself. It checks static integrity (config, cross-references, state contracts), round-trips the validate-spec hard gates against bundled good/bad fixture specs, exercises the atomic-write/locking mechanics, and can dry-run the full generation pipeline offline against a bundled fake ticket (`SELFTEST-1`) — no Jira, no backend needed.

**Adapting an existing test suite:**

1. **Copy the `.claude/` folder** into the root of your test automation repo (or fork this repo as your starting point).
2. **Read [HOW-TO-ADAPT.md](HOW-TO-ADAPT.md)** and edit `.claude/project-config.json` — Jira cloud ID, test framework paths, auth commands, run commands, etc. This is the only file that *must* change. (`/qa-init` can do this for you too — it detects an existing suite and offers a "sync config only" mode that derives the paths from your real layout.)
3. **Review `.claude/settings.json`** — the `deny` rules and `additionalDirectories` contain placeholder paths; replace them with paths to *your* product-code repos (or remove them).
4. **Adapt `CLAUDE.md`** to describe your own repo (the included one is a template — fill in the `<placeholders>`).
5. **Connect MCP servers** in Claude Code:
   - **Atlassian MCP** — required for the Jira agent pipeline (`@manual-test-generator` etc.).
   - **Browser MCP (`claude-in-chrome`)** — required by `@ui-automation-test-generator` / `/explore-live-app`.
6. Run the pipeline: `@manual-test-generator <TICKET-ID>` first, then the API/UI/Postman generators (they depend on manual test cases existing on the ticket).

## CI

Copy `ci/qa-pr-gate.example.yml` to `.github/workflows/` in your QA repo for a ready-made PR gate (runs the `@PR`-tagged tests, uploads the report). For unattended agent runs, every agent accepts `auto` (non-interactive — no prompts; Jira posting skipped, drafts saved locally) and `auto-post` (with `auto`: allow the Jira writes).

## Notes

- `.claude/project-config.local.json` is git-ignored by design — machine-local paths and overrides go there, never in the shared config.
- No credentials live anywhere in this repo; tests read them from your project's git-ignored env file (e.g. `cypress.env.json`).
- Two frameworks are supported out of the box, selected at `/qa-init` time or via `project.testFramework`: **Cypress + JavaScript** and **Playwright + JavaScript**. The generation/validation commands read the matching fact sheet in `.claude/templates/` for syntax, globs, and report parsing. Cypress is the most battle-tested path; other frameworks can be added by writing a new template file.

## Questions

Maintained by Nitin Pathak (nitin.pathak@tech9.com).
