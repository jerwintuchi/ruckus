# Sweepers — Tasks

Depends on `specs/shell/` Phases A–C and the generic `prims` channel (RD-009).

## Phase A — shared primitives (both general, not Sweepers-specific)

- [x] T1 [R1] — `distPointSegment` in `src/shared/src/sim/vec.ts`
  Test: `vec.test.ts` — distance to an endpoint when the projection falls outside the
  segment; perpendicular distance when inside; zero on the segment; a degenerate
  zero-length segment behaves as point distance and never divides by zero

- [x] T2 [R8] — Optional `rotY` on the `box` and `cyl` members of `Prim`, honoured by
  the renderer
  Test: `render-prims.test.ts` — `rotY` sets the mesh's Y rotation; a prim without it
  is unrotated; existing prims are unaffected

## Phase B — the minigame

- [x] T3 [R1, R3, P1] — Bars, rotation and the ramp in
  `src/server/src/minigames/sweepers/index.ts`
  Test: `sweepers.test.ts` — angle advances by `speed * dt`; bars are added on schedule
  up to `BARS_MAX`; speeds and directions differ between bars; all seeded

- [x] T4 [R1, R4, P2] — The sweep hit test against height
  Test: `sweepers.test.ts` — a grounded player on the bar line is hit; the same player
  above `BAR_HEIGHT` is not; a player off the line is not hit at any height; the
  measured clearance window matches the computed arc to within a tick

- [x] T5 [R4] — Jumping: grounded-only, fixed arc
  Test: `sweepers.test.ts` — airtime and peak match `JUMP_SPEED`/`GRAVITY`; a second
  jump mid-air is refused; holding the button does not hover or extend the arc

- [x] T6 [R2, R5, P3] — Walls, and no safe spot
  Test: `sweepers.test.ts` — property: with zero input every player is eliminated and
  the round ends, over 200 seeds; a player parked exactly at the centre is still hit;
  a player driven at each wall stays inside the bounds

- [x] T7 [R6] — Placement, scoring, same-tick ties
  Test: `sweepers.test.ts` — 3/2/1 by placement; two players hit on the same tick share
  the better placement; no player scores above 3; monotonic in elimination order

- [x] T8 [R7] — Determinism
  Test: `sweepers.test.ts` — property: same seed + same recorded inputs → identical bar
  angles, placement and positions, over 200 seeds

- [x] T9 [R8, P4] — `snapshot()` prims + `arena()`; register in the server registry
  Test: `sweepers.test.ts` + `registry.test.ts` — one prim per bar, rotation matching
  the bar's angle; the arena publishes its walls as solids; contract preconditions hold

## Phase C — close

- [x] T10 — Played for real: clients over the wire, a round watched end to end, and the
  round duration checked against the figure RD-011 set
  Test: manual smoke run — four clients, all three minigames rotating, bars arriving as
  rotated prims on the generic channel (76 frames with `rotY` set), 4 solids + 6
  statics, zero errors. Duration measurement produced RD-014, three tunings deep.
