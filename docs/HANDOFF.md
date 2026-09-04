# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `fab84e7`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-09-04 23:07 · branch `main` ·
HEAD `fab84e7` — fix(tools): the screens page must not restamp itself every commit — RD-120 · 1 uncommitted file(s)*

*prose-at `fab84e7`*

## What I was doing

Shipped the session-continuity harness (RD-120): tools/resume.py behind a SessionStart hook, prose-at staleness stamping, /health occupancy counts, .ruckus-room, and tools/shots.py — 7 fixed scenes captured by drive.mjs and published. Two follow-up fixes after it went in: a fresh handoff no longer reads as 1 commit stale, and shots.html no longer restamps itself every commit.

## What is half-finished

Nothing. pnpm verify green (1196 tests, 61 files), 6 guards, 4 selftests. Tree clean, both artifacts republished.

## The very next action

round-status, the next unbuilt spec — the resume brief already names T1 and the test it needs. Then mutators, then main-menu.

## Gotchas

A stack is UP: server+client, 4 bots on room LJ8V (autostart on, bot-1 host, code in .ruckus-room). Reuse it; never start a second. A driver client must click #readyBtn or bot-1 logs NOT_READY forever. Editing src/server or src/shared restarts the watched server and drops every live room. Never pkill -f a pattern that is in your own command line — use ps+awk (cost three shells this session). 'pnpm verify | tail' reports tail's exit code, not verify's.

## Uncommitted when this was written

- `docs/HANDOFF.md`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
