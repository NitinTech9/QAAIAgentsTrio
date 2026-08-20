#!/usr/bin/env node
"use strict";
// Dangling-reference check: every FRAMEWORK-relative path mentioned in
// .claude/**/*.md must resolve in this repo. Consumer-repo paths (cypress/,
// tests/, docs/, …) are out of scope — they exist only after /qa-init.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PREFIXES = /(\.claude|scripts|ci|CONTRIBUTING)\/[A-Za-z0-9._/-]+/g;
// User-local / gitignored files that are legitimately absent from the repo.
const ALLOW = /\.local\.|cypress\.env\.json|\.qa-backup/;

function mdFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? mdFiles(p) : /\.md$/.test(e.name) ? [p] : [];
    });
}

let bad = 0;
for (const file of mdFiles(path.join(ROOT, ".claude"))) {
    const src = fs.readFileSync(file, "utf8");
    let m;
    while ((m = PREFIXES.exec(src))) {
        let ref = m[0].replace(/[.,;:)\]}'"`]+$/, ""); // strip trailing prose punctuation
        if (/[*<>{$]/.test(ref) || ALLOW.test(ref)) continue; // globs/templates/user-local
        if (!fs.existsSync(path.join(ROOT, ref))) {
            const line = src.slice(0, m.index).split("\n").length;
            console.log(`✗ dangling reference: ${path.relative(ROOT, file)}:${line} -> ${ref}`);
            bad++;
        }
    }
}
console.log(bad ? `${bad} dangling reference(s)` : "all framework-relative references resolve");
process.exit(bad ? 1 : 0);
