"use strict";

// Check 11 — a mutation asserted successful (2xx) must be backed by a DB assertion.
// Skipped entirely when project.dbVerification === false (degraded standard).
module.exports = {
    name: "db-assertion",
    check(src, ctx) {
        if (ctx && ctx.dbVerification === false) {
            if (ctx.notes) ctx.notes.push("db-assertion skipped — dbVerification is false in project config (persistence not proven)");
            return [];
        }
        const mutates = /method:\s*["'](POST|PUT|PATCH|DELETE)["']/i.test(src);
        const assertsSuccess = /to\.equal\(\s*20[0-9]\b/.test(src) || /oneOf\(\s*\[[^\]]*\b20[0-9]\b/.test(src);
        const hasDb = /cy\.task\(\s*["'](queryDb|querySecondaryDb)/.test(src);
        if (mutates && assertsSuccess && !hasDb)
            return [{ line: 0, message: "mutation asserts a 2xx success but has NO cy.task queryDb/querySecondaryDb assertion" }];
        return [];
    },
};
