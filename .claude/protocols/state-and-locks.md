# Protocol: pipeline state & run locks (canonical — ALL agents and commands)

State lives in `{config.paths.ticketContext}/TICKET_ID-pipeline-state.json`. Every command
reads/writes `steps.<key>` there — never keys at the top level. Step values are `"pending"`,
`"done"`, or `"skipped (auto)"`. Always **merge**: preserve every key another agent wrote.
Canonical shape: `{ ticketId, steps: {...}, locks: {}, lastUpdated }`.

If the file exists but `JSON.parse` fails (truncated / hand-edited): do NOT crash — copy it to
`…-pipeline-state.corrupt.json`, announce it, and recreate the canonical shape.

## Atomic state writes (EVERY write, including initial creation)

Never Write/Edit the state file directly — a crash mid-write leaves corrupt JSON, and a plain
read-modify-write can clobber a concurrently running agent's keys. Every update goes through this
snippet, which re-reads fresh, merges only the keys you pass, then temp-writes and renames
(rename is atomic):

```bash
node -e '
const fs=require("fs"),p=process.argv[1],updates=JSON.parse(process.argv[2]);
let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){if(fs.existsSync(p)){fs.copyFileSync(p,p+".corrupt.json");console.error("state unreadable — backed up to "+p+".corrupt.json");}}
for(const [k,v] of Object.entries(updates)){
  s[k]=(v&&typeof v==="object"&&!Array.isArray(v))?{...s[k],...v}:v;
}
if(s.locks)for(const d of Object.keys(s.locks))if(s.locks[d]===null)delete s.locks[d];
s.lastUpdated=new Date().toISOString();
const t=p+".tmp."+process.pid;fs.writeFileSync(t,JSON.stringify(s,null,2));fs.renameSync(t,p);
' "<STATE_FILE>" '<UPDATES_JSON>'
```

`<UPDATES_JSON>` examples: mark a step done → `{"steps":{"fetch-ticket":"done"}}`; take a lock →
`{"locks":{"api":{"lockedBy":"<agent>","lockedByUser":"<user>","lockedAt":"<ISO>"}}}`; release →
`{"locks":{"api":null}}`.

Note: temp→rename prevents torn files, and the fresh re-read narrows — but does not fully close —
the read-modify-write window between concurrently writing domains. Keep each state update small
and immediate; never hold a long read-modify-write cycle open.

## Run locks (enforced)

Each agent owns one lock **domain** in `locks`: `manual`, `api`, `ui`, `postman`. Domains are
independent — API and UI automation for the same ticket MAY run in parallel; two runs in the
**same** domain may not.

1. **Acquire** (before any step, right after the state file is read/created): if `locks[<domain>]`
   exists, is not yours, and `lockedAt` is **less than 60 minutes old** → stop:
   > "⛔ TICKET_ID is locked by <lockedBy> (started <lockedAt> by <lockedByUser>). If that run is dead, re-run with `force-lock`."
   If **older than 60 minutes**, announce `⚠️ Stale lock from <lockedBy> (<lockedAt>) — overriding`
   and take it. Write your lock via the atomic snippet, with `lockedBy` = your agent name and
   `lockedByUser` = `git config user.name || whoami` (auto-captured — never ask the user for an
   ID). Finally **re-read and verify your lock won** — acquire-check and write are not one atomic
   operation; if another run's lock is there instead, treat the ticket as locked and stop.
2. **Refresh:** every step-completion write also rewrites your lock with a fresh `lockedAt`
   (both in one `<UPDATES_JSON>`), so a healthy long run never looks stale.
3. **Release:** the final state write sets `{"locks":{"<domain>":null}}` — including when the run
   ends early on a gate/stop (release before stopping).
4. **`force-lock` flag** (all agents): override a fresh same-domain lock — only when the user
   explicitly passes it.

Agent-local deviations (e.g. the manual agent's FORCE_MODE guard) are stated in that agent's file
and must say explicitly what they override.

## Run metrics (recorded by every agent at Final Output)

Record `RUN_STARTED_AT` (ISO timestamp) at agent setup. For tuning `maxTurns` budgets from data instead of guessing: append one entry to `{config.paths.knowledge}/agent-run-history.json` (create `{"runs": []}` if missing; validate JSON after writing): `{"agent": "<this agent>", "ticketId": TICKET_ID, "startedAt": RUN_STARTED_AT, "finishedAt": "<now ISO>", "wallClockMs": <difference>, "stepsCompleted": <count of steps set to done this run>, "turnsUsed": null}`. The harness does not expose the model-turn count to the agent, so `turnsUsed` stays `null` — wall-clock and step count are the honest proxies until the harness provides it.
