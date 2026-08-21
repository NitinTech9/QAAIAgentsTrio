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
const exOk = tmpSpec("exempt.cy.js", `// access-control-exempt: /api/health is intentionally unauthenticated (public liveness probe)\nit("[T-1] TC: health returns 200", { tags: ["@PR"] }, () => { cy.api({ url: "/api/health", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });`);
const eres = runCli([exOk]);
check("access-control-exempt with a reason passes AND is reported as a note", eres.status === 0 && /access-control exempt/.test(eres.stdout), eres.stdout);
const exBad = tmpSpec("exempt-bad.cy.js", `// access-control-exempt:\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });`);
check("access-control-exempt WITHOUT a reason still flags", runCli([exBad]).stdout.includes("[access-control]"));

// 4. no-credentials (Check 7) — both directions
const creds = tmpSpec("creds.cy.js", `const password = "hunter2secret";\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "postgres://qa:hunter2@db/x", failOnStatusCode: false }); });` + UNAUTH);
const cr = runCli([creds]);
check("no-credentials flags literal password + credentialed URI", cr.stdout.includes("[no-credentials]") && (cr.stdout.match(/\[no-credentials\]/g) || []).length >= 2, cr.stdout);
const envOk = tmpSpec("env-ok.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/login", body: { email: Cypress.env("LOGIN_EMAIL"), password: Cypress.env("LOGIN_PASSWORD") }, failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
const eo = runCli([envOk]);
check("no-credentials does NOT flag Cypress.env(...) reads (the correct pattern)", !eo.stdout.includes("[no-credentials]"), eo.stdout);

// 5. stripComments — direct unit assertions (string-awareness is load-bearing:
//    a naive stripper mangles `https://` URLs and breaks every downstream gate)
const { stripComments } = require(path.join(ROOT, "scripts/gates/lib.js"));
const sc = stripComments;
check("stripComments: https:// URL in string survives unchanged", sc('url: "https://x/y",') === 'url: "https://x/y",');
check("stripComments: // comment becomes spaces, same length & lines", (() => { const r = sc("a; // b\nc;"); return r === "a;     \nc;" && r.length === "a; // b\nc;".length; })());
check("stripComments: /* multi\\nline */ blanks, newlines preserved", (() => { const r = sc("a;/* x\ny */b;"); return r.split("\n").length === 2 && !/x|y/.test(r) && /a;/.test(r) && /b;/.test(r) && r.length === "a;/* x\ny */b;".length; })());
check("stripComments: comment marker inside a string survives", sc('s = "a // b";') === 's = "a // b";');
check("stripComments: template literal with ${} and // survives", sc("t = `tpl ${x} // y`;") === "t = `tpl ${x} // y`;");
check("stripComments: regex literal with escaped slashes survives", sc("r = /regex\\/\\//; f();") === "r = /regex\\/\\//; f();");

// 6. Comment-bypass regression fixtures — both directions per gate
const cmtDb = tmpSpec("cmt-db.cy.js", `// Persistence is proven via cy.task("queryDb", "select 1") in real specs.\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ method: "POST", url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(201); }); });` + UNAUTH);
const cdb = runCli([cmtDb]);
check("db-assertion: queryDb mention ONLY in a comment still flags (bypass dead)", cdb.status === 1 && cdb.stdout.includes("[db-assertion]"), cdb.stdout);

const cmtAc = tmpSpec("cmt-ac.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });\n// it("unauth", () => { cy.clearCookies(); cy.api({ url: "/x" }).then((r) => expect(r.status).to.be.oneOf([401, 403])); });`);
check("access-control: commented-out unauth test still flags", runCli([cmtAc]).stdout.includes("[access-control]"));

const cmt5xx = tmpSpec("cmt-5xx.cy.js", `// never write expect(r.status).to.equal(500) — a 5xx must fail the test\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
check("no-5xx: to.equal(500) quoted in a comment does NOT flag", !runCli([cmt5xx]).stdout.includes("[no-5xx]"), runCli([cmt5xx]).stdout);

const cmtAmb = tmpSpec("cmt-amb.cy.js", `// don't use oneOf([200, 404]) — assert the precise code\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
check("no-ambiguous: oneOf([200,404]) quoted in a comment does NOT flag", !runCli([cmtAmb]).stdout.includes("[no-ambiguous]"), runCli([cmtAmb]).stdout);

const cmtCred = tmpSpec("cmt-cred.cy.js", `// never hardcode credentials like password: "hunter2secret"\nit("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ url: "/x", body: { password: Cypress.env("LOGIN_PASSWORD") }, failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
check("no-credentials: literal secret quoted in a comment does NOT flag", !runCli([cmtCred]).stdout.includes("[no-credentials]"), runCli([cmtCred]).stdout);

const h2 = runCli([hatch]);
check("no-ambiguous: // status-ambiguous escape hatch STILL honored after stripping", h2.status === 0, h2.stdout);

const absUrl = tmpSpec("abs-url.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ method: "GET", url: "https://jsonplaceholder.typicode.com/posts", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(200); }); });` + UNAUTH);
const au = runCli([absUrl]);
check("absolute https:// URL spec: verdict unchanged (clean)", au.status === 0, au.stdout);

console.log(failures ? `\n${failures} assertion(s) FAILED` : "\nall gate assertions passed");
process.exit(failures ? 1 : 0);
