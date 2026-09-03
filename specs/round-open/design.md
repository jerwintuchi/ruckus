# Round Open — Design

## The shape of a round's opening

```
ROUND_INTRO                          ROUND_PLAY
├── rule card        4000 ms  ──┐
│   (skippable, unanimous)      │   ends early only on unanimity
├── arena revealed   ───────────┤   snapshot flowing, simulation NOT stepping
│   3 · 2 · 1        3000 ms    │
└──────────────────────────────►│   first tick
```

The important change is that **the arena is revealed before the count, not after it.** The
server already holds the round's state at `ROUND_INTRO`; what is missing is that it does
not yet broadcast it. It will — snapshots flow through the intro, with the simulation not
stepping. The client therefore draws a still, real world, and the countdown sits over it.

That reuses everything: interpolation holds a single frame happily (P9, it never
extrapolates), the renderer needs no "preview" path, and the transition to play is simply
the first tick arriving.

## Skip, counted on the server

```jsonc
{ "t": "skip" }                                   // client -> server, idempotent
{ "t": "intro", ..., "skips": 3, "of": 8 }        // server -> room, on change
```

`skip` is idempotent per player: tapping twice is tapping once. The server advances when
`skips === connectedOnRoster`, or when the dwell expires — **whichever comes first, and
the timer is authoritative.** That ordering is the whole of R2's no-stall guarantee, and
it is the same shape as I8's "always carry a timeout".

**Validation (I2):** only in `ROUND_INTRO`, only from a player on the roster or waiting in
the room. Anything else replies to that socket and mutates nothing.

## Inert controls

During the count the client draws the stick and button and reads neither. Not disabled —
**drawn and ignored**: a control that vanishes and reappears is a control a player has to
find twice. `predictor` stays stopped, so nothing is banked and there is nothing to
reconcile at the first tick.

## Correctness properties

- **P1 — The dwell is a ceiling.** For any pattern of skips, including none and including
  malformed ones, the intro ends at or before `INTRO_MS`. Never later.
- **P2 — Unanimity only accelerates.** The intro never lasts *longer* because of the skip
  feature than it did without it.
- **P3 — The denominator is connected players on the roster.** A disconnect during the
  intro cannot make unanimity unreachable.
- **P4 — Nothing is banked.** Input during the count produces no `seq` the server will
  acknowledge and no predicted movement.
- **P5 — The paused world is the round's own.** The frame drawn during the count is the
  round's first snapshot; a previous round's prims are never visible (RD-050).

## Cost

Snapshots during the intro are the one real cost: ~4 s of 30 Hz traffic per round that was
previously silent. At the sizes RD-085 left us that is roughly **120 snapshots × ~600 B ≈
70 KB per round**, or ~350 KB across a match, per client.

That is a real number and it buys a real thing: the boundary stops being dead air (RD-091
already made the world keep breathing between rounds for the same reason). If it proves
too expensive on a phone tethered to mobile data, the fallback is to send the intro's
snapshot **once** and let the client hold it — the interpolation buffer already holds a
single frame correctly, so this is a one-line change, not a redesign.
