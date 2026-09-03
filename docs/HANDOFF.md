# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `9b28cde`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-03 14:52 · branch `main` ·
HEAD `9b28cde` — docs: point Active Work at the bots, not the phone — RD-101, RD-102 · 1 uncommitted file(s)*

## What I was doing

input-prediction T8 on a phone — the last box that can invalidate RD-074. Instrumented it first: ?debug=1's predict line now reports corr / worst / snaps, so 'does a mispredicted shove read as rubber-banding' has a number behind it (snaps counts corrections too big to blend; it must stay 0). T8 was never reached, because the bots would not play properly.

## What is half-finished

NOTHING is half-written: the tree is clean and 1011 tests pass. What is unfinished is a DIAGNOSIS — the bots still play badly and the cause is not yet known. Two real bugs were found and fixed on the way (RD-101, RD-102) and neither cured it. Everything proven so far is about whether a strategy can READ the wire; nothing measures whether its play is any GOOD.

## The very next action

Find out why the bots play badly, then hand a room to the phone and do input-prediction T8. Watch one bot's decisions rather than re-reading its code: log what a strategy returns each think, next to where that bot is, for one round of hot-potato. Round scores (logged at roundEnd) do differentiate, so they are not idle — they are either choosing badly or their choices are not reaching the server.

## Gotchas

Three traps, each already paid for. (1) A join-probe RUINS the room it verifies: mid-match a disconnect reserves the slot (I8) and leaves an inert capsule that looks exactly like a dumb bot — verify from the bots' own join lines, never by joining. (2) Editing anything under src/server or src/shared trips node --watch and drops every live room; re-mint the code after any such edit. (3) ps -eo args | grep '[b]ots.mjs' matches the Bash tool's OWN command line and kills the shell — filter on comm=MainThread or use explicit PIDs.

## Uncommitted when this was written

- `ocs/HANDOFF.md`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
