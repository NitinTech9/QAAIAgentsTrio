# Setting up the QA AI Agents — the everything-spelled-out guide

This guide assumes **nothing**. If you have never used a terminal, never installed a developer
tool, and the word "repository" makes you nervous — this page is for you. Every step tells you
exactly what to type, exactly what you should see, and what to do if you don't see it.

**What you will have at the end:** an AI assistant that reads a ticket (from Jira, GitHub, or a
plain text file), writes test cases for it, turns them into automated tests, runs them, and
reports the results — while safety guards stop it from touching production, secrets, or anything
outside your project.

**Time needed:** about 20 minutes for the practice run (Part 2), about an hour for the real
setup (Part 3) — plus one 10-minute favor from a developer, clearly marked below.

---

## The five words you need

| Word | What it means here |
|---|---|
| **Terminal** | A window where you type commands instead of clicking. On a Mac: press `Cmd+Space`, type `Terminal`, press Enter. On Windows: press the Windows key, type `PowerShell`, press Enter. |
| **Command** | A line of text you type into the terminal and run by pressing **Enter**. In this guide, anything in a grey box is a command — copy it exactly, paste it in, press Enter. |
| **Repository (repo)** | A project folder tracked by a tool called git. Your team's code lives in one; your tests will live in another. |
| **Claude Code** | The AI coding assistant this framework runs inside. You type instructions to it in plain English (or use its `/commands`). |
| **Slash command** | An instruction that starts with `/`, like `/doctor`. You type it into Claude Code (not the plain terminal) and press Enter. |

One more convention: when a step says **"You should see…"**, check it before moving on. If you see
something different, jump to [When something goes wrong](#when-something-goes-wrong) — don't push
through errors.

---

## Part 1 — Install the three tools (one time only, ~15 minutes)

### Step 1.1 — Node.js (the engine that runs the tests)

1. Go to <https://nodejs.org> in your browser.
2. Download the button marked **LTS** (the stable one), open the downloaded file, and click
   through the installer accepting the defaults.
3. **Check it worked:** open a *new* terminal window and type:

   ```
   node --version
   ```

   **You should see** a version number starting with `v20` or higher (e.g. `v20.11.0`).
   If it says "command not found", close ALL terminal windows, open a fresh one, and try again —
   the installer only takes effect in new windows.

### Step 1.2 — Git (the tool that downloads and tracks project folders)

- **Mac:** in the terminal, type `git --version` and press Enter. If a popup offers to install
  "command line developer tools", click **Install** and wait. Then run `git --version` again.
- **Windows:** download it from <https://git-scm.com/download/win>, run the installer, accept
  every default.

**Check it worked:** `git --version` prints something like `git version 2.44.0`.

### Step 1.3 — Claude Code (the AI assistant itself)

Follow the official instructions at <https://claude.com/claude-code> — either the **VS Code
extension** (easiest if your team uses VS Code: install VS Code, then the "Claude Code" extension
from its marketplace) or the terminal version:

```
npm install -g @anthropic-ai/claude-code
```

Then sign in: run `claude` in the terminal (or open the extension panel) and follow the login
prompts with your Claude account.

**Check it worked:** you can type a message to Claude and it answers.

---

## Part 2 — The practice run (do this first — no passwords, no real project, ~20 min)

Before touching anything real, prove the whole machine works using a built-in sandbox that tests a
harmless public demo API. Nothing you do here can affect your company's systems.

### Step 2.1 — Download this framework

```
git clone https://github.com/NitinTech9/QAAIAgentsTrio.git
```

**You should see** lines ending in `done.` — and a new folder named `QAAIAgentsTrio` in your home
directory.

### Step 2.2 — Make a practice folder and install the framework into it

```
mkdir qa-practice
cd QAAIAgentsTrio
./install.sh --target ../qa-practice
```

**You should see** a list of files being installed and no red errors. (Windows/PowerShell note:
run the installer from "Git Bash", which came with git — right-click in the folder → "Git Bash
Here" — because `install.sh` is a Mac/Linux-style script.)

The installer is deliberately gentle: it never overwrites your files, and running it twice is
safe.

### Step 2.3 — Start Claude Code inside the practice folder

```
cd ../qa-practice
claude
```

(Or open the `qa-practice` folder in VS Code and open the Claude Code panel.)

### Step 2.4 — Run the demo

Type this to Claude and press Enter:

```
/qa-init demo
```

It will show you a plan and ask once for approval — say yes. It then builds a tiny test project
pointed at a public practice API, complete with a fake ticket called `DEMO-1`. When it finishes it
prints "Try the framework" suggestions. Try this one:

```
@api-automation-test-generator DEMO-1 auto
```

**You should see** the full pipeline run: reading the ticket, generating test cases, writing a
test file, checking it against the quality gates, and running it. That is the entire product in
miniature. When you're done exploring, you can delete the `qa-practice` folder — nothing else was
touched.

---

## Part 3 — Set it up on your real project (~1 hour)

### Step 3.1 — Get (or create) your test repository

Tests live in their own folder, **separate from your application's code**. If your team already
has a test repo, `git clone` it (ask a teammate for the exact clone command). If not, make one:

```
mkdir my-product-qa
```

### Step 3.2 — Install the framework into it

From the `QAAIAgentsTrio` folder you downloaded in Part 2:

```
./install.sh --target /path/to/my-product-qa
```

(Replace the path with your real folder. Tip: type `./install.sh --target ` and then drag the
folder from Finder/Explorer into the terminal — it pastes the path for you.)

### Step 3.3 — Answer the setup interview

Open Claude Code inside your test folder and run:

```
/qa-init
```

It asks a handful of questions. What they mean, and what to answer if unsure:

| Question | If unsure, answer |
|---|---|
| Cypress or Playwright? | **Cypress** — it's the battle-tested path (Playwright support is experimental). |
| One backend or two? | **One**, unless your team tests two separate server applications. |
| Primary base URL | The address your app runs at on a work machine, usually `http://localhost:` + a port number. **Ask a developer** if you don't know it. |
| Database verification? | **PostgreSQL** if your app uses Postgres and you can get read access; otherwise **None** (tests still work, with one class of checks disabled). |
| Tracker / Jira cloud ID | Your Jira address, like `your-company.atlassian.net` — or **skip for now** (you can run everything from local markdown tickets first). |
| Project name / backend stack | Your product's name; for stack, pick your backend framework from the list or skip. |

It shows a plan, asks once, then scaffolds everything and runs a quick sanity check.

### Step 3.4 — Fill in the credentials file

The framework created a file called `cypress.env.example.json`. Copy it:

```
cp cypress.env.example.json cypress.env.json
```

Open `cypress.env.json` in any editor and replace the placeholder values. **Ask a developer or
your team lead for these** — they are the same credentials a human tester would use:

| Key | What it is |
|---|---|
| `LOGIN_EMAIL` / `LOGIN_PASSWORD` | A **test account** for your app (never a real customer, never your personal admin login) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Database connection details (only if you chose PostgreSQL above) |

This file stays on your machine only — it is git-ignored and the AI itself is blocked from reading
or editing it (that's one of the safety guards, working as intended).

### Step 3.5 — 🧑‍💻 The one step that genuinely needs a developer (~10 min of their time)

Every generated test logs into your app through one function, and it must match how *your* app
actually signs in. Send a developer this message:

> "Could you spend 10 minutes implementing the login command in our QA repo? It's the function
> marked TODO in `cypress/support/commands.js` (`loginAndGetSessionCookie`). It needs to POST to
> our real login endpoint with `Cypress.env("LOGIN_EMAIL")`/`("LOGIN_PASSWORD")` and expose the
> session cookie (and CSRF token if we use one) as the `@sessionCookie`/`@csrfToken` aliases.
> Nothing else in the setup needs code."

Until this is done, generated tests will be *written* correctly but will fail at the login step —
so it's fine to continue with the steps below in parallel.

### Step 3.6 — Turn on the commit safety gate (one command)

```
npm run hooks:install
```

This makes the quality gates check every test before it can be committed — the same nine checks
the AI applies to itself. One-time per machine.

### Step 3.7 — Connect Jira (only if you use it)

In Claude Code type `/mcp` and follow the prompts to connect the **Atlassian** integration (or, on
claude.ai, enable the Atlassian connector in Settings → Connectors). Skip entirely if you chose
"skip for now" in Step 3.3 — local markdown tickets work without any connection. UI test
generation additionally needs the `claude-in-chrome` browser integration; set that up later, when
you first want browser tests.

### Step 3.8 — The health check

```
/doctor
```

**You should see** a checklist with ✓ marks. Every ✗ line comes with the exact command that fixes
it. Two ✗ marks are expected until their steps are done: the login TODO (Step 3.5) and, if you
skipped it, the tracker connection (Step 3.7).

Lost at any point, now or in a month? This is the magic command:

```
/qa-help
```

It looks at your actual setup and tells you, personally, what your next step is.

---

## Part 4 — Your first real ticket

Always in this order — automation refuses to run without reviewed manual cases (that's
deliberate):

```
@manual-test-generator PROJ-123        ← replace with a real ticket ID
```

It reads the ticket and its comments, studies the code, and writes plain-English test cases —
then **stops and shows you the list**. This pause is your moment: remove, edit, or add cases in
plain English ("remove case 4", "add a case for expired accounts"). Nothing is posted to Jira
until you approve.

Then either or both (they can run at the same time):

```
@api-automation-test-generator PROJ-123      ← turns the API cases into runnable tests
@ui-automation-test-generator PROJ-123      ← same for browser tests (needs the app running
                                               and the browser integration from Step 3.7)
```

Each one generates the tests, checks them against the quality gates, runs them, and reports —
asking you before anything is executed or posted.

---

## When something goes wrong

| You see | It means | Do this |
|---|---|---|
| `command not found` | The tool isn't installed, or the terminal window is older than the install | Redo the install step, then open a **new** terminal window |
| `permission denied` running `install.sh` | The script isn't marked executable | Run `chmod +x install.sh` once, then retry |
| A red ✗ in `/doctor` | Something in your environment isn't ready | Do exactly what the line says — each ✗ names its own fix |
| `backend not running` / `ECONNREFUSED` | Your application isn't started on your machine | Ask a developer how your team starts the app locally — the framework can't test an app that isn't running |
| The AI says a hook **BLOCKED** something | A safety guard did its job | This is normal and good. Read the message; if the block is wrong for your team, the message names the config key that adjusts it |
| Anything else confusing | — | Type `/qa-help` and do what it says; if still stuck, paste the error to a developer along with a link to this file |

**A note on safety, since you may be asked:** this framework cannot touch production (blocked at
the tool level, not by trust), cannot read or write credential files, cannot change your
application's source code, and never posts to your tracker without showing you first. The guards
are small scripts your developers can read in `.claude/hooks/`, and the framework's own test suite
(`/qa-selftest`) fails if any of them stops working.
