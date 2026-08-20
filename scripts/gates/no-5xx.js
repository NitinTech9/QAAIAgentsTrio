"use strict";
const { lineOf } = require("./lib");

// Check 9 — a status assertion must never accept a 5xx.
module.exports = {
    name: "no-5xx",
    check(src) {
        const bad = [];
        let m;
        const arr = /oneOf\(\s*\[[\s\S]*?\]/g; // each oneOf array, spans newlines
        while ((m = arr.exec(src)))
            if (/\b5\d{2}\b/.test(m[0]))
                bad.push({ line: lineOf(src, m.index), message: "5xx inside oneOf — a test must be able to fail" });
        const eq = /to\.(equal|include)\(\s*5\d{2}\b/g;
        while ((m = eq.exec(src)))
            bad.push({ line: lineOf(src, m.index), message: "5xx status assertion — a test must be able to fail" });
        return bad;
    },
};
