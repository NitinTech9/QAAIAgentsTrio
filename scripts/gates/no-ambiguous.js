"use strict";
const { lineOf } = require("./lib");

// Check 9b — no oneOf accepting both a 2xx and a 4xx (passes either way = tests nothing).
// Escape hatch: a `// status-ambiguous: <reason>` comment on the offending line.
module.exports = {
    name: "no-ambiguous",
    check(src) {
        const bad = [];
        const arr = /oneOf\(\s*\[[\s\S]*?\]/g;
        let m;
        while ((m = arr.exec(src))) {
            const b = m[0];
            if (!(/\b2\d{2}\b/.test(b) && /\b4\d{2}\b/.test(b))) continue;
            const eol = src.indexOf("\n", arr.lastIndex);
            const throughEol = src.slice(m.index, eol < 0 ? undefined : eol);
            if (/status-ambiguous/.test(throughEol)) continue;
            bad.push({ line: lineOf(src, m.index), message: "ambiguous 2xx/4xx oneOf — assert the precise code (escape hatch: // status-ambiguous: <reason>)" });
        }
        return bad;
    },
};
