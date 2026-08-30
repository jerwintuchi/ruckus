# Shell — Requirements

The match scaffolding: rooms, the state machine, the minigame plugin contract, and
transport. Built once; every minigame rides on it for free.

## Rooms & joining

**R1**: As a player, I open a link, enter a 4-letter room code, and join that room.
- AC: a code is 4 letters from an unambiguous alphabet (no I, O, 0, 1)
- AC: joining a code with no room returns `ERROR:NO_ROOM`; the client stays usable
- AC: joining a full room (8) returns `ERROR:ROOM_FULL`
- AC: joining a room whose match is in progress is allowed; the player is a spectator
  until the next `ROUND_START` (I8)

**R2**: As a player, I get a stable colour and slot index for the whole match.
- AC: two players never share a colour in one room
- AC: a player's slot index is reused on reconnect within the same match, with score intact

**R3**: As the host (first player in the room), I start the match when ready.
- AC: only the host's `START` is honoured; a non-host `START` returns `ERROR:NOT_HOST`
- AC: `START` with fewer than 2 players returns `ERROR:TOO_FEW`
- AC: if the host leaves, the lowest-index remaining player becomes host

## Match state machine

**R4**: A match is N rounds, each a randomly chosen minigame, then a result.
- AC: states are `LOBBY → ROUND_INTRO → ROUND_PLAY → ROUND_RESULT → … → MATCH_RESULT → LOBBY`
- AC: no minigame repeats until every registered minigame has been played once
- AC: `ROUND_INTRO` shows the minigame's one-sentence `rule` for a fixed 4 s
- AC: every transition is server-driven; a client can never cause one directly

**R5**: A round always ends, even if every player disconnects or nobody acts.
- AC: `maxDurationMs` is a hard stop enforced by the shell, not the minigame
- AC: a round with zero connected players ends immediately and scores nothing
- AC: property — for any minigame, ticking with empty input for `maxDurationMs` terminates

## The minigame contract

**R6**: A minigame is a plugin the shell knows nothing specific about.
- AC: adding a minigame touches exactly one shell file (the registry) and no other
- AC: the shell calls only `init/tick/isOver/scores/snapshot/arena`
- AC: a minigame cannot read another minigame's state or the room's socket layer

**R7**: A round is deterministic given its seed and input sequence.
- AC: property — same seed + same recorded inputs → byte-identical snapshot sequence
- AC: no `Math.random()` anywhere under `src/server/src/minigames/` or `src/shared/src/sim/`

## Transport & simulation

**R8**: The server simulates at 20 Hz and broadcasts a snapshot each tick.
- AC: tick uses a fixed timestep with an accumulator; a slow tick never fast-forwards
  more than 5 steps (spiral-of-death guard)
- AC: snapshot positions are quantized to centimetres, angles to one byte
- AC: a snapshot carries no player names or strings — roster is sent once at `ROUND_START`

**R9**: Player movement resolves on the X/Z plane with a scalar height.
- AC: `stepMovement` clamps an input axis of magnitude > 1 rather than rejecting it (I2)
- AC: circle-vs-AABB resolution never tunnels at max speed over one tick
- AC: property — resolution is idempotent; re-resolving a resolved position is a no-op

**R10**: All client input is validated and cannot stall a round.
- AC: a malformed `INPUT` is dropped, the socket is told, the round continues
- AC: a client sending 1000 inputs/s is rate-limited to the latest input per tick
