# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `286c692`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-30 20:59 · branch `master` ·
HEAD `286c692` — feat(sweepers): minigame #3, and the shell bug two minigames walked past · 16 uncommitted file(s)*

## What I was doing

Built minigame #4, Scramble (specs/minigame-scramble, 11/11) - the first NON-elimination round: fixed 45s clock, nobody knocked out, scored by pickups collected. That difference forced the shared scoring helper to take a key function rather than a placement array. 279 tests green, all four minigames rotating over the wire.

## What is half-finished

Nothing from scramble. Still open from the start: specs/shell T16 (render.ts) and T18 (ui.ts) are implemented and working but untested, needing a browser/DOM test env. The registry flags them MISSING, correctly.

## The very next action

Minigame #5 is now genuinely cheap (server-only, one registry line), or close T16/T18 with jsdom. All five of the originally-planned minigames now ship except a co-op round - 'Hold the Line' would be the first shared-score round and would test the scoring helper again.

## Gotchas

RD-016: never call expect() inside a many-seed property loop - 80k matcher calls hit the 5s timeout under parallel load and the failure READS LIKE A REAL BUG (it claimed players escaped the arena). Collect violations, assert once. RD-017: check /health before trusting any smoke run; a stale server on port 3001 answered ok and served the previous build for a whole confusing debugging detour. RD-015: awardByRank ranks only who you pass it - Scramble filters to actual scorers because competition ranking would otherwise tie five non-collectors for second.

## Uncommitted when this was written

- `LAUDE.md`
- `docs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `src/server/src/check.test.ts`
- `src/server/src/main.ts`
- `src/server/src/minigames/falling-floor/index.ts`
- `src/server/src/minigames/hot-potato/hot-potato.test.ts`
- `src/server/src/minigames/hot-potato/index.ts`
- `src/server/src/minigames/index.ts`
- `src/server/src/minigames/sweepers/index.ts`
- `src/server/src/minigames/sweepers/sweepers.test.ts`
- `src/shared/src/index.ts`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
