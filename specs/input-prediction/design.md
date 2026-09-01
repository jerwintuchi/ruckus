# Input Prediction — Design

Satisfies R1–R6. The model is the standard one: **prediction for yourself,
interpolation for everyone else, reconciliation to keep the server authoritative.**

## The loop

```
client, every TICK_MS            server, every tick              client, on snap
──────────────────────           ──────────────────              ───────────────
seq++                            apply newest input              drop acked inputs
pending.push(seq, input)   ──▶   record lastSeq[slot]            pos = snapshot pos
stepMovement(local, dt)          snapshot + ack=lastSeq   ──▶    replay pending
                                                                 blend the error
```

The client keeps a **body it owns** and steps it forward immediately. The server's
snapshot is not a thing to render, it is a thing to *correct against*.

## Data

```ts
interface Pending { seq: number; ax: number; ay: number; btn: boolean }
```

`Predictor` (`src/client/src/predict.ts`) holds:

| field | meaning |
|---|---|
| `body` | a shared `Body`, stepped by the shared `stepMovement` |
| `pending` | inputs sent but not yet acknowledged, oldest first |
| `seq` | the next sequence number to issue |
| `error` | the residual correction still being blended out, in metres |
| `solids` | the round's arena solids, from `roundStart` |
| `jumpSpeed` | from `roundStart` (R5) |
| `speedMul` | from the newest `snap` (R5) |

`pending` is capped at `MAX_PENDING = 64` — two seconds at 30 Hz. A client that
somehow outruns its acks discards the oldest rather than growing without bound, which
is what makes replay cost O(1) in the worst case rather than O(uptime) (R6).

## Wire changes

Three fields, all small, all additive:

| message | field | bytes | why |
|---|---|---|---|
| `input` | `seq: number` | ~10 | R2 — what the ack refers to |
| `snap` | `ack: number` | ~10 | R2 — **per connection**, not broadcast |
| `snap` | `sm: number` | ~9 | R5 — the receiving player's own speed multiplier |
| `roundStart` | `jumpSpeed: number` | ~16, once | R5 — predict the arc |

`snap` is already serialised **per connection** (`broadcast` loops over sockets and
calls `send` on each), so a per-client field costs no extra structure — only the two
numbers themselves.

**Bandwidth (R6).** ~19 B per snapshot at 30 Hz = **0.56 KiB/s** down per client, and
~10 B per input at 30 Hz = **0.29 KiB/s** up. Against the 41 KiB/s worst case measured
in `responsiveness` T4 that is **+1.4%**. This is the answer to "without sacrificing
bandwidth": the standard algorithm is cheap on the wire precisely because it moves work
to the client, not packets to the network.

### On RD-066

RD-066 removed a sequence number from `snap` because it was a wall-clock value nobody
read. The number added here is not that one: it is an acknowledgement the client acts
on every frame, and it is per-connection rather than shared. The lesson of RD-066 —
*do not put a field on the wire that no one consumes* — is respected, not reversed.

## Correctness properties

- **P1** — Replay is deterministic: the same authoritative state plus the same pending
  inputs yields the same predicted position, every time.
- **P2** — With no unacknowledged input, prediction equals the server's position
  exactly (up to quantisation). Prediction adds nothing when there is nothing to add.
- **P3** — Reconciliation is idempotent: applying the same snapshot twice leaves the
  same predicted position.
- **P4** — Replay cost is bounded by `MAX_PENDING`, never by session length.
- **P5** — `alive` is never written by the predictor (R4). Only a snapshot sets it.
- **P6** — The blend is time-based: the same correction over the same wall-clock
  duration lands identically at 30 fps and at 120 fps.
- **P7** — Prediction is inert when off (dead, spectating, off-roster): the rendered
  position is then bit-identical to the snapshot path.

## Correction blending (R3)

```
err = predicted − authoritative-after-replay
if |err| >= SNAP_DISTANCE:  err = 0                 # teleport: take it whole
else:                       decay err toward 0 over CORRECTION_MS
render at predicted − err
```

Constants (`src/shared/src/constants.ts`):

- `SNAP_DISTANCE = 2.0` m — further than any single tick of legitimate movement
  (`MAX_SPEED / TICK_HZ` is well under this), so only a genuine teleport trips it.
- `CORRECTION_MS = 100` — three snapshots. Long enough to be invisible, short enough
  that a shove does not feel mushy.

Decay is exponential and framerate-independent: `err *= exp(−dt / τ)`, τ derived from
`CORRECTION_MS`. Written as an exponential rather than a linear lerp so that P6 holds
without the client tracking when each correction started.

## What is predicted, and what is not

| | predicted | source |
|---|---|---|
| own x/z | **yes** | `stepMovement` + arena solids |
| own y (jump) | **yes** | `stepMovement` + `jumpSpeed` |
| own speed changes | **yes** | `speedMul` from `snap` |
| own `alive` | no | snapshot only (P5) |
| other players | no | interpolation buffer, unchanged |
| pickups, bomb, tiles | no | snapshot only |
| shoves, collisions with players | no | snapshot; mispredicts, then blends (R3) |

Player-vs-player resolution is deliberately absent. The client's view of other players
is 70 ms stale, so predicting a shove against it would be predicting from the wrong
input — the correction path is the honest way to handle contact, and contact is brief.

## Ground height

`stepMovement` takes a `groundHeight` callback. The client passes `() => 0` — a flat
plane. `falling-floor`'s holes are therefore not predicted: the local capsule keeps
standing until the server says otherwise. That is the correct failure. Falling is an
*outcome*, R4 forbids predicting outcomes, and the alternative is shipping tile state
into the predictor, which is exactly the minigame knowledge RD-009 keeps out.
