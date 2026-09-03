# Round Status — Requirements

> **Where do I stand?** One glance, during the round and after it. A clock that changes
> colour as it runs out, a count of who is left, the objective's own number — and a
> scoreboard between rounds that says what just happened.

*Partly exists: there is a round timer and a result card. Neither says enough, and the
timer says the same thing at 45 s as at 3 s.*

## Requirements

**R1**: A timed round shows a clock that is legible at a glance.
- AC: a clock icon with the seconds inside it, top-centre, clear of both thumb corners
- AC: its colour runs **green → yellow → orange → red** as the round runs out, so urgency
      is readable in peripheral vision without reading the number
- AC: the ramp is a function of the fraction remaining, not of absolute seconds, so a 45 s
      round and a 90 s round both go red at the same *felt* point
- AC: every colour comes from the palette (kit-rules); the ramp is not a raw hue sweep
- AC: it never ticks locally — the value is derived from the server's deadline (RD-065)

**R2**: A round without a clock shows what actually decides it.
- AC: an elimination round shows **players remaining**, not a timer, as its primary status
- AC: a collection round shows the count that decides it
- AC: which indicator a round uses is declared by the **minigame**, and the shell draws it
      — the shell must not know that `sweepers` is an elimination round (RD-009)
- AC: at most **one** primary indicator, plus at most one secondary; three numbers at the
      top of the screen is a dashboard, not a party game

**R3**: The indicator says when it changes.
- AC: a change worth noticing animates once — a player eliminated, the last ten seconds
- AC: the animation never obscures the arena and never moves the number's position
- AC: `prefers-reduced-motion` keeps the change and drops the movement

**R4**: Between rounds, a scoreboard says what just happened.
- AC: every player, every round, including anyone who scored zero (lobby-flow R13)
- AC: it shows **this round's points and the running total**, so a player can see both
      what they just earned and where that puts them
- AC: the change from the previous standing is visible — a row that moved up says so
- AC: the local player's row is distinct from everyone else's (`find-yourself`)
- AC: it is readable in the `RESULT_MS` it is on screen for, at eight players, on a phone

**R5**: None of it costs a per-tick byte it does not have to.
- AC: the status indicator's value comes from data the snapshot already carries wherever
      possible; a new per-tick field must be justified in numbers
- AC: the scoreboard is built from `roundEnd`, which is sent once, not from snapshots

**R6**: It holds at eight players on a phone.
- AC: eight rows fit the result card in landscape without scrolling the page
      (lobby-flow R13's rule, which the card already has to obey)
- AC: nothing sits under the notch or the home indicator

## Not this spec

- **The mutator pick.** It lands on this card, but it is `mutators` R1.
- **A match-long stats screen.** Ruckus is ten minutes; the story is told out loud.
- **Per-minigame HUD art.** The shell draws one indicator from a declared shape.
