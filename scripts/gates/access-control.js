"use strict";
const { itBlocks } = require("./lib");

// Check 5 — an access-control / unauthenticated-rejection test must exist.
// API specs: at least one it() asserts 401/403 AND calls cy.clearCookies() in
// that same test — the session cookie jar otherwise still sends the cookie, so
// an "unauthenticated" test that omits clearCookies is fake (documented trap).
// UI specs: at least one test asserts a redirect to the login path.
// Mode comes from the spec's location under config.paths.apiTests / uiTests;
// falls back to content sniffing (cy.api => api, cy.visit => ui) for files
// outside both (e.g. the selftest fixture corpus). Schema-validation specs are
// exempt (they assert response shape, not authorization).
//
// Escape hatch for genuinely PUBLIC endpoints (health checks, status pages —
// where an unauthenticated-rejection test is not applicable because rejection
// is not the correct behavior): a `// access-control-exempt: <reason>` comment
// anywhere in the spec. The reason is mandatory, the exemption is reported as
// a note (visible, never silent), and like status-ambiguous it is read from
// the RAW source (ctx.raw) because the hatch IS a comment.
module.exports = {
    name: "access-control",
    check(src, ctx) {
        const file = (ctx && ctx.file) || "";
        if (/schema-validation/.test(file)) return [];
        const raw = (ctx && ctx.raw) || src;
        const ex = raw.match(/access-control-exempt:[ \t]*(\S[^\n]*)/);
        if (ex) {
            if (ctx && ctx.notes) ctx.notes.push(`access-control exempt (${file}): ${ex[1].trim()} — verify the endpoint really is public`);
            return [];
        }
        if (/access-control-exempt/.test(raw))
            return [{ line: 0, message: "access-control-exempt marker without a reason — the exemption must say WHY the endpoint is public (// access-control-exempt: <reason>)" }];
        const paths = (ctx && ctx.paths) || {};
        let mode = null;
        if (paths.apiTests && file.includes(paths.apiTests)) mode = "api";
        else if (paths.uiTests && file.includes(paths.uiTests)) mode = "ui";
        else if (/cy\.api\(/.test(src)) mode = "api";
        else if (/cy\.visit\(/.test(src)) mode = "ui";
        if (!mode) return [];

        // Slice the source into per-it() segments so clearCookies and the
        // 401/403 assertion must appear in the SAME test.
        const blocks = itBlocks(src);
        if (!blocks.length) return [];
        const segs = blocks.map((b, i) => src.slice(b.index, i + 1 < blocks.length ? blocks[i + 1].index : src.length));

        if (mode === "api") {
            const asserts401 = (s) => /oneOf\(\s*\[\s*40[13]\s*,\s*40[13]\s*\]/.test(s) || /to\.(equal|eq)\(\s*40[13]\s*\)/.test(s);
            if (segs.some((s) => asserts401(s) && /cy\.clearCookies\(\)/.test(s))) return [];
            if (segs.some(asserts401))
                return [{ line: 0, message: "unauthenticated test asserts 401/403 but never calls cy.clearCookies() — the cookie jar still sends the session cookie, so the test is fake" }];
            return [{ line: 0, message: "no access-control test — add an it() that calls cy.clearCookies() and asserts 401/403" }];
        }
        // ui
        const loginPath = paths.loginPath || "/login";
        const redirects = new RegExp("(url\\(\\)|location)[\\s\\S]{0,120}?(include|eq|contain)[\\s\\S]{0,40}?" + loginPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        if (segs.some((s) => redirects.test(s))) return [];
        return [{ line: 0, message: `no access-control test — add a test asserting redirect to ${loginPath} when cookies are cleared` }];
    },
};
