# Scramble — Requirements

> **Rule (the whole explanation the party gets):** *Grab the most before time runs out.*

The fourth minigame, and the first **non-elimination** round. The other three all
score by placement in an elimination order; Scramble scores by a quantity players
accumulate. Nobody is ever knocked out, so everybody plays the whole round — which is
also the friendliest round in the set, and a deliberate change of pace.

## Collecting

**R1**: As a player, pickups appear in the arena and I collect them by touching them.
- AC: a pickup is collected when my body centre is within `PICKUP_RADIUS + PLAYER_RADIUS`
- AC: collecting is instant and banked — there is nothing to carry and nothing to lose
- AC: a pickup can only be collected once, by exactly one player
- AC: when two players touch the same pickup on the same tick, the nearer one gets it;
      an exact tie breaks on slot, so it stays seeded

**R2**: Pickups keep appearing, at seeded positions, up to a cap.
- AC: a new pickup spawns every `SPAWN_INTERVAL_MS` while fewer than `MAX_PICKUPS` exist
- AC: spawn positions are drawn from `ctx.rng` — which requires RD-013's per-round
      stream, since this is the second minigame to draw randomness during `tick()`
- AC: pickups never spawn inside a wall, and never on top of an existing pickup
- AC: the arena starts with `START_PICKUPS` already on the floor, so the first five
      seconds are not empty

## Movement

**R3**: As a player, the button dashes me, and dashing into someone shoves them.
- AC: `input` is `stick+button`; the dash is edge-triggered with a cooldown, as in
      `hot-potato`
- AC: a dashing player who contacts another applies a shove impulse along their travel
- AC: a shove never removes points — this round has no way to lose what you banked
- AC: being shoved does not disable anyone; it only costs position, and therefore time

**R4**: The arena is enclosed.
- AC: four walls as `solids`, thick enough for the **dashing** speed (`minThicknessFor`)
- AC: property — a player dashing at any wall for 10 s stays inside the bounds

## Round shape

**R5**: The round runs for a fixed time and everyone survives it.
- AC: `isOver` is a clock, not a body count: it fires at `ROUND_MS`
- AC: no player is ever marked not-alive, so nobody spectates their own round
- AC: property — the round ends at `ROUND_MS` regardless of input, over 200 seeds
- AC: a disconnected player simply stops collecting; the round is unaffected (I8)

**R6**: Scoring ranks players by what they collected.
- AC: 3 / 2 / 1 to the top three counts, tie-aware, the same points scale as the other
      three minigames so a match stays balanced
- AC: players with equal counts share the better rank and push the next group down
- AC: a player who collected nothing scores zero, never a negative
- AC: property — no player scores above 3, and a larger count never scores less

**R7**: The round is deterministic given its seed.
- AC: property — same seed + same inputs → identical pickups, counts and positions

## Rendering

**R8**: The minigame adds no client code and no assets.
- AC: pickups ride the generic `prims` channel (RD-009)
- AC: `src/client/src/minigames/scramble.ts` does not exist; `kit_check.py` stays green
