# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `15397d1`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-04 23:04 · branch `main` ·
HEAD `15397d1` — fix(tools): a fresh handoff is not one commit stale — RD-120 · 3 uncommitted file(s)*

*prose-at `271bca3`*

## What I was doing

Built the session-continuity harness (RD-120): tools/resume.py behind a SessionStart hook, prose-at staleness stamping, /health occupancy, .ruckus-room, and tools/shots.py — a fixed 7-scene set captured by drive.mjs and published as an artifact.

## What is half-finished

Nothing. pnpm verify green (1196 tests, 61 files); 6 guards and 4 selftests green; both artifacts republished.

## The very next action

round-status is the next unbuilt spec — resume.py already names T1 and its test. Then mutators, then main-menu.

## Gotchas

The SessionStart hook only fires on a NEW session, so its first real run is the next one. Screens artifact: 5a34f063 (republish with --page --embed, never commit the embedded copy). Room code is in .ruckus-room, not /health — /health reports counts only, on purpose. Never pkill -f a pattern in your own command line; use ps+awk. Editing src/server or src/shared restarts the watched server and drops every live room.

## Uncommitted when this was written

- `docs/DECISION_LOG.md`
- `docs/technical/shots.html`
- `tools/shots.py`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
