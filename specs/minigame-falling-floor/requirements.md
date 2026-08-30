# Falling Floor — Requirements

> **Rule (the whole explanation the party gets):** *The floor is falling. Don't be
> on it.*

The first minigame, and the proof that the shell's plugin contract is sufficient.
It is deliberately the simplest one that is still fun: movement only, no button.

**R1**: As a player, I stand on a grid of tiles; a tile I stand on cracks, then falls.
- AC: a tile cracks after `CRACK_MS` of cumulative occupancy, falls `FALL_MS` later
- AC: crack progress is per-tile and cumulative, not reset by stepping off
- AC: two players on one tile crack it at twice the rate

**R2**: As a player, when the tile under me is gone, I fall and am eliminated.
- AC: elimination is by *ground absence* under the body centre, not by tile id
- AC: an eliminated player is removed from simulation but keeps receiving snapshots
      (vision pillar 3 — losing must be watchable)

**R3**: The round ends when one player remains, or on the hard timeout.
- AC: last player standing scores 3, second 2, third 1, everyone else 0
- AC: simultaneous eliminations share the better placement; the next group is pushed
      down by the size of the tie (corrected in RD-006)
- AC: the round ends within `maxDurationMs` with zero input from anyone (shell R5)

**R4**: The arena shrinks so a stalemate is impossible.
- AC: after `SHRINK_START_MS`, the outermost surviving ring begins falling on a timer
- AC: property — with no player input at all, every tile is gone before `maxDurationMs`

**R5**: The round is deterministic given its seed.
- AC: property — same seed + same input sequence → identical tile and player states
- AC: initial spawn positions are seeded and never overlap

**R6**: The minigame uses only the stick, and adds no asset.
- AC: `input` is `'stick'`; no button is read
- AC: the arena is boxes only; `kit_check.py --check` stays green
