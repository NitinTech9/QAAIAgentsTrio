"use strict";
const { lineOf } = require("./lib");

// Check 9b — no oneOf accepting both a 2xx and a 4xx (passes either way = tests nothing).
// HYBRID source handling: the oneOf is detected on the comment-STRIPPED source
// (so a comment merely quoting oneOf([200,404]) never trips it), but the escape
// hatch `// status-ambiguous: <reason>` IS a comment — so it is looked up on the
// RAW source (ctx.raw) at the same offsets, which stripComments preserves.
module.exports = {
    name: "no-ambiguous",
    check(src, ctx) {
        const raw = (ctx && ctx.raw) || src;
        const bad = [];
        const arr = /oneOf\(\s*\[[\s\S]*?\]/g;
        let m;
        while ((m = arr.exec(src))) {
            const b = m[0];
            if (!(/\b2\d{2}\b/.test(b) && /\b4\d{2}\b/.test(b))) continue;
            const eol = raw.indexOf("\n", arr.lastIndex);
            const throughEol = raw.slice(m.index, eol < 0 ? undefined : eol);
            if (/status-ambiguous/.test(throughEol)) continue;
            bad.push({ line: lineOf(src, m.index), message: "ambiguous 2xx/4xx oneOf — assert the precise code (escape hatch: // status-ambiguous: <reason>)" });
        }
        return bad;
    },
};
