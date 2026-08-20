# Golden corpus — reference tickets with accepted specs

Three bundled tickets, each with an ACCEPTED spec committed as the reference output and a
`checklist.md` stating what a correct spec must contain **semantically** (which endpoints, which
negative cases, which persistence assertions) — not just that it parses.

| Ticket | Type | Shape | Context fixtures |
|---|---|---|---|
| SELFTEST-1 | Story | single-resource CRUD | reuses `../SELFTEST-1.{json,md}` + `-analysis.md`; accepted spec = `../specs/good-api-spec.cy.js.fixture` |
| SELFTEST-2 | Bug | regression + persistence | in `SELFTEST-2/` |
| SELFTEST-3 | Story | multi-endpoint (3 routes) | in `SELFTEST-3/` |

**How it is used:** `/qa-selftest golden` (Phase 5) generates a spec for each ticket, runs
`node scripts/golden-check.js <generated> <checklist>` to report which required elements are
MISSING, and prints a `diff -u` against the accepted spec as a reference point. CI separately
asserts self-consistency: every accepted spec satisfies its own checklist and passes `qa-gates`.

**What this measures — and does not.** The checklist regexes reliably detect the ABSENCE of a
required element (an endpoint never exercised, a mutation with no persistence assertion, no
unauthenticated-rejection test). They do NOT prove correctness: a matching pattern can still assert
the wrong value, set up the wrong data, or test the right endpoint the wrong way — and the diff
against the accepted spec is a comparison point for human/LLM judgment, not a pass/fail signal.
This is deliberately a MINIMAL corpus (a stable signal for prompt edits), not an eval harness.
