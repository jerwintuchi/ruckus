# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `062e275`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-30 20:32 · branch `master` ·
HEAD `062e275` — feat(hot-potato): minigame #2, and the shell leak it exposed · 13 uncommitted file(s)*

## What I was doing

Built minigame #3, Sweepers (specs/minigame-sweepers, 10/10) - rotating bars you jump. First minigame to use the jump; stepMovement's jumpSpeed had never been exercised. 233 tests green, all three minigames rotating over the wire.

## What is half-finished

Nothing from sweepers. Still open from the start: specs/shell T16 (render.ts) and T18 (ui.ts) are implemented and working but untested, needing a browser/DOM test env. The registry flags them MISSING, correctly.

## The very next action

Minigame #4 (Scramble - pickups and scoring - is the last of the original five and would exercise per-player scoring rather than elimination), or close T16/T18 with jsdom.

## Gotchas

RD-014 is the big one: in Sweepers a SLOWER bar is HARDER, because passage time 2*(halfwidth+radius)/(omega*r) must stay under the jump clearance window or the bar is literally unavoidable. Do not slow the bars to make it easier. RD-013: Match now keeps ONE rng per round - never reconstruct makeRng inside a per-tick ctx, it hands every tick the same sequence. RD-012: size anything involving an arc against jumpArc(), which simulates; the textbook formula overstates the peak by 17% at 20Hz.

## Uncommitted when this was written

- `LAUDE.md`
- `docs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `src/client/src/render-prims.test.ts`
- `src/client/src/render.ts`
- `src/server/src/match.test.ts`
- `src/server/src/match.ts`
- `src/server/src/minigames/index.ts`
- `src/shared/src/minigame.ts`
- `src/shared/src/sim/vec.test.ts`
- `src/shared/src/sim/vec.ts`
- `specs/minigame-sweepers/`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
