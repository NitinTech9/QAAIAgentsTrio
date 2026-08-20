"use strict";
const { lineOf, itBlocks } = require("./lib");

// Check 1 — every it() title must reference a ticket ID. Source-agnostic
// (see .claude/guides/ticket-sources.md): a Jira-style key (PROJ-123) or the
// framework's bracketed-id convention ([DEMO-1], [#123], [CU-abc12]).
const TICKET = /\b[A-Z][A-Z0-9]*-\d+\b|\[#?[A-Za-z0-9][A-Za-z0-9._-]*\]/;

module.exports = {
    name: "ticket-id",
    check(src) {
        return itBlocks(src)
            .filter((b) => !TICKET.test(b.title))
            .map((b) => ({ line: lineOf(src, b.index), message: `it() title has no ticket ID: "${b.title.slice(0, 60)}"` }));
    },
};
