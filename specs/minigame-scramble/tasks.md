# Scramble — Tasks

Depends on `specs/shell/`, the generic `prims` channel (RD-009), and the per-round RNG
stream (RD-013) — this is the second minigame to draw randomness during `tick()`.

## Phase A — stop copying the scoring

- [x] T1 [R6] — `awardByRank(roster, keyOf)` in `src/shared/src/score.ts`
  Test: `score.test.ts` — 3/2/1 by descending key; ties share the better rank and push
  the next group down by the tie size; unranked players get 0; nobody exceeds 3; a
  larger key never scores less; an empty roster returns an empty record

- [x] T2 — Refactor `falling-floor`, `hot-potato` and `sweepers` onto it
  Test: their existing suites must pass **unchanged** — the refactor is behaviour-
  preserving or it is wrong

## Phase B — the minigame

- [x] T3 [R2, P3] — Pickup spawning in `src/server/src/minigames/scramble/index.ts`
  Test: `scramble.test.ts` — starts with `START_PICKUPS`; spawns on the interval up to
  `MAX_PICKUPS`; never inside a wall; never within `MIN_SPAWN_GAP` of another; the
  retry loop is bounded and cannot hang

- [x] T4 [R1] — Collection
  Test: `scramble.test.ts` — a player in range collects and the pickup disappears; the
  nearer of two claimants wins; an exact tie breaks on slot; a pickup is never counted
  twice; out of range collects nothing

- [x] T5 [R3, P1, P2] — Dash and shove
  Test: `scramble.test.ts` — a held button dashes once; a shove changes the target's
  velocity along the shover's travel; no shove ever changes anyone's count

- [x] T6 [R4] — Walls sized for the dashing speed
  Test: `scramble.test.ts` — `WALL >= minThicknessFor(DASH_SPEED_MUL)`; property: a
  player dashing at each wall stays inside the bounds, over 200 seeds

- [x] T7 [R5, P4] — The clock, and nobody eliminated
  Test: `scramble.test.ts` — property: the round ends at `ROUND_MS` for any input, over
  200 seeds; no player is ever marked not-alive; a fully disconnected lobby still ends

- [x] T8 [R6] — Scoring by count, through `awardByRank`
  Test: `scramble.test.ts` — most collected takes 3; equal counts tie and push the next
  group down; zero collected scores zero; no score above 3

- [x] T9 [R7] — Determinism
  Test: `scramble.test.ts` — property: same seed + same recorded inputs → identical
  pickups, counts and positions, over 200 seeds

- [x] T10 [R8] — `snapshot()` prims + `arena()`; register in the server registry
  Test: `scramble.test.ts` + `registry.test.ts` — one prim per live pickup, tracking
  its position; contract preconditions hold; no client file exists

## Phase C — close

- [x] T11 — Played for real: clients over the wire, the round watched end to end, and
  the spread of counts checked (a round everyone ties is not a round)
  Test: manual smoke run — 899 prim frames (exactly 45 s at 20 Hz), 14 pickups on screen
  at the cap, zero errors, all four minigames rotating. Contest measured offline with a
  greedy bot: ~68 pickups collected per round with a 25-point winner-loser gap, and
  greedy players beat idle ones 16.5 to 0.5. The run also produced RD-017.
