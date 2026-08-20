#!/usr/bin/env node
"use strict";
// Coverage-risk report over api-behavior-notes.json: every known_500_bugs /
// endpoint_quirks entry is a potential silent coverage suppressor, so each is
// printed as an explicit COVERAGE RISK line with its age and ticket. Stale or
// ticket-less entries are marked "re-verify before trusting" per
// .claude/protocols/knowledge-protocol.md.
// Usage: knowledge-audit.js [notes.json] [--max-age-days N] [--strict] [--selftest]

const fs = require("fs");
const path = require("path");

function maxAgeDays(cwd) {
    try {
        const c = JSON.parse(fs.readFileSync(path.join(cwd, ".claude/project-config.json"), "utf8"));
        return (c.project.knowledge && c.project.knowledge.behaviorNoteMaxAgeDays) || 90;
    } catch (e) { return 90; }
}

function audit(file, maxAge) {
    let notes;
    try { notes = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { console.log(`no readable behavior notes at ${file} — nothing suppressed`); return { risks: 0, flagged: 0 }; }
    let risks = 0, flagged = 0;
    for (const kind of ["known_500_bugs", "endpoint_quirks"]) {
        for (const e of notes[kind] || []) {
            risks++;
            const basis = e.lastVerified || e.recordedAt;
            const age = basis ? Math.round((Date.now() - new Date(basis).getTime()) / 86400000) : null;
            const problems = [];
            if (!e.ticket) problems.push("NO TICKET");
            if (age === null) problems.push("NO recordedAt/lastVerified");
            else if (age > maxAge) problems.push(`STALE (${age}d > ${maxAge}d)`);
            const verdict = problems.length ? ` [${problems.join("; ")} — re-verify before trusting, do NOT skip coverage on this entry alone]` : "";
            if (problems.length) flagged++;
            console.log(`COVERAGE RISK: ${e.endpoint || "<no endpoint field>"} — suppressed by ${kind} entry; age ${age === null ? "unknown" : age + "d"}; ticket ${e.ticket || "NONE"}; recordedBy ${e.recordedBy || "unknown"}${verdict}`);
        }
    }
    console.log(risks ? `${risks} endpoint(s) carry behavior notes; ${flagged} need re-verification` : "no behavior-note suppressions");
    return { risks, flagged };
}

function selftest() {
    const os = require("os");
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ka-")), "notes.json");
    fs.writeFileSync(tmp, JSON.stringify({
        known_500_bugs: [{ endpoint: "GET /api/legacy/export", note: "500 on empty dataset", recordedAt: "2024-01-01T00:00:00Z", recordedBy: "api-automation-test-generator" }],
        endpoint_quirks: [],
    }));
    let out = "";
    const orig = console.log; console.log = (s) => { out += s + "\n"; };
    const r = audit(tmp, 90);
    console.log = orig;
    const ok = r.risks === 1 && r.flagged === 1 && /COVERAGE RISK/.test(out) && /STALE/.test(out) && /ticket NONE/.test(out) && /re-verify before trusting/.test(out);
    process.stdout.write(out);
    console.log(ok ? "SELFTEST PASS — stale ticket-less entry surfaced as coverage risk, not honored silently" : "SELFTEST FAIL");
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    return ok ? 0 : 1;
}

if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.includes("--selftest")) process.exit(selftest());
    const file = argv.find((a) => !a.startsWith("--")) || "cypress/knowledge/api-behavior-notes.json";
    const mi = argv.indexOf("--max-age-days");
    const maxAge = mi >= 0 ? parseInt(argv[mi + 1], 10) : maxAgeDays(process.cwd());
    const r = audit(file, maxAge);
    process.exit(argv.includes("--strict") && r.flagged ? 1 : 0);
}
module.exports = { audit };
