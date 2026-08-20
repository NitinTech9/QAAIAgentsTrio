#!/usr/bin/env node
"use strict";
// Gate test harness. Corpus: the selftest fixtures (encode expected pass/fail),
// plus inline mini-fixtures for cases the corpus does not cover.

const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT, "scripts/gates/index.js");
const GOOD = path.join(ROOT, ".claude/selftest/specs/good-api-spec.cy.js.fixture");
const BAD = path.join(ROOT, ".claude/selftest/specs/bad-api-spec.cy.js.fixture");

let failures = 0;
function check(label, ok, detail) {
    console.log((ok ? "PASS" : "FAIL") + "  " + label + (ok || !detail ? "" : " — " + detail));
    if (!ok) failures++;
}
function runCli(args, cwd) {
    return spawnSync(process.execPath, [CLI].concat(args), { encoding: "utf8", cwd: cwd || ROOT });
}

// A compliant unauthenticated-rejection test, appended to minis that are not
// themselves exercising the access-control gate.
const UNAUTH = `\nit("[T-1] Test Case 99: unauth returns 401/403", { tags: ["@Regression"] }, () => { cy.clearCookies(); cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.be.oneOf([401, 403]); }); });\n`;

// 1. CLI end-to-end on the corpus
const good = runCli([GOOD]);
check("good fixture exits 0", good.status === 0, "exit " + good.status + "\n" + good.stdout);
const bad = runCli([BAD]);
check("bad fixture exits 1", bad.status === 1, "exit " + bad.status);
for (const gate of ["no-5xx", "no-ambiguous", "db-assertion", "ticket-id", "tags-present", "access-control"])
    check(`bad fixture names [${gate}]`, bad.stdout.includes(`[${gate}]`), bad.stdout);
for (const gate of ["syntax", "fail-on-status", "no-credentials"])
    check(`bad fixture does NOT flag [${gate}]`, !bad.stdout.includes(`[${gate}]`), bad.stdout);
const badJson = runCli([BAD, "--json"]);
check("--json parses and lists violations", (() => { try { return JSON.parse(badJson.stdout).violations.length >= 5; } catch (e) { return false; } })());

// 2. Per-gate cases the corpus does not cover
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qa-gates-"));
function tmpSpec(name, content) { const p = path.join(tmp, name); fs.writeFileSync(p, content); return p; }

const noFos = tmpSpec("no-fos.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ method: "GET", url: "/x" }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
check("fail-on-status flags cy.api without failOnStatusCode", runCli([noFos]).stdout.includes("[fail-on-status]"));

const badSyntax = tmpSpec("broken.cy.js", "it(((");
check("syntax flags unparseable file", runCli([badSyntax]).stdout.includes("[syntax]"));

const hatch = tmpSpec("hatch.cy.js", `it("[T-1] TC", { tags: ["@Regression"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.be.oneOf([200, 404]); // status-ambiguous: state-dependent flow\n }); });` + UNAUTH);
check("no-ambiguous honors // status-ambiguous escape hatch", runCli([hatch]).status === 0, runCli([hatch]).stdout);

// db-assertion honors dbVerification:false via project config
const proj = fs.mkdtempSync(path.join(os.tmpdir(), "qa-gates-proj-"));
fs.mkdirSync(path.join(proj, ".claude"));
fs.writeFileSync(path.join(proj, ".claude/project-config.json"), JSON.stringify({ project: { dbVerification: false } }));
const mut = tmpSpec("mut.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ method: "POST", url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(201); }); });` + UNAUTH);
const skipped = runCli([mut], proj);
check("db-assertion skips (with note) when dbVerification=false", skipped.status === 0 && /db-assertion skipped/.test(skipped.stdout), skipped.stdout);
const enforced = runCli([mut], ROOT);
check("db-assertion enforced when dbVerification=true", enforced.status === 1 && enforced.stdout.includes("[db-assertion]"), enforced.stdout);

// 3. access-control (Check 5) — both directions
const fakeUnauth = tmpSpec("fake-unauth.cy.js", `it("[T-1] TC: unauth", { tags: ["@Regression"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.be.oneOf([401, 403]); }); });`);
const fu = runCli([fakeUnauth]);
check("access-control flags 401/403 test WITHOUT cy.clearCookies (fake unauth)", fu.stdout.includes("[access-control]") && /clearCookies/.test(fu.stdout), fu.stdout);
check("access-control passes good fixture (clearCookies + oneOf([401,403]))", !good.stdout.includes("[access-control]"));
const uiFail = tmpSpec("ui-fail.cy.js", `it("[T-1] TC: page loads", { tags: ["@PR"] }, () => { cy.visit("/orders"); cy.get("#list").should("be.visible"); });`);
check("access-control flags UI spec with no login-redirect test", runCli([uiFail]).stdout.includes("[access-control]"));
const uiPass = tmpSpec("ui-pass.cy.js", `it("[T-1] TC: unauth redirects", { tags: ["@Regression"] }, () => { cy.clearCookies(); cy.visit("/orders"); cy.url().should("include", "/login"); });`);
const up = runCli([uiPass]);
check("access-control passes UI spec asserting redirect to /login", up.status === 0, up.stdout);

// 4. no-credentials (Check 7) — both directions
const creds = tmpSpec("creds.cy.js", `const password = "hunter2secret";\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "postgres://qa:hunter2@db/x", failOnStatusCode: false }); });` + UNAUTH);
const cr = runCli([creds]);
check("no-credentials flags literal password + credentialed URI", cr.stdout.includes("[no-credentials]") && (cr.stdout.match(/\[no-credentials\]/g) || []).length >= 2, cr.stdout);
const envOk = tmpSpec("env-ok.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/login", body: { email: Cypress.env("LOGIN_EMAIL"), password: Cypress.env("LOGIN_PASSWORD") }, failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
const eo = runCli([envOk]);
check("no-credentials does NOT flag Cypress.env(...) reads (the correct pattern)", !eo.stdout.includes("[no-credentials]"), eo.stdout);

console.log(failures ? `\n${failures} assertion(s) FAILED` : "\nall gate assertions passed");
process.exit(failures ? 1 : 0);
