"use strict";

// Shared helpers for gate scanners.

function lineOf(src, index) {
    return src.slice(0, index).split("\n").length;
}

// Iterate it( "title" , ... ) blocks: yields { title, index, afterTitle }.
function itBlocks(src) {
    const out = [];
    const re = /\bit\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(src))) {
        out.push({ title: m[2], index: m.index, afterTitle: re.lastIndex });
    }
    return out;
}

// From an opening "{" index, return the index just past its matching "}".
// Ignores braces inside strings only crudely — good enough for generated specs.
function balancedEnd(src, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < src.length; i++) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return src.length;
}

module.exports = { lineOf, itBlocks, balancedEnd };
