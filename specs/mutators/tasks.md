# Mutators — Tasks

Every task cites its requirement and names its test before any implementation exists.

- [ ] T1 [R4, R7, P2] — The table and the identity, in `src/shared/src/mutator.ts`
  Test: `mutator.test.ts` — every `MUTATORS` entry has a label, an id and five finite
  multipliers; `NO_MUTATOR` has every multiplier exactly 1; ids are unique; no entry
  references a file path or an asset

- [ ] T2 [R6, P4] — Bound the set against arena thickness
  Test: `mutator.test.ts` — property: for every mutator and every registered minigame's
  arena, every wall clears `minThicknessFor(MAX_SPEED * m.speedMul * worstMinigameMul)`.
  Fails loudly if a future mutator raises speed past what the arenas can contain

- [ ] T3 [R4, P2] — Apply the modifier in the shell, in `src/server/src/net.ts`
  Test: `mutator-apply.test.ts` — a round under `NO_MUTATOR` produces a snapshot sequence
  identical to one with no mutator plumbing at all, over 200 seeds (the property that
  makes this safe to ship); and no file under `src/server/src/minigames/` is touched,
  asserted as a source-level policy guard the way `check.test.ts` guards the Kit

- [ ] T4 [R4, P3] — `speedMul` composes rather than replaces
  Test: `mutator-apply.test.ts` — a tumbling Hot Potato player under HYPER moves at
  `TUMBLE_SPEED_MUL * hyper.speedMul`; dividing the modifier out recovers the minigame's
  own value exactly

- [ ] T5 [R5, R6, P1, P5] — Determinism and termination under every modifier
  Test: `mutator-apply.test.ts` — property over 200 seeds × every minigame × every
  mutator: same seed + same inputs ⇒ identical final state, and a round with zero input
  still ends within `maxDurationMs`

- [ ] T6 [R1, R2, P6] — Choose the chooser, and the fallback, in `src/server/src/match.ts`
  Test: `pick.test.ts` — the lowest scorer is offered the pick; a tie for last resolves
  from `ctx.rng` and resolves identically for the same seed; a chooser who never answers
  gets an rng-drawn modifier and the round starts at the same tick as one who answered;
  a disconnected chooser is skipped with no pause

- [ ] T7 [R1, R2] — The `pick` and `pickMutator` messages, in `src/shared/src/protocol.ts`
  Test: `protocol.test.ts` — `pickMutator` is parsed and clamped; `pick` reaches only the
  chooser's socket; a pick from any other slot, in any other phase, or with an index not
  offered is ignored without mutating or broadcasting (I2); a repeated pick is ignored

- [ ] T8 [R2] — Spamming or malforming a pick cannot stall a round
  Test: `pick.test.ts` — 1000 malformed and out-of-turn `pickMutator` messages during
  `ROUND_RESULT` leave the transition time unchanged

- [ ] T9 [R1] — The pick card, in `src/client/src/ui/screens.ts`
  Test: `pick.dom.test.ts` — mounted: the chooser sees the options on the results card and
  nobody else does; tapping one sends exactly one `pickMutator` and disables the row; the
  card still closes on time if nothing is tapped

- [ ] T10 [R3] — Name the modifier and its author on the round card
  Test: `pick.dom.test.ts` — mounted: the round card shows the label and the chooser's
  name, escaped (a player-typed name must never inject markup); a round with no modifier
  shows neither and leaves no empty row

- [ ] T11 [R4, R7] — `bighead` scales the head only, in `src/client/src/kit/character.ts`
  Test: `character.test.ts` — the head's scale changes and the body's does not; the
  collision radius used by the server is unchanged (R6); no new geometry or material is
  allocated, asserted by the existing `materialCount`/`GEO` counters

- [ ] T12 [R3] — Played on a phone, at a full lobby
  Test: manual, and the question this spec actually risks. Is the pick FUNNY, or does it
  feel like being handed a chore in the two seconds you are reading the scores? Does the
  room look at the loser when the card appears? Can a player who was not paying attention
  tell what changed within five seconds of the round starting? If the modifiers read as
  arbitrary rather than funny, RD-108 names the reversal: shrink the set or make more of
  them cosmetic — **do not** move the pick to the winner.
