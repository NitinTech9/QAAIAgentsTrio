# Create UI Automated Test Cases

You are given a Jira ticket ID: **$ARGUMENTS**

Let `TICKET_ID` = the first token of `$ARGUMENTS`.

**If `TICKET_ID` does not match `[A-Z]+-[0-9]+`, stop immediately and tell the user:**
> "A Jira ticket ID is required. Usage: `/create-ui-automated-test-cases <TICKET-ID>`"
**Do not proceed.**

## Setup: Read Project Config

Read `.claude/project-config.json` and extract all values. Then read `.claude/project-config.local.json` if it exists — merge its values over the base config (local takes precedence).

**Framework template:** read `.claude/templates/{config.testFramework}-javascript.md` and follow its spec skeleton, assertion style, run/report facts, and validation rules. Inline examples in this file use Cypress syntax — when `config.testFramework` is not `cypress`, translate them per the template file; never emit `cy.*` calls into a non-Cypress suite.

Extract:
- `project.paths.*` — all file paths
- `project.auth.*` — login command and aliases
- `project.testLimits.*` — max tests per issue type

## Check Pipeline State

Read `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json` (canonical shape).
If `steps["create-ui-automated-test-cases"]` is `done`, print: `✔ UI automated test cases already generated — skipping` and exit.

## Hard Gate: Manual Test Cases Must Exist

Check `{config.paths.manualCases}/TICKET_ID.md`.

- **If the file does not exist:** stop and tell the user:
  > "Manual test cases for TICKET_ID do not exist. UI automation requires manual test cases as input.
  > Run `@manual-test-generator TICKET_ID` (or `/create-manual-test-cases TICKET_ID`) first, then re-run this command."
  Do not proceed.

- **If the file exists:** continue.

## Other Prerequisites (self-healing)

Also required:
- `{config.paths.ticketContext}/TICKET_ID.json` — ticket context
- `{config.paths.ticketContext}/TICKET_ID-analysis.md` — code analysis (should include Page Object info)
- `{config.paths.ticketContext}/TICKET_ID-exploration.md` — **live-app exploration notes (authoritative selectors, DOM, async/modal behavior, exact error text, test-data query)**

**Self-healing:** If any are missing, auto-run the prerequisite command instead of stopping:
1. If `TICKET_ID.json` is missing → read and execute `.claude/commands/fetch-ticket.md` with `TICKET_ID`. Announce: `🔄 Missing ticket context — auto-running /fetch-ticket`
2. If `TICKET_ID-analysis.md` is missing → read and execute `.claude/commands/analyze-code.md` with `TICKET_ID`. Announce: `🔄 Missing code analysis — auto-running /analyze-code`
3. If `TICKET_ID-exploration.md` is missing → read and execute `.claude/commands/explore-live-app.md` with `TICKET_ID`. Announce: `🔄 Missing live-app exploration — auto-running /explore-live-app`

Run in order (fetch → analyze → explore).

## Read Context

Read all context files. Sources rank as follows:

- **`TICKET_ID-exploration.md` is the AUTHORITATIVE source for selectors, DOM structure, flow order, async/modal behavior, network calls, and exact assertion strings.** Use the selectors, test-data query, and outcome strings captured there verbatim. **Do NOT invent or infer a selector from source code when exploration captured one** — and do not "improve" an exact error string; use what was observed.
- **Manual test cases** in sections tagged `- **Type:** UI` or `- **Type:** Mixed` — the cases to automate (the Type tag appears once per `###` section; all "Verify that..." lines under it inherit it). **Ignore `- **Type:** API`** sections (handled by `create-api-automated-test-cases`).
- **`TICKET_ID-analysis.md`** — secondary: role-gating, business-logic edge cases, exact backend error strings, and the module/Page-Object map.

If exploration flagged any gap (a case it could not reach/observe), do not fabricate a spec for it — carry the gap into the output warnings.

For Page Objects: use those named in the exploration notes and analysis. If neither lists them, Glob `{config.paths.pages}/**/*.js` for classes relevant to the ticket's module and read them.

## UI Automated Test Limits

Consolidate related manual cases into flowing `it()` blocks — do NOT mechanically create one `it()` per manual test case, but do NOT drop coverage either:

- **Bug tickets** (`issuetype = Bug`): target `{config.testLimits.bugMaxTests}` automated tests
  - Test 1: reproduce the bug in the browser and verify the fix
  - Test 2 (optional): regression flow
- **Story tickets** (`issuetype = Story`): target `{config.testLimits.storyMaxTests}` automated tests **per spec file**. When the manual cases span distinct layers (e.g. element visibility vs calculation results) or distinct screens, create MULTIPLE spec files for the ticket rather than skipping cases — e.g. `<TICKET>_<N>_<Feature>.cy.js` (visibility/interaction), `<TICKET>_<N>_<Feature>Estimates.cy.js` (API-level results), `<TICKET>_<N>_<Feature>EstimatesUI.cy.js` (same results through the screen). Use an existing multi-spec ticket in `{config.paths.jiraTicketTests}` as the reference.

Only skip a manual TC when it is genuinely not automatable in this environment — and then **print a warning** naming it and why.

Each `it()` block should cover a **complete user flow** — navigate → interact → assert on outcome.

## Role-Matrix Coverage (both directions — ONLY when the feature is role-gated)

**Default: the primary user (`LOGIN_EMAIL`) performs all flows.** Most tickets are NOT role-gated — do not add role-based tests or extra users for them.

Apply this section ONLY when the code analysis (`TICKET_ID-analysis.md` → "Role gating") shows the feature is **role-gated** (an element or route visible only to certain roles — e.g. `Roles.UserHasAnyRole`, route `roles={[...]}`). Then cover BOTH directions — a positive-only test can never catch an over-exposure regression:

- **Authorized role sees it** (checkbox/button/route present, interactive)
- **Unauthorized role does NOT** (element absent, or route Forbidden)
- Repeat on **every screen** the element appears on (e.g. both the admin edit view AND the dashboard that surfaces the same field).

Users for every role shape are auto-provisioned by the global `cy.ensureQaUsers()` prerequisite (`cypress/support/e2e.js` → `cypress/tasks/ensureQaUsers.js`): primary (`LOGIN_EMAIL`), a restricted user (`NEGATIVE_LOGIN_EMAIL`), plus whatever role shapes your product defines. All log in with `LOGIN_PASSWORD`. If the ticket needs a role shape that doesn't exist yet, ADD a spec to `userSpecs` in `ensureQaUsers.js` (clone-minus-roles or exact-roles) instead of mutating users inside the test.

## Deterministic Test Data (DB-driven, with fallback)

Never depend on "whatever the page happens to show". Pick data in `before()` with `cy.task("queryDb", ...)` using filters that encode every precondition the flow needs (status, product type, sale type, payment type, store/state, expiration). Two resilience patterns:

1. **Candidate fallback ("use another data")**: select the top 3–5 candidates, then PROBE each via the relevant API (`cy.api` with the session cookie) until one satisfies the test's runtime preconditions (e.g. a cancellable record with a non-zero refund). Log skipped candidates — keep a `pickWorking<Resource>` helper pattern, as in existing JiraTicket specs.
2. **Environment-gated skips**: when behavior depends on an external system (a third-party integration, SSO) or on data that may not exist in every env (special company config), PROBE availability in `before()` and gate with `function () { if (!available) this.skip(); }` (function-style `it`, not arrow). The test then activates automatically on staging/uat. Never write a pass-either-way assertion instead.

## Quality Bar (simple, house-style, must catch bugs)

1. **Every test must be able to fail.** No pass-either-way assertions (no conditional "if present assert X else assert Y" that passes both ways, no `oneOf` mixing success and failure outcomes). If a case can't be asserted decisively in this environment, use an env-gated `this.skip()` with a reason — never a soft assertion.
2. **Assert exact user-visible outcomes**, not just visibility: exact label/tip/error text, computed values proven by arithmetic (e.g. `sales_tax = rate% × customer_refund`), URL/route identity, DB state for mutations (`cy.task("queryDb")`).
3. **Keep it simple.** The only abstractions allowed are Page Objects and a shared journey helper inside the spec. No custom frameworks, no config-driven test factories, no loops generating `it()` blocks. A reviewer must be able to read a test top-to-bottom as a user story.
4. **Match the existing code exactly.** Before writing, read 1–2 recent specs in the target folder and mirror their formatting (4-space indent in JiraTicket specs, expanded multi-line call style, `cy.allureLabel` block, comment tone). New POMs must mirror an existing POM file structure, not the abstract idea of one.
5. **Prefer stable anchors**: use the selectors verified during live exploration (`TICKET_ID-exploration.md`) — ids and label text over positional/nth-child; scope absence-assertions with a stepping stone. Exploration already confirmed these resolve against the real DOM, so do not swap them for guesses.

## UI Interaction Techniques (React app)

- **Controlled inputs that reset state on every keystroke** (react-datepicker fields, tax/amount fields wired to quote-reset handlers): `clear().type()` fires intermediate `onChange(null/partial)` — the app answers with error toasts and re-renders that swallow keystrokes. Set the value in ONE shot: native value setter + `dispatchEvent(new win.Event("input", { bubbles: true }))` — keep the one-shot setter helper in the relevant Page Object.
- **Stepping-stone assertions**: before asserting an element is absent, assert a sibling landmark IS present (e.g. a neighboring field before "checkbox not.exist") so "page never loaded" and "element visibility wrong" fail differently.
- **Known app modals/toasts**: handle conditionally (e.g. a confirmation modal — `#confirm-modal-ok`). Put the handling in the Page Object, not the spec.

## Spec File Placement & Naming

**First check the current git branch** (`git branch --show-current`):

- **If the branch name contains a Jira ticket ID** (`[A-Z]+-[0-9]+`, e.g. `PROJ-17487_Tax_Overrides`): place the spec in the JiraTicket folder, named after the ticket:
  ```
  {config.paths.jiraTicketTests}/<TICKET>_<NUMBER>_<FeatureDescription>.cy.js
  ```
  (underscored ticket ID prefix — match the existing files in that folder.)
- **Otherwise**: do NOT name the spec after a ticket ID. Name it after the **action or feature** in its module folder:
  ```
  {config.paths.uiTests}/<module-name>/[NN]-[action-description].cy.js
  ```

Read `{config.paths.namingConventions}` (if the path is not null and the file exists) for the exact convention.

If a spec file for the same feature already exists, **append new `it()` blocks** — do not create a duplicate.

## Test Names

Put `TICKET_ID` in the `describe`; each `it()` is a plain-English "Verify that …" sentence ending with an area suffix:

```javascript
describe("Test Scenario: TICKET_ID — <Feature Name>", () => {
  it("Verify that <expected behavior> — UI <Area>", { tags: ["@PR", "@Smoke"] }, () => { ... });
});
```

## Page Object Usage Rules

1. **Always use existing Page Objects** — read `{config.paths.pages}/` and use methods/selectors already defined. Do not duplicate selectors inline.
2. **If an existing Page Object covers the page but lacks a method/selector the spec needs**: ADD the missing getters/actions/assertions to that file (house style, selectors from product source) — do not create a parallel POM for the same page.
3. **If a Page Object does not exist** for the page: create one at `{config.paths.pages}/<domain>/<PageName>Page.js` — inside the domain subfolder matching the app area (`auth/`, `store/`, `admin/<area>/`, …), mirroring the existing layout; do NOT create it flat at the `pages/` root. Import it in the spec with the correct relative depth (see skeleton).
4. **Never hardcode selectors in spec files** — all `cy.get()` / `cy.xpath()` calls belong in the Page Object.

## UI Test Template

**Reference implementations — read 1–2 recent specs in `{config.paths.jiraTicketTests}` before writing a spec** (they encode all the patterns above and are the house standard). Look for examples of:
- journey helpers, role matrix across screens, DB-driven data, direct-URL entry for role-blocked flows
- candidate probing/fallback, env-gated skips, computed-value table assertions

Skeleton:

```javascript
// Page Objects live under cypress/e2e/pages/ in DOMAIN SUBFOLDERS (auth/, store/,
// admin/<area>/, …) — not flat. Pick the relative depth by where THIS spec lives:
//   cypress/e2e/JiraTicket/<spec>   → "../pages/<domain>/<Page>"
//   cypress/e2e/UI/<module>/<spec>  → "../../pages/<domain>/<Page>"
import LoginPage from "../pages/auth/LoginPage";
import <ModuleName>Page from "../pages/<domain>/<ModuleName>Page";

// TICKET_ID — <one-paragraph summary of what is covered and any env-gated cases>
describe("Test Scenario: TICKET_ID — <Feature Name>", () => {
    const MAIN_EMAIL = Cypress.env("LOGIN_EMAIL");
    let testData; // picked deterministically in before()

    // Journey helper shared by the tests — login is parameterized so role-matrix
    // tests reuse the same flow with different users.
    const goToFeature = (loginEmail) => {
        LoginPage.login(loginEmail, Cypress.env("LOGIN_PASSWORD"));
        // navigate to the feature via the real UI…
    };

    before(() => {
        cy.task("queryDb", `<precise data pick with every precondition>`).then((rows) => {
            expect(rows, "<clear message naming the missing precondition>").to.have.length(1);
            testData = rows[0];
        });
    });

    it("Verify that <authorized behavior> — UI <Area>", { tags: ["@PR", "@Smoke"] }, () => {
        goToFeature(MAIN_EMAIL);
        <ModuleName>Page.assertFeaturePresent();
    });

    it("Verify that <unauthorized role does not see it> — UI <Area>", { tags: ["@Regression"] }, () => {
        goToFeature(Cypress.env("NEGATIVE_LOGIN_EMAIL") || MAIN_EMAIL.replace("@", "+no-account-rep-ii-manager@"));
        <ModuleName>Page.assertFeatureAbsent(); // stepping-stone inside the POM
    });
});
```

### Page Object Template (create if missing)

Follow the house POM style (mirror an existing Page Object in `{config.paths.pages}`): class on line 1, `// ── Section ──` dividers (`Page Structure`, `Actions`, `Assertions`, `Navigation`), getters returning `cy` chains with explicit timeouts, absence-assertions with a stepping stone, `export default new <ModuleName>Page()`.

```javascript
class <ModuleName>Page {
  // ── Page Structure ──────────────────────────────────────────────────────────────
  getFeatureElement() {
    return cy.get("<selector verified during live exploration>", { timeout: 20000 });
  }

  getSectionLandmark() {
    return cy.contains("label", "<stable label text>", { timeout: 20000 });
  }

  // ── Assertions ──────────────────────────────────────────────────────────────────
  assertFeaturePresent() {
    this.getSectionLandmark().should("be.visible"); // stepping stone
    this.getFeatureElement().should("be.visible");
  }

  assertFeatureAbsent() {
    this.getSectionLandmark().should("be.visible"); // proves the page loaded
    cy.get("<feature selector>").should("not.exist");
  }
}

export default new <ModuleName>Page();
```

### Tags
- `@PR` — happy path flows
- `@Smoke` — key user journey
- `@Regression` — negative flows, access control, edge cases

## Screenshot on Failure

UI tests automatically capture screenshots on failure via Cypress. Confirm `screenshotsFolder` is set in `cypress.config.js`. Do not add manual `cy.screenshot()` calls unless a test needs one mid-flow.

## Update Pipeline State

Merge into `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json`:
- Set `steps["create-ui-automated-test-cases"]` = `"done"`
- Set `lastUpdated` = current ISO timestamp
- Preserve all other `steps` keys

## Output

Print:
- Number of UI automated test cases created
- Spec file path created or modified
- Page Object file path (created or reused)
- Any manual TCs that exceeded the limit and were skipped
- Any notes about missing selectors that need manual filling
