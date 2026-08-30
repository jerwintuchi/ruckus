# Shell — Tasks

Chain: R# → design → T# → named test → implementation → tick in the same commit.

## Phase A — shared foundation

- [x] T1 [R7, P5] — Seeded RNG in `src/shared/src/sim/rng.ts` (mulberry32)
  Test: `rng.test.ts` — property: same seed → identical sequence over 10k draws; two
  different seeds diverge within 4 draws; `next()` is always in [0,1)

- [x] T2 [R9] — X/Z vector helpers in `src/shared/src/sim/vec.ts`
  Test: `vec.test.ts` — clamp-to-unit-disc leaves |v|<=1 untouched and maps |v|>1 to
  exactly 1; add/scale/len algebraic identities

- [x] T3 [R9, P6, P7] — `stepMovement` + circle-vs-AABB in `src/shared/src/sim/move.ts`
  Test: `move.test.ts` — property: resolution is idempotent over 1000 random states;
  a body at MAX_SPEED never crosses a 0.5 m solid; input of magnitude 9 is clamped,
  not rejected; height integrates and lands exactly at floor

- [x] T4 [R8, P3] — Quantization in `src/shared/src/quant.ts`
  Test: `quant.test.ts` — property: `dequant(quant(x))` within 5 mm for |x|<100;
  angle round-trip within one 1/255 step

- [x] T5 [R6] — `Minigame`, `TickCtx`, `ArenaDescriptor` types in `src/shared/src/minigame.ts`
  Test: `minigame.test.ts` — a compile-level conformance fixture implements the
  interface and type-checks; `ArenaDescriptor` primitives are a closed union

- [x] T6 [R1, R8] — Protocol tags + payload types in `src/shared/src/protocol.ts`
  Test: `protocol.test.ts` — every client tag has a validator; a malformed payload of
  each tag is rejected without throwing

## Phase B — server shell

- [x] T7 [R1, R2] — Room + roster in `src/server/src/room.ts` (codes, colours, slots)
  Test: `room.test.ts` — codes avoid I/O/0/1; 9th join is ROOM_FULL; colours unique;
  reconnect reuses slot and score

- [x] T8 [R4, P1, P2] — Match state machine in `src/server/src/match.ts`
  Test: `match.test.ts` — the full state sequence for a 2-round match; no client
  message causes a transition directly; a round with zero connected players ends at once

- [x] T9 [R4] — Shuffled-bag minigame selection in `src/server/src/select.ts`
  Test: `select.test.ts` — no repeat until the bag empties, over 100 seeded draws;
  same seed → same order

- [x] T10 [R5, R8, P8] — Fixed-timestep tick loop in `src/server/src/loop.ts`
  Test: `loop.test.ts` — a 1 s stall yields at most 5 steps; 20 steps per simulated
  second; the deadline fires with zero input (R5)

- [x] T11 [R6, P4] — Minigame registry in `src/server/src/minigames/index.ts`
  Test: `registry.test.ts` — every registered minigame satisfies the contract shape,
  has a one-sentence rule, a listed input scheme, and a maxDurationMs > 0;
  **module-graph test**: nothing under `minigames/` imports `match.ts`/`room.ts`/transport

- [x] T12 [R1, R3, R10] — WebSocket transport + handlers in `src/server/src/net.ts`
  Test: `net.test.ts` — non-host START is NOT_HOST; malformed INPUT is dropped and
  answered on that socket only; 1000 inputs in one tick collapse to the latest

## Phase C — client

- [x] T13 [RD-004, P9] — Net + snapshot interpolation in `src/client/src/net.ts`
  Test: `interp.test.ts` — renders at now-100 ms; never extrapolates past the newest
  snapshot; holds last frame when starved rather than guessing

- [x] T14 [RD-005] — Kit: palette + primitive builders in `src/client/src/kit/`
  Test: `palette.test.ts` — 8 player colours are pairwise distinct in CIE ΔE and stay
  distinct under deuteranopia and protanopia simulation

- [x] T15 [RD-005] — Procedural character animation in `src/client/src/kit/actor.ts`
  Test: `actor.test.ts` — bob/lean/squash are pure functions of (velocity, height,
  time); lean is clamped; output is finite for extreme inputs

- [ ] T16 [R8] — Scene + fixed camera from `ArenaDescriptor` in `src/client/src/render.ts`
  Test: `render.test.ts` — every primitive kind in the union builds a mesh; geometries
  and materials are shared, not allocated per instance
  **OPEN: the implementation exists and runs, but the test does not.** It needs a WebGL
  context, so it wants a browser test environment this repo has not set up. Left open
  deliberately rather than ticked — the registry reports it as LIKELY-SHIPPED, which is
  exactly the right signal.

- [x] T17 [R10] — Virtual stick + keyboard in `src/client/src/input.ts`
  Test: `input.test.ts` — touch vector clamps to the unit disc; keyboard diagonals
  normalize; both produce the identical `InputState` shape

- [x] T18 — Lobby / intro / result screens in `src/client/src/ui.ts`
  Test: `ui.test.ts` — the intro screen renders the minigame `rule` verbatim; the
  result table orders by score descending; a player name is escaped rather than
  injected; **the room code is on screen** (RD-023) and the invite link copies, with a
  selectable fallback for the insecure-context case a phone on a LAN actually hits.
  A hand-rolled DOM stub turned out to be enough — no jsdom needed after all.

## Phase D — close

- [x] T19 — `pnpm check` green (context budget, kit, spec registry) and wired in CI
  Test: `check.test.ts` — each of the three tools exits 0 on a clean tree and
  non-zero on a seeded violation
