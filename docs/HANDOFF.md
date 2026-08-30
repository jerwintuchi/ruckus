# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `e8bf4b9`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-30 23:49 · branch `master` ·
HEAD `e8bf4b9` — feat(scramble): minigame #4, the first round nobody loses · 7 uncommitted file(s)*

## What I was doing

Added the live playtest tooling: tools/playtest.sh (starts both servers, verifies /health and reports which minigames are served, prints every reachable URL, cleans up), tools/playtest.bat (Windows launcher), tools/lan-setup.ps1 (one-time port forwarding for phones). 279 tests still green.

## What is half-finished

Nothing. Still open from the start: specs/shell T16 (render.ts) and T18 (ui.ts) are implemented and working but untested, needing a browser/DOM test env.

## The very next action

Playtest it with real people - every tuning figure in the DECISION_LOG so far comes from bots. Then minigame #5 (a co-op round, Hold the Line) or close T16/T18.

## Gotchas

RD-018: pnpm dev:server and dev:client are WRAPPERS - the wrapper stays alive when node dies (so watch /health, not the PID) and killing the wrapper leaves vite holding 5173 (so cleanup reclaims ports by PID from ss). For phones: run tools/lan-setup.ps1 as Administrator ONCE, and again after any WSL restart because the WSL IP is reassigned. BOTH 5173 and 3001 must be forwarded - the page is on 5173 but the client dials ws://<same-host>:3001, and forwarding only one gives a lobby that never connects.

## Uncommitted when this was written

- `gitignore`
- `README.md`
- `docs/DECISION_LOG.md`
- `package.json`
- `tools/lan-setup.ps1`
- `tools/playtest.bat`
- `tools/playtest.sh`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
