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

// 1. CLI end-to-end on the corpus
const good = runCli([GOOD]);
check("good fixture exits 0", good.status === 0, "exit " + good.status + "\n" + good.stdout);
const bad = runCli([BAD]);
check("bad fixture exits 1", bad.status === 1, "exit " + bad.status);
for (const gate of ["no-5xx", "no-ambiguous", "db-assertion", "ticket-id", "tags-present"])
    check(`bad fixture names [${gate}]`, bad.stdout.includes(`[${gate}]`), bad.stdout);
for (const gate of ["syntax", "fail-on-status"])
    check(`bad fixture does NOT flag [${gate}]`, !bad.stdout.includes(`[${gate}]`), bad.stdout);
const badJson = runCli([BAD, "--json"]);
check("--json parses and lists violations", (() => { try { return JSON.parse(badJson.stdout).violations.length >= 5; } catch (e) { return false; } })());

// 2. Per-gate cases the corpus does not cover
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qa-gates-"));
function tmpSpec(name, content) { const p = path.join(tmp, name); fs.writeFileSync(p, content); return p; }

const noFos = tmpSpec("no-fos.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ method: "GET", url: "/x" }).then((r) => { expect(r.status).to.equal(200); }); });`);
check("fail-on-status flags cy.api without failOnStatusCode", runCli([noFos]).stdout.includes("[fail-on-status]"));

const badSyntax = tmpSpec("broken.cy.js", "it(((");
check("syntax flags unparseable file", runCli([badSyntax]).stdout.includes("[syntax]"));

const hatch = tmpSpec("hatch.cy.js", `it("[T-1] TC", { tags: ["@Regression"] }, () => { cy.api({ url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.be.oneOf([200, 404]); // status-ambiguous: state-dependent flow\n }); });`);
check("no-ambiguous honors // status-ambiguous escape hatch", runCli([hatch]).status === 0, runCli([hatch]).stdout);

// db-assertion honors dbVerification:false via project config
const proj = fs.mkdtempSync(path.join(os.tmpdir(), "qa-gates-proj-"));
fs.mkdirSync(path.join(proj, ".claude"));
fs.writeFileSync(path.join(proj, ".claude/project-config.json"), JSON.stringify({ project: { dbVerification: false } }));
const mut = tmpSpec("mut.cy.js", `it("[T-1] TC", { tags: ["@PR"] }, () => { cy.api({ method: "POST", url: "/x", failOnStatusCode: false }).then((r) => { expect(r.status).to.equal(201); }); });`);
const skipped = runCli([mut], proj);
check("db-assertion skips (with note) when dbVerification=false", skipped.status === 0 && /db-assertion skipped/.test(skipped.stdout), skipped.stdout);
const enforced = runCli([mut], ROOT);
check("db-assertion enforced when dbVerification=true", enforced.status === 1 && enforced.stdout.includes("[db-assertion]"), enforced.stdout);

console.log(failures ? `\n${failures} assertion(s) FAILED` : "\nall gate assertions passed");
process.exit(failures ? 1 : 0);
