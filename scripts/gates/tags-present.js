"use strict";
const { lineOf, itBlocks } = require("./lib");

// Check 4 — every it() must carry a { tags: ["@..."] } options object.
module.exports = {
    name: "tags-present",
    check(src) {
        return itBlocks(src)
            .filter((b) => !/^\s*,\s*\{\s*tags\s*:\s*\[\s*["'`]@/.test(src.slice(b.afterTitle, b.afterTitle + 200)))
            .map((b) => ({ line: lineOf(src, b.index), message: `it() has no { tags: ["@..."] } options object: "${b.title.slice(0, 60)}"` }));
    },
};
