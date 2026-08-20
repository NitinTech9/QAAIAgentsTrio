"use strict";
const { lineOf, balancedEnd } = require("./lib");

// Check 6 — every cy.api({...}) options object must include failOnStatusCode: false.
// cy.api(variable) calls are skipped (not mechanically verifiable).
module.exports = {
    name: "fail-on-status",
    check(src) {
        const bad = [];
        const re = /cy\.api\(\s*\{/g;
        let m;
        while ((m = re.exec(src))) {
            const open = src.indexOf("{", m.index);
            const body = src.slice(open, balancedEnd(src, open));
            if (!/failOnStatusCode\s*:\s*false/.test(body))
                bad.push({ line: lineOf(src, m.index), message: "cy.api() call without failOnStatusCode: false" });
        }
        return bad;
    },
};
