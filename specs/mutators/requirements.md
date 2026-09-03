# Mutators — Requirements

> **The loser picks what happens next.** Whoever placed last in a round chooses the
> modifier the next round is played under (RD-108).

*The twist. Everything else in Ruckus is a competent party game; this is the part
somebody describes afterwards to a person who was not in the room.*

## Requirements

**R1**: As the player who placed last, I choose the next round's modifier.
- AC: the pick appears on the results card that is already on screen — no new screen
- AC: exactly one player is offered it: the lowest scorer of the round just ended
- AC: it is **one tap**, from a set of at most four, so it fits inside `RESULT_MS`
- AC: ties for last are broken deterministically by the seeded RNG, never by arrival
      order or slot number, so the same round always offers the pick to the same player

**R2**: The match never waits for that player.
- AC: if they do not choose before the results card ends, the server picks from the same
      set using `ctx.rng` and the round begins on time (I8 — a round's progress must
      never require a player to act)
- AC: a disconnected last-place player is skipped without a pause
- AC: an unchosen pick is indistinguishable, on the wire and in the next round, from a
      chosen one

**R3**: Everybody sees what was chosen, and who chose it.
- AC: the modifier's name and the chooser's name appear on the round card before the
      round starts — "GREASE, courtesy of sam"
- AC: a mutator that is active is legible from the arena within the five-second rule
      (vision pillar 1): moon gravity is visible in the first jump, grease in the first
      turn
- AC: the round card states it in one short phrase, in the same voice as a `rule` string

**R4**: A modifier is a shell concern; no minigame knows one exists.
- AC: a modifier changes only values the shell already owns — gravity, speed multiplier,
      friction, character scale — and is applied where the round timer and quantizer are
      applied, in `GameServer`, not in any `Minigame`
- AC: adding a modifier touches no file under `src/server/src/minigames/`
- AC: every existing minigame runs under every modifier without modification
- AC: a minigame that reads `speedMul` (Hot Potato's tumble) composes with a modifier that
      changes it, rather than being overwritten by it

**R5**: Determinism holds (I3).
- AC: the same seed, the same inputs and the same modifier produce the same round
- AC: the fallback pick is drawn from `ctx.rng`, never `Math.random()`
- AC: a modifier is part of the round's transcript, so a replay reproduces it

**R6**: No modifier can break a minigame.
- AC: every modifier's effect on `MAX_SPEED` keeps arena walls above
      `minThicknessFor(speedMul)` — a body must never cross a wall between resolutions
- AC: no modifier can make a round unwinnable or unable to end: `maxDurationMs` still
      terminates it, and elimination conditions stay reachable
- AC: modifier values are bounded constants, not free numbers

**R7**: No new assets (RD-001).
- AC: every modifier is expressed through existing Kit geometry and existing simulation
      constants
- AC: `python3 tools/kit_check.py --check` stays green

## The starting set

Four, deliberately small. Each is one number, each is legible in under a second, and each
is funny at eight players rather than merely different.

| Modifier | The one line | What it changes |
|---|---|---|
| **MOON** | "everyone floats" | `GRAVITY` down, `JUMP_SPEED` down to keep the arc landable |
| **GREASE** | "the floor is slippery" | `FRICTION` down |
| **HYPER** | "everyone is faster" | `speedMul` up for every player |
| **BIGHEAD** | "enormous heads" | character head scale up — cosmetic, and a hit box that is *not* changed |

**BIGHEAD is deliberately cosmetic.** A set of four modifiers that all change the physics
would make every round feel like a variant of the same round; one that changes only what
you see keeps the set from becoming homogeneous, and it is the funniest of the four.

## Not this spec

- **Stacking.** One modifier per round. Two at once is unreadable in five seconds and the
  interaction matrix grows as the square of the set.
- **Player-targeted modifiers.** "Slow down the leader" is a different, meaner game and it
  makes being ahead miserable rather than tense.
- **Modifiers chosen by the winner.** That compounds a lead; the whole point is the
  opposite (RD-108).
- **A modifier that adds geometry** — a new hazard, a new platform. That is a minigame's
  job, not the shell's, and it would breach R4.
