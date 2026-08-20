"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Check 8 — node --check (parses CJS or ESM).
// node --check refuses unknown extensions (e.g. the .fixture test corpus),
// so non-.js files are staged through a temp .js copy first.
module.exports = {
    name: "syntax",
    check(src, ctx) {
        let target = ctx.file;
        let tmp = null;
        if (!/\.(js|mjs|cjs)$/.test(target)) {
            tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qa-gates-syntax-")), "spec.cy.js");
            fs.writeFileSync(tmp, src);
            target = tmp;
        }
        const r = spawnSync(process.execPath, ["--check", target], { encoding: "utf8" });
        if (tmp) fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
        if (r.status === 0) return [];
        const firstErr = (r.stderr || "syntax error").trim().split("\n").slice(-2).join(" — ");
        return [{ line: 0, message: "does not parse: " + firstErr }];
    },
};
