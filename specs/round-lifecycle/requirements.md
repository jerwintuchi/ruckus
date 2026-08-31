# Round Lifecycle — Requirements

> **A round begins from nothing.** Three playtest reports turned out to be one cause:
> state from a previous round, or from a round you were not in, arriving in the current
> one.

*Written 2026-08-31, from: floating pickups when joining mid-session; a player still
greyed and motionless a round after dying; and elimination reading as a stuck state
rather than an event.*

## What went wrong, exactly

Every minigame's `init` places players with `body.pos = …`. **None of them touch `y`,
`vy`, `grounded` or `vel`** — those are the shell's to own, and the shell was not
resetting them either. So a player who died by falling in `falling-floor` began the next
round at a correct x/z while thirty metres below the floor and still falling, was
eliminated on the first tick, and appeared greyed and frozen for the whole round.

**R1**: A round begins with every player in a clean state.
- AC: `y`, `vy`, `grounded`, `vel` and `facing` are reset by the **shell** at
      `beginPlay`, before `init` runs — position is the minigame's to choose, motion is
      not
- AC: no property of a body survives a round boundary
- AC: asserted directly: run a round, wreck every body, start the next, and check

**R2**: A spectator sees the round they are watching.
- AC: a player who joins during `ROUND_PLAY` receives the current arena, so what they
      watch is a game rather than pickups floating in an empty sky
- AC: they are still not *in* the round until the next `ROUND_START` (I8, RD-046) —
      seeing it and playing it are different things
- AC: nothing minigame-specific is added to the shell to achieve this

**R3**: Elimination is an event, not a state you get stuck in.
- AC: going out plays a **blink and vanish** — it reads as *that just happened*, which
      grey-and-remain did not
- AC: the animation is procedural and time-based, from the frame clock the character
      already receives
- AC: an eliminated body leaves the screen when the animation ends, so the arena shows
      who is still in
- AC: **it cannot outlive its round.** Whatever state elimination sets is gone when the
      next round starts

**R4**: Nothing from a previous round is on screen in the next one.
- AC: arena, tiles, prims, characters and controls are all replaced at `ROUND_START`
- AC: asserted against the source, since this is the class of bug the whole spec exists
      for
