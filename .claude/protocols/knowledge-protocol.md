# Protocol: knowledge base (read-before / write-after, provenance, staleness)

The knowledge files under `{config.paths.knowledge}` are agent-writable memory. A wrong or stale
entry can permanently and INVISIBLY suppress coverage — that is the failure this protocol exists
to prevent. Silent suppression is the defect; visibility is the fix.

## Read before, write after

- **Before** generating or fixing tests: check `api-behavior-notes.json` (known 5xx bugs, quirks,
  auth behavior), `api-dependency-map.json` (tables, cleanup order, auth roles), and
  `failure-patterns.json` (known `FP-###` fixes).
- **After** any suite change or discovery: update the matching knowledge file **in the same
  change**; validate edited JSON with `node -e "JSON.parse(...)"`.

## Provenance (required on every behavior-note entry)

Every `known_500_bugs` and `endpoint_quirks` entry MUST carry:
`endpoint`, `ticket` (the bug tracking the defect), `recordedAt`, `lastVerified`, `recordedBy`
(agent name or human), plus a free-text `note`. An entry you cannot attach a ticket to is a
weak claim — record it, but expect it to be challenged (below).

## Staleness — a stale or ticket-less entry must NOT silently suppress a test

- Threshold: `project.knowledge.behaviorNoteMaxAgeDays` in project-config.json (default 90),
  measured from `lastVerified` (falling back to `recordedAt`).
- A **fresh entry with a ticket** may steer generation (don't assert 200 on a documented 5xx —
  and never accept the 5xx; assert documented current behavior instead).
- A **stale or ticket-less entry** means *re-verify before trusting*: probe the endpoint once —
  if it now behaves, delete/update the entry and write the normal test; if still broken, update
  `lastVerified` and keep the steer. Never skip coverage on the strength of a stale note alone.

## Visibility — every suppression is reported

- Generation output must list any endpoint whose coverage a behavior note changed.
- `/qa-audit` runs `node scripts/knowledge-audit.js` and reports every suppressed endpoint as an
  explicit **COVERAGE RISK** line with the entry's age and ticket — so a suppressed endpoint
  reads as "deliberately skipped, N days old, tracked by TICKET", never as "never in scope".
