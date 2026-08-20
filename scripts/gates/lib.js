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

// Replace // line comments and /* */ block comments with SPACES, preserving
// every newline and every byte offset (lineOf() and index math stay valid on
// the stripped source — that alignment is what lets the no-ambiguous gate
// look up its comment escape hatch on the RAW source at the same offsets).
//
// STRING-AWARE by construction: a `//` inside "https://x", 'a // b',
// `tpl ${x} // y`, or /regex\/\//flags is NOT a comment. The scanner tracks
// double/single-quoted strings, template literals (incl. ${} interpolation
// nesting), and regex literals, honoring backslash escapes inside each.
function stripComments(src) {
    const out = src.split("");
    const interp = [];      // ${} nesting: brace depth per open interpolation
    let mode = "code";      // code | line | block | dq | sq | tpl | regex | regexClass
    let lastSig = "";       // last significant char in code mode (regex-vs-division)
    let lastWord = "";      // last identifier/keyword in code mode
    const REGEX_OK_CHARS = "([{,;=:!&|?+-*%^~<>";
    const REGEX_OK_WORDS = /^(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/;
    let i = 0;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (mode === "code") {
            if (c === "/" && d === "/") { out[i] = out[i + 1] = " "; mode = "line"; i += 2; continue; }
            if (c === "/" && d === "*") { out[i] = out[i + 1] = " "; mode = "block"; i += 2; continue; }
            if (c === '"') mode = "dq";
            else if (c === "'") mode = "sq";
            else if (c === "`") mode = "tpl";
            else if (c === "/") {
                if (!lastSig || REGEX_OK_CHARS.includes(lastSig) || REGEX_OK_WORDS.test(lastWord)) mode = "regex";
            } else if (c === "{" && interp.length) interp[interp.length - 1]++;
            else if (c === "}" && interp.length) {
                if (interp[interp.length - 1] === 0) { interp.pop(); mode = "tpl"; }
                else interp[interp.length - 1]--;
            }
            if (!/\s/.test(c)) { lastSig = c; lastWord = /[A-Za-z_$]/.test(c) ? lastWord + c : ""; }
            i++; continue;
        }
        if (mode === "line") { if (c === "\n") mode = "code"; else out[i] = " "; i++; continue; }
        if (mode === "block") {
            if (c === "*" && d === "/") { out[i] = out[i + 1] = " "; mode = "code"; i += 2; continue; }
            if (c !== "\n") out[i] = " ";
            i++; continue;
        }
        if (mode === "dq" || mode === "sq") {
            if (c === "\\") { i += 2; continue; }
            if ((mode === "dq" && c === '"') || (mode === "sq" && c === "'")) { mode = "code"; lastSig = c; lastWord = ""; }
            i++; continue;
        }
        if (mode === "tpl") {
            if (c === "\\") { i += 2; continue; }
            if (c === "`") { mode = "code"; lastSig = "`"; lastWord = ""; }
            else if (c === "$" && d === "{") { interp.push(0); mode = "code"; lastSig = "{"; lastWord = ""; i += 2; continue; }
            i++; continue;
        }
        if (mode === "regex") {
            if (c === "\\") { i += 2; continue; }
            if (c === "[") mode = "regexClass";
            else if (c === "/") { mode = "code"; lastSig = "/"; lastWord = ""; }
            else if (c === "\n") mode = "code"; // unterminated — bail safely
            i++; continue;
        }
        if (mode === "regexClass") {
            if (c === "\\") { i += 2; continue; }
            if (c === "]") mode = "regex";
            i++; continue;
        }
    }
    return out.join("");
}

module.exports = { lineOf, itBlocks, balancedEnd, stripComments };
