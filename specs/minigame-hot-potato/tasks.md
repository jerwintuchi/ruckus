# Hot Potato — Tasks

Depends on `specs/shell/` Phases A–C.

## Phase A — the generalisations Hot Potato needs (RD-009)

- [x] T1 [R4] — Add an optional `speedMul` to `stepMovement` in `src/shared/src/sim/move.ts`
  Test: `move.test.ts` — a multiplier of 1 is identical to omitting it; 2 doubles the
  terminal speed; 0 pins the player; the tunnelling guard is asserted against the
  multiplied speed, not the base

- [x] T2 [R8] — Generic `prims` channel: renderer draws `snapshot().prims` each frame
  Test: `render-prims.test.ts` — every `Prim` kind builds; prims are rebuilt per frame
  without leaking meshes; an absent or empty `prims` is a no-op

- [x] T3 [R8] — Client minigame registry in `src/client/src/minigames/index.ts`; move
  Falling Floor's tile decoding out of `src/client/src/main.ts`
  Test: `client-registry.test.ts` — `main.ts` contains no minigame id; an unknown id
  renders via the generic path without throwing

## Phase B — the minigame

- [x] T4 [R1, R2, P1] — Holder, contact passing and the pass lock in
  `src/server/src/minigames/hot-potato/index.ts`
  Test: `hot-potato.test.ts` — contact passes; a pass-back inside `PASS_LOCK_MS` is
  refused; property: no pair exchanges twice inside the lock, over 200 seeds; the
  nearest eligible contact wins a three-way pile-up

- [x] T5 [R3, P4] — Fuse, explosion, elimination and reassignment
  Test: `hot-potato.test.ts` — the holder at zero is eliminated; the bomb moves to the
  nearest survivor; fuses shorten and floor at `FUSE_MIN_MS`; property: exactly one
  living holder whenever two or more are alive

- [x] T6 [R4, P2] — Dash: edge-triggered, timed, cooldown
  Test: `hot-potato.test.ts` — a held button dashes exactly once; a second dash inside
  the cooldown is refused; dashing raises distance covered over a fixed window

- [x] T7 [R5] — Walled arena and solids
  Test: `hot-potato.test.ts` — property: a player driven at each wall for 10 s stays
  inside the bounds, over 200 seeds; walls are thicker than `MIN_SOLID_THICKNESS`

- [x] T8 [R6, P3] — Placement, scoring and termination
  Test: `hot-potato.test.ts` — 3/2/1 tie-aware; property: the round ends with zero
  input from anyone, over 200 seeds; a disconnected holder still explodes (I8)

- [x] T9 [R7] — Determinism
  Test: `hot-potato.test.ts` — property: same seed + same recorded inputs → identical
  holder, fuse, placement and positions, over 200 seeds

- [x] T10 [R8] — `snapshot()` prims + `arena()`; register in the server registry
  Test: `hot-potato.test.ts` + `registry.test.ts` — the bomb prim tracks the holder;
  no client file exists for this minigame; contract preconditions hold

## Phase C — close

- [x] T11 — Played for real: two or more clients over the wire, a round watched end
  to end (the checklist item that caught RD-008)
  Test: manual smoke run — four clients, both minigames rotating, 2052 hot-potato
  snapshots, passes and explosions observed, every snapshot carrying exactly one bomb
  prim on the generic channel, zero errors. Follow-up measurement produced RD-011.
