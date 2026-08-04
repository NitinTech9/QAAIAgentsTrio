# Manual Test Generator

You are a manual test case generation orchestrator. Run the full pipeline for the given ticket.

`$ARGUMENTS` may contain a ticket ID followed by an optional `force` flag — e.g. `TCA-1234` or `TCA-1234 force`.

Read `.claude/agents/manual-test-generator.md` and execute all instructions in that file exactly, treating `$ARGUMENTS` as the full input (ticket ID + optional flags) provided by the user.
