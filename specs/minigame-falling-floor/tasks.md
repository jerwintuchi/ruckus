# Falling Floor — Tasks

Depends on `specs/shell/` Phase A + B (the contract must exist first).

- [x] T1 [R1, P1] — Tile grid + cumulative crack in `src/server/src/minigames/falling-floor/state.ts`
  Test: `falling-floor.test.ts` — crack accumulates across separate visits; two
  occupants crack at exactly twice the rate; a tile promotes solid→cracking→gone once

- [x] T2 [R2, P3] — Ground test + fall elimination in the same module
  Test: `falling-floor.test.ts` — a player straddling gone+solid survives; a player
  over only gone tiles falls and is eliminated below -3 m; eliminated players stop
  affecting crack

- [x] T3 [R4, P2] — Ring shrink schedule
  Test: `falling-floor.test.ts` — property: with zero input for every player, every
  tile is `gone` before `maxDurationMs`, over 200 seeds

- [x] T4 [R3, P4] — Placement + scoring
  Test: `falling-floor.test.ts` — 3/2/1/0 by placement; simultaneous eliminations
  share the better placement; total awarded never exceeds 6

- [x] T5 [R5] — Determinism
  Test: `falling-floor.test.ts` — property: same seed + same recorded input sequence
  → identical tile states and player positions, over 200 seeds

- [x] T6 [R6] — `arena()` + `snapshot()` delta encoding
  Test: `falling-floor.test.ts` — P5: replaying deltas onto the initial array
  reproduces the server array; the arena declares the fixed camera and no assets

- [x] T7 — Register in `src/server/src/minigames/index.ts`
  Test: `registry.test.ts` (shell T11) covers it — contract shape, one-sentence rule,
  input scheme `'stick'`, positive maxDurationMs, and no forbidden imports
