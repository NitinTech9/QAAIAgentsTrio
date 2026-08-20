#!/usr/bin/env node
"use strict";
// qa-gates — the single owner of the framework's mechanical spec gates.
// Usage: qa-gates <spec...> | qa-gates --staged [--json]
// Exit 1 if any violation. Enforces validate-spec.md Checks 1,4,6,8,9,9b,11.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { stripComments } = require("./lib");

const GATES = [
    require("./syntax"),         // Check 8
    require("./ticket-id"),      // Check 1
    require("./tags-present"),   // Check 4
    require("./fail-on-status"), // Check 6
    require("./access-control"), // Check 5
    require("./no-secrets"),     // Check 7 (gate id: no-credentials)
    require("./no-5xx"),         // Check 9  (HARD GATE)
    require("./no-ambiguous"),   // Check 9b
    require("./db-assertion"),   // Check 11 (HARD GATE)
];

function loadProjectConfig(cwd) {
    const out = { dbVerification: true, paths: {} };
    for (const f of ["project-config.json", "project-config.local.json"]) {
        try {
            const c = JSON.parse(fs.readFileSync(path.join(cwd, ".claude", f), "utf8"));
            const p = c.project || {};
            if (typeof p.dbVerification === "boolean") out.dbVerification = p.dbVerification;
            if (p.paths) out.paths = Object.assign({}, out.paths, { apiTests: p.paths.apiTests, uiTests: p.paths.uiTests });
            if (p.app && p.app.loginPath) out.paths.loginPath = p.app.loginPath;
        } catch (e) { /* absent/invalid config -> defaults */ }
    }
    return out;
}

function stagedSpecs() {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" });
    return out.split("\n").filter((f) => /\.(cy|spec)\.js$/.test(f) && fs.existsSync(f));
}

function main(argv) {
    const json = argv.includes("--json");
    const staged = argv.includes("--staged");
    let files = argv.filter((a) => !a.startsWith("--"));
    if (staged) files = files.concat(stagedSpecs());
    if (!files.length) {
        if (!json) console.log(staged ? "qa-gates: no staged spec files — nothing to check" : "usage: qa-gates <spec...> | qa-gates --staged [--json]");
        else console.log(JSON.stringify({ violations: [], notes: [] }));
        return 0;
    }

    const notes = [];
    const violations = [];
    const cfg = loadProjectConfig(process.cwd());
    for (const file of files) {
        if (!fs.existsSync(file)) { violations.push({ file, gate: "io", line: 0, message: "file not found" }); continue; }
        const src = fs.readFileSync(file, "utf8");
        // Gates scan comment-stripped source (offsets preserved) so a comment can
        // neither satisfy a presence check (db-assertion bypass) nor trip a
        // pattern check (a comment quoting the rule). syntax opts into RAW via
        // source:"raw"; no-ambiguous reads its comment escape hatch from ctx.raw.
        const stripped = stripComments(src);
        const ctx = { file, dbVerification: cfg.dbVerification, paths: cfg.paths, notes, raw: src };
        for (const g of GATES)
            for (const v of g.check(g.source === "raw" ? src : stripped, ctx))
                violations.push({ file, gate: g.name, line: v.line, message: v.message });
    }

    if (json) {
        console.log(JSON.stringify({ violations, notes }, null, 2));
    } else {
        for (const n of notes) console.log("⚠ " + n);
        for (const v of violations) console.log(`✗ [${v.gate}] ${v.file}${v.line ? ":" + v.line : ""} — ${v.message}`);
        if (!violations.length) console.log(`qa-gates: ${files.length} file(s) clean`);
    }
    return violations.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, GATES, loadProjectConfig };
