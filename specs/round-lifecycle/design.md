# Round Lifecycle — Design

Satisfies R1–R4.

## The shell owns motion; the minigame owns position

`beginPlay` resets each runtime before handing the roster to `init`:

```
runtime.body.vel = 0        runtime.body.y = 0
runtime.body.vy  = 0        runtime.body.grounded = true
runtime.facing   = 0        runtime.alive = true
```

Then `init` places them. The split is the point: a minigame decides *where* a player
starts, and has no business remembering how fast they were moving in a game that has
already finished. Putting the reset in the shell means minigame five gets it free, the
same argument as the round timeout (I8) and player collision (RD-040).

**P1** (R1): after `beginPlay`, no body carries anything from the previous round.
Asserted by wrecking every body — mid-air, mid-fall, mid-sprint — and starting a round.

## Watching a round you are not in

On joining a room whose match is in `ROUND_PLAY`, the server sends that one socket the
current `roundStart`. It is the message it would have received had it been there, built
from the same `arena()` call, so nothing minigame-specific enters the shell.

**P2** (R2): the spectator is sent the arena but is *not* added to the round's roster —
the two were conflated before, which is what put a ghost at the arena's centre (RD-046).

## Elimination is an animation

`Character` records the frame time at which it went out and blinks from it:

```
alpha = blink(t - outAt)     visible/invisible in decreasing pulses
after OUT_BLINK_MS           the body leaves the scene
```

Time-based rather than frame-counted, so it looks the same at 60 and 120 Hz.

**P3** (R3): the blink is a pure function of elapsed time, and the character is gone
once it finishes.

**P4** (R3): elimination state is per-`Character`, and characters are rebuilt at
`ROUND_START` — so it cannot outlive its round by construction rather than by cleanup.

| name | value | why |
|---|---|---|
| `OUT_BLINK_MS` | 700 | long enough to register as an event, short enough not to be a wait |
| `OUT_BLINKS` | 4 | reads as a flicker rather than a strobe |
