# Input Prediction — Requirements

> **Your own character should move on the frame you move your thumb.** Everything else
> stays exactly as it is.

*Written 2026-09-01, after the first real phone playtest. `responsiveness` cut the
budget from ~150 ms to ~112 ms + RTT by tuning rates. The player's verdict on the
result was "press feels much better now, but I want as little latency as possible".
Tuning has run out of road: 70 ms of what is left is the interpolation buffer, and no
rate change removes it.*

## Why this reverses RD-004

RD-004 ruled prediction out of v1, and `responsiveness` repeated the reason: it "puts a
copy of every minigame in the client, which I1 forbids". That reason is sound and this
spec does not dispute it. It simply does not apply to **position**:

- `stepMovement` and `resolveCircleAabb` already live in `src/shared/src/sim/`, and
  **I4 explicitly permits shared deterministic sim primitives** — "vector math,
  collision resolution, RNG". Predicting position runs the *same function the server
  runs*, not a second implementation of it.
- The arena's `solids` are already on the client: `ArenaDescriptor.solids` is typed
  `Solid[]`, the same shared type, and arrives at `roundStart`.
- **No minigame outcome is ever predicted.** Elimination, scoring, pickups, bomb
  passes and shoves stay server-only and arrive by snapshot, exactly as now.

So the client gains a copy of the *integrator*, which it is already allowed to have,
and gains no copy of any *rule*. That is the whole of the change.

## Requirements

**R1**: The local player's own capsule responds to the stick on the next rendered
frame, with no interpolation delay and no network wait.
- AC: own-player rendering does not read `INTERP_DELAY_MS`
- AC: with the socket closed mid-round, the stick still moves the local capsule —
      the proof that nothing in the path waits on the server
- AC: every other player is still rendered through the interpolation buffer, unchanged

**R2**: Prediction is reconciled against the server, which stays authoritative (I1).
- AC: every `input` carries a monotonically increasing `seq`
- AC: every `snap` carries the `seq` of the last input the server applied **for the
      client it is sent to**, and the field is per-connection, never broadcast as one
      shared value
- AC: on each snapshot the client discards acknowledged inputs, adopts the server's
      position, and replays only the still-unacknowledged ones
- AC: replay uses the same `TICK_DT` and the same shared `stepMovement` as the server,
      so an unmodified round reconciles to within quantisation error

**R3**: A misprediction is corrected smoothly, never as a snap.
- AC: a correction below `SNAP_DISTANCE` is blended over `CORRECTION_MS`, not applied
      in one frame
- AC: a correction at or above `SNAP_DISTANCE` is applied at once — a teleport, a
      respawn or a round boundary must not be smeared across the arena
- AC: the blend is time-based, so it behaves identically at any frame rate

**R4**: Prediction never invents anything the server did not say.
- AC: `alive` is never predicted; an elimination is only ever rendered from a snapshot
- AC: nothing minigame-specific is named, imported or branched on in the client
      (RD-009) — the parameters prediction needs arrive as generic movement numbers
- AC: while the local player is dead, spectating, or absent from the round's roster,
      prediction is off and the snapshot is rendered directly

**R5**: The parameters prediction needs are generic, and travel as numbers.
- AC: `roundStart` carries `jumpSpeed`, so the client can predict a jump arc without
      knowing which minigame has one
- AC: `snap` carries the receiving player's own `speedMul`, so a dash or a slow is
      predicted without the client knowing what caused it
- AC: neither field names a minigame, and the shell still knows nothing about any
      specific one

**R6**: The cost is measured, not assumed.
- AC: the added bandwidth is stated as a number, against the 41 KiB/s worst case
      `responsiveness` T4 already measured
- AC: the added per-frame CPU is stated — replay is bounded by the number of
      unacknowledged inputs, and that bound is asserted in a test

## Not this spec

- **Predicting other players.** They stay interpolated. That is the industry-standard
  split and it is what pillar 3 wants: the arena should read as what actually happened.
- **Rollback of minigame state.** Nothing about a round is re-simulated; only the local
  capsule's position is replayed.
- **Lag compensation** (rewinding the server to a client's view for hit tests). A
  different technique for a different problem, and this game has no hitscan.
