# Mutators — Design

## Data model

```ts
// src/shared/src/mutator.ts — shared, because the client draws the card and the
// server applies the effect. No game rules live here (I4): this is a table of
// numbers plus the words that describe them.
export type MutatorId = "moon" | "grease" | "hyper" | "bighead";

export interface Mutator {
  id: MutatorId;
  /** Shown on the round card. One short phrase, same voice as a minigame's `rule`. */
  label: string;
  /** Multipliers on the shell's own constants. 1 means "unchanged". */
  gravity: number;
  jumpSpeed: number;
  friction: number;
  speedMul: number;
  /** Purely visual; the collision radius is NOT scaled (R6). */
  headScale: number;
}

export const MUTATORS: readonly Mutator[];
export const NO_MUTATOR: Mutator;   // the identity: every field 1
```

The identity element matters. A round with no modifier — round 1, or a match where the
last-place player never chose — runs the *same code path* with `NO_MUTATOR`, so there is
no "with mutator" and "without mutator" branch to diverge. That is the same argument
RD-009 made for the generic prims channel.

## Where it is applied

In `GameServer`, beside the round timer and `encodeSnapshotExtra` — the places the shell
already owns and no minigame knows about (R4).

```
roundStart
  └─ pick = chosen ?? rng-fallback          (R2)
  └─ effective constants for this round:
       GRAVITY    * m.gravity
       JUMP_SPEED * m.jumpSpeed
       FRICTION   * m.friction
  └─ per player, per tick:
       runtime.speedMul = minigameSpeedMul * m.speedMul     (R4, composes)
```

`speedMul` **composes rather than replaces**. Hot Potato sets a tumbling player's
`speedMul` to `TUMBLE_SPEED_MUL`; under HYPER that player is faster still. Overwriting
would silently disable a minigame's own mechanic, which is the bug R4's last AC exists to
prevent.

## Correctness properties

- **P1 — Determinism.** Same seed + same inputs + same modifier ⇒ identical round.
  Asserted over many seeds, as every minigame already asserts (I3).
- **P2 — The identity is a no-op.** A round under `NO_MUTATOR` is bit-identical to a round
  played before this spec existed. This is the property that makes the feature safe to
  ship: it can be verified against the existing golden transcripts.
- **P3 — Composition.** For every minigame that sets `speedMul`, the effective value is
  the product, and the minigame's own value is recoverable by dividing out the modifier.
- **P4 — Thickness.** For every modifier and every arena, every wall clears
  `minThicknessFor(effectiveSpeedMul)`. A body must never step over a wall (R6).
- **P5 — Termination.** For every modifier and every minigame, a round with zero player
  input still ends within `maxDurationMs` (R6, I8).
- **P6 — No wait.** The round begins at the same instant whether or not a pick arrived
  (R2), and the fallback is drawn from `ctx.rng` (R5).

## Wire

Two messages, both small and both fixed-shape (I5).

```jsonc
// server -> the last-place player ONLY, on the results card
{ "t": "pick", "options": [0, 2, 3], "ms": 2500 }
// indices into MUTATORS, so no strings on the wire

// client -> server, the one tap
{ "t": "pickMutator", "i": 2 }

// server -> everyone, extending the existing roundStart
{ "t": "roundStart", ..., "mutator": 2, "mutatorBy": 4 }
// index into MUTATORS, and the slot who chose it; -1/-1 when there is none
```

`pick` goes to **one socket**, not the room. It is the only per-player message in the
protocol other than `snap`'s `ack`, and it is per-player for the same reason: it says
something true of the recipient and false of everyone else.

**Validation (I2).** `pickMutator` is rejected unless the sender is the round's designated
chooser, the phase is `ROUND_RESULT`, and `i` is one of the offered indices. On failure:
reply to that socket, mutate nothing, broadcast nothing. A malformed or repeated pick
cannot stall the round — the timeout owns the transition, not the message.

## Cost

Stated because a spec owes it (spec-workflow):

- **Wire.** `roundStart` grows by two small integers, once per round — under 20 bytes on a
  message that is already the largest in the protocol and is sent once. `pick` is a new
  message of about 40 bytes to one socket, once per round. Per-tick traffic is
  **unchanged**; no snapshot field is added.
- **Tick.** Three constant multiplications at round start, and one multiplication per
  player per tick for `speedMul` — which already exists as a multiply. Immeasurable.
- **Frames.** `bighead` scales an existing mesh. No new geometry, no new material, no
  extra draw call (RD-028's lesson: a draw call is the thing to count).

## What would reverse this

If playtests report the modifiers feel arbitrary rather than funny, shrink the set or make
more of them cosmetic. **Do not move the pick to the winner** — that compounds a lead,
which is the opposite of the intent (RD-108).
