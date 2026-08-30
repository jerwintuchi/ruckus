# Hot Potato — Requirements

> **Rule (the whole explanation the party gets):** *Pass the bomb before it goes off.*

The second minigame, and the real test of whether the plugin contract generalises.
It is deliberately chosen to exercise the parts Falling Floor left untouched:
`stick+button` input, walled arenas (`solids`), player-to-player contact, and a
snapshot that needs a dynamic visual the client has never seen.

## The bomb

**R1**: As a player, exactly one of us holds the bomb, and touching another player
passes it to them.
- AC: exactly one holder exists at all times while more than one player is alive
- AC: contact is body-circle overlap, tested against every living player each tick
- AC: the holder is chosen deterministically at round start from the seed

**R2**: A pass cannot immediately bounce back.
- AC: for `PASS_LOCK_MS` after a pass, the new holder cannot pass to anyone
- AC: the player who just passed cannot receive again for that same window
- AC: property — no two passes between the same pair occur within `PASS_LOCK_MS`

**R3**: When the fuse reaches zero, the holder is out and a new fuse starts.
- AC: the holder at zero is eliminated and pushed onto the placement order
- AC: the bomb passes to the nearest surviving player, deterministically
- AC: each successive fuse is shorter, floored at `FUSE_MIN_MS`
- AC: the round does not end on an explosion unless one player remains

## Movement

**R4**: As a player, the button dashes me, on a cooldown.
- AC: `input` is `stick+button`
- AC: a dash lasts `DASH_MS` and multiplies my speed by `DASH_SPEED_MUL`
- AC: dashing again is refused until `DASH_COOLDOWN_MS` has passed
- AC: holding the button does not chain dashes; it is edge-triggered

**R5**: The arena is enclosed, so nobody can run away forever.
- AC: four walls are published as `solids` in the arena descriptor
- AC: property — a player driven at a wall for 10 s never leaves the arena bounds
- AC: there is no ground to fall through; elimination is by fuse only

## Round shape

**R6**: The round ends when one player remains, or at the hard timeout.
- AC: scoring is placement-based, 3 / 2 / 1, tie-aware, as in `falling-floor`
- AC: the round ends within `maxDurationMs` with zero input from anyone
- AC: a disconnected player is still a valid bomb target and can still be eliminated,
      so a dropout cannot freeze the fuse (I8)

**R7**: The round is deterministic given its seed.
- AC: property — same seed + same input sequence → identical holder, fuse and positions

## Rendering

**R8**: The minigame adds no client code and no assets.
- AC: the bomb is published as a `Prim` in the snapshot and drawn by the generic
      renderer; `src/client/src/minigames/hot-potato.ts` does not exist
- AC: `kit_check.py --check` stays green
