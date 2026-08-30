# Sweepers — Requirements

> **Rule (the whole explanation the party gets):** *Jump the sweepers.*

The third minigame, and the first to use the **jump**. `stepMovement` has carried a
`jumpSpeed` parameter since the shell shipped and no minigame has ever passed
anything but `jump: false` — an untested path in the most-used function in the game.

## The sweepers

**R1**: As a player, rotating bars sweep the arena and I jump over them.
- AC: each bar pivots at the arena centre and spans from the centre to the rim
- AC: a bar hits me when my body is within `BAR_HALF_WIDTH + PLAYER_RADIUS` of the
      bar segment **and** my height is below `BAR_HEIGHT`
- AC: jumping early or late still gets me hit — the clearance window is a fraction
      of the airtime, not the whole of it

**R2**: There is no safe spot, so standing still is never a strategy.
- AC: bars reach the exact centre, so the pivot is not a hub to camp
- AC: property — with zero input from anyone, every player is eliminated and the
      round ends, over 200 seeds

**R3**: The round gets harder as it goes.
- AC: it starts with `BARS_START` bars and adds one every `RAMP_MS`, up to `BARS_MAX`
- AC: every bar's angular speed is seeded, and speeds differ between bars so they
      converge and diverge rather than moving as one wall
- AC: bar directions are mixed, so the arena cannot be solved by running one way

## Movement

**R4**: As a player, the button jumps me, and only from the ground.
- AC: `input` is `stick+button`
- AC: a jump is only possible while grounded; holding the button does not hover
- AC: the jump arc is fixed — once airborne, input cannot extend or cut it
- AC: airtime is ~0.69 s and peak height ~1.56 m at the shell's `JUMP_SPEED`/`GRAVITY`,
      giving a ~0.38 s window over a `BAR_HEIGHT` of 1.1 m

**R5**: The arena is enclosed.
- AC: four walls are published as `solids`; nobody leaves the bounds
- AC: the floor is solid everywhere — elimination is by sweeper only, never by falling

## Round shape

**R6**: The round ends when one player remains, or at the hard timeout.
- AC: placement scoring, 3 / 2 / 1, tie-aware, as in the other two minigames
- AC: players hit on the same tick share the better placement
- AC: a disconnected player is still swept and eliminated, so a dropout cannot
      stall the round (I8)

**R7**: The round is deterministic given its seed.
- AC: property — same seed + same inputs → identical bar angles, hits and positions

## Rendering

**R8**: The minigame adds no client code and no assets.
- AC: bars are published as `Prim`s on the generic channel (RD-009)
- AC: a rotated box is expressible as a `Prim`; the union gains `rotY`, which is
      general rather than a Sweepers special case
- AC: `src/client/src/minigames/sweepers.ts` does not exist; `kit_check.py` stays green
