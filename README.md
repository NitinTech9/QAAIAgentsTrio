# QA AI Agents Trio

A shareable **Claude Code setup for QA automation** — AI agents, slash commands, and skills that generate manual test cases from Jira tickets, write API/UI automation (Cypress), build Postman collections, and run + fix + report on test suites.

This repo is an extraction of the `.claude` setup from the TCA regression suite so any team in the company can copy it into their own test repo and start using it.

## What's inside

```
.claude/
  agents/                          # 4 agent orchestrators
    manual-test-generator.md         # Jira ticket -> manual test cases (run this FIRST)
    api-automation-test-generator.md # manual cases -> Cypress API specs
    ui-automation-test-generator.md  # manual cases -> Cypress UI specs (explores the live app)
    postman-collection-generator.md  # manual cases -> Postman collection
  commands/                        # 16 reusable pipeline steps (/fetch-ticket, /analyze-code,
                                   #   /explore-live-app, /validate-spec, /run-tests,
                                   #   /post-tests-to-jira, /pr, ...)
  skills/                          # local skills, no Jira needed:
                                   #   /qa, /qa-only, /fix-test, /generate-api-test,
                                   #   /generate-ui-test, /add-test-cases, /audit-coverage, /doctor
  project-config.json              # ALL project-specific values live here — the one file you MUST edit
  project-config.local.example.json# per-developer overrides (copy to project-config.local.json, git-ignored)
  settings.json                    # permissions, deny rules, and safety hooks

CLAUDE.md                # example project memory file from the TCA suite — adapt to your repo
HOW-TO-ADAPT.md          # step-by-step guide to adapting this framework to YOUR project — start here
AI-AUTOMATION-GUIDE.md   # full reference for the agent pipeline and commands
```

## Getting started (for a new team)

1. **Copy the `.claude/` folder** into the root of your test automation repo (or fork this repo as your starting point).
2. **Read [HOW-TO-ADAPT.md](HOW-TO-ADAPT.md)** and edit `.claude/project-config.json` — Jira cloud ID, test framework paths, auth commands, run commands, etc. This is the only file that *must* change.
3. **Review `.claude/settings.json`** — the `deny` rules and `additionalDirectories` contain absolute paths from the original author's machine; replace them with paths to *your* product-code repos (or remove them).
4. **Adapt `CLAUDE.md`** to describe your own repo (the included one documents the TCA suite and is provided as a working example).
5. **Connect MCP servers** in Claude Code:
   - **Atlassian MCP** — required for the Jira agent pipeline (`@manual-test-generator` etc.).
   - **Browser MCP (`claude-in-chrome`)** — required by `@ui-automation-test-generator` / `/explore-live-app`.
6. Run the pipeline: `@manual-test-generator <TICKET-ID>` first, then the API/UI/Postman generators (they depend on manual test cases existing on the ticket).

## Notes

- `.claude/project-config.local.json` is git-ignored by design — machine-local paths and overrides go there, never in the shared config.
- No credentials live anywhere in this repo; tests read them from your project's git-ignored env file (e.g. `cypress.env.json`).
- The setup was built around Cypress, but the agents/commands read paths and run commands from `project-config.json`, so other frameworks can be wired in.

## Questions

Maintained by Nitin Pathak (nitin.pathak@tech9.com).
