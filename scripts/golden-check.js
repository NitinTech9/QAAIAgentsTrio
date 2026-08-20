#!/usr/bin/env node
"use strict";
// Golden-corpus checker: verifies a spec against a golden checklist's MUST
// lines. Checklist format (one per line):
//   - MUST: <semantic statement> :: <case-insensitive regex, [\s\S] allowed>
// Detection is heuristic: a matching pattern proves PRESENCE of the required
// element, not its correctness — absence reports are reliable, presence still
// needs judgment (see .claude/selftest/golden/README.md).
// Usage: golden-check.js <spec-file> <checklist.md>

const fs = require("fs");

function main(specPath, checklistPath) {
    const src = fs.readFileSync(specPath, "utf8");
    const lines = fs.readFileSync(checklistPath, "utf8").split("\n");
    let missing = 0, total = 0;
    for (const line of lines) {
        const m = line.match(/^- MUST:\s*(.+?)\s*::\s*(.+)$/);
        if (!m) continue;
        total++;
        let ok = false;
        try { ok = new RegExp(m[2], "i").test(src); }
        catch (e) { console.log(`INVALID  checklist regex: ${m[2]} (${e.message})`); missing++; continue; }
        console.log((ok ? "present " : "MISSING ") + m[1]);
        if (!ok) missing++;
    }
    if (!total) { console.log("no MUST lines found in " + checklistPath); return 1; }
    console.log(missing ? `\n${missing}/${total} required element(s) MISSING from ${specPath}` : `\nall ${total} required elements present in ${specPath}`);
    return missing ? 1 : 0;
}

if (require.main === module) {
    if (process.argv.length < 4) { console.log("usage: golden-check.js <spec> <checklist.md>"); process.exit(2); }
    process.exit(main(process.argv[2], process.argv[3]));
}
module.exports = { main };
