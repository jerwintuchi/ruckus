# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `beac682`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-30 20:11 · branch `master` ·
HEAD `beac682` — feat: Ruckus — the shell, the first minigame, and the guards that keep it cheap · 15 uncommitted file(s)*

## What I was doing

Built minigame #2, Hot Potato (specs/minigame-hot-potato, 11/11). It exercised everything Falling Floor did not: stick+button input, a walled arena using solids, player-to-player contact, and a dynamic visual. 187 tests green, pnpm check green, and a four-client match was played over the wire with both minigames rotating.

## What is half-finished

Nothing from hot-potato. Still open from earlier: specs/shell T16 (render.ts) and T18 (ui.ts) are implemented and working but have no tests, because both need a browser/DOM test environment. The registry flags them MISSING, correctly.

## The very next action

Minigame #3. The contract is now genuinely proven - Hot Potato needed ONE line in src/server/src/minigames/index.ts and zero client code. Good candidates from the original five: Scramble (pickups, scoring) or Sweepers (fake-height jump, moving hazards). Alternatively close T16/T18 with jsdom.

## Gotchas

Adding speedMul to stepMovement means a minigame that boosts players must build walls to minThicknessFor(speedMul), NOT the global MIN_SOLID_THICKNESS - hot-potato asserts this at module load. Falling Floor keeps a bespoke delta encoding via the client registry because 121 tiles as prims every tick would be ~100x the bytes; everything else should use the generic prims channel and need no client file. Round durations are measured in RD-011; do not lengthen a fuse ladder to hit a number.

## Uncommitted when this was written

- `LAUDE.md`
- `docs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/vision.md`
- `src/client/src/main.ts`
- `src/client/src/render.ts`
- `src/client/tsconfig.json`
- `src/server/src/minigames/index.ts`
- `src/shared/src/constants.ts`
- `src/shared/src/sim/move.test.ts`
- `src/shared/src/sim/move.ts`
- `specs/minigame-hot-potato/`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
