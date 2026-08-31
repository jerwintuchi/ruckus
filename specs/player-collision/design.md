# Player Collision — Design

Satisfies R1–R4.

## Where it runs

`Match.tickPlay`, immediately after `game.tick(state, ctx)`:

```
game.tick(state, ctx)
resolvePlayerOverlaps(players, this.roundSolids)
```

The shell already holds every `PlayerRuntime` at that line, and the arena's solids are
static for the round — captured once in `beginPlay`, since the contract already says an
`ArenaDescriptor` is sent once at `ROUND_START`.

One call site is the whole point. Four minigames each remembering to call it is four
chances to forget, and minigame five would inherit the bug rather than the rule.

## The resolution

`src/shared/src/sim/collide.ts`

```
for pass in 0..PASSES:
  for each pair (a, b), a.slot < b.slot:
     d = |a.pos - b.pos|
     if d >= 2R: continue
     push each apart by (2R - d) / 2 along the axis
for each player: re-resolve against every solid
```

**P1** (R1, R3): after the call, no living pair is closer than `2R` **and** no player is
inside a solid. Solids win because they are resolved last — a shove into a wall stops at
the wall rather than passing through it.

**P2** (R2): the split is equal, so pushing is symmetric and a stationary player is not
an immovable object.

**P3** (R1): pairs are visited in slot order and the pass count is fixed, so the result
is a pure function of the input positions. Determinism (I3) is unaffected.

**Coincident players** — two bodies at exactly the same point have no axis to separate
along. The pair is nudged apart along a fixed axis derived from their slots, so the
outcome stays deterministic rather than depending on floating-point noise.

| name | value | why |
|---|---|---|
| `COLLIDE_PASSES` | 2 | one pass leaves residual overlap in a pile-up; two is enough at eight players and is still 56 distance checks |

## The hot-potato boundary

`CONTACT` is `2 · PLAYER_RADIUS` exactly, and collision now holds players at exactly
that distance. `d > CONTACT` on the boundary is a coin toss decided by the last bit of a
square root — on the central mechanic of the round.

`CONTACT` gains a small tolerance so that *resting against someone counts as touching*,
which is what the rule means and what a player expects. That is a tuning change to
`hot-potato`, made deliberately and tested, not a silent consequence.
