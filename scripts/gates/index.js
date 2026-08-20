#!/usr/bin/env node
"use strict";
// qa-gates — the single owner of the framework's mechanical spec gates.
// Usage: qa-gates <spec...> | qa-gates --staged [--json]
// Exit 1 if any violation. Enforces validate-spec.md Checks 1,4,6,8,9,9b,11.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GATES = [
    require("./syntax"),        // Check 8
    require("./ticket-id"),     // Check 1
    require("./tags-present"),  // Check 4
    require("./fail-on-status"),// Check 6
    require("./no-5xx"),        // Check 9  (HARD GATE)
    require("./no-ambiguous"),  // Check 9b
    require("./db-assertion"),  // Check 11 (HARD GATE)
];

function loadDbVerification(cwd) {
    let v = true;
    for (const f of ["project-config.json", "project-config.local.json"]) {
        try {
            const c = JSON.parse(fs.readFileSync(path.join(cwd, ".claude", f), "utf8"));
            if (c.project && typeof c.project.dbVerification === "boolean") v = c.project.dbVerification;
        } catch (e) { /* absent/invalid config -> default true */ }
    }
    return v;
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
    const dbVerification = loadDbVerification(process.cwd());
    for (const file of files) {
        if (!fs.existsSync(file)) { violations.push({ file, gate: "io", line: 0, message: "file not found" }); continue; }
        const src = fs.readFileSync(file, "utf8");
        const ctx = { file, dbVerification, notes };
        for (const g of GATES)
            for (const v of g.check(src, ctx))
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
module.exports = { main, GATES, loadDbVerification };
