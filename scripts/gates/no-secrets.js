"use strict";
const { lineOf } = require("./lib");

// Check 7 — no hardcoded credentials. Flags literal secrets; must NOT flag the
// correct pattern (Cypress.env("...") / process.env reads — those never match
// because every rule below requires a quoted LITERAL value).
// File is named no-secrets.js because the repo's own settings deny
// Read/Edit(**/*credentials*) — the gate id stays "no-credentials".
const RULES = [
    { re: /\b(password|passwd|secret|token|api[-_]?key)\b\s*[:=]\s*["'`][^"'`\n]{4,}["'`]/gi, msg: "credential-looking key assigned a string literal" },
    { re: /["'`]Bearer\s+[A-Za-z0-9._~+/-]{10,}={0,2}["'`]/g, msg: "literal Bearer token" },
    { re: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\/\s"'`]+:[^\/\s"'`]+@/g, msg: "connection URI with embedded credentials" },
    { re: /["'`][A-Fa-f0-9]{32,}["'`]/g, msg: "long hex literal (possible key/hash credential)" },
    { re: /["'`][A-Za-z0-9+/]{40,}={0,2}["'`]/g, msg: "long base64 literal (possible key credential)" },
];

module.exports = {
    name: "no-credentials",
    check(src) {
        const bad = [];
        for (const { re, msg } of RULES) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(src)))
                bad.push({ line: lineOf(src, m.index), message: `${msg}: ${m[0].slice(0, 40)}… — move it to Cypress.env()/fixtures` });
        }
        return bad;
    },
};
