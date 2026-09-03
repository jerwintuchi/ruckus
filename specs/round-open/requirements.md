# Round Open — Requirements

> **Read the rule, see the arena, then go.** The rule card, a unanimous skip, and a
> countdown over a world that is already on screen but not yet moving (RD-108).

*Supersedes part of `round-brief`: the card and the 3-2-1 exist, but the count currently
runs over a card rather than over the arena, so the first thing a player sees when the
round starts is a surprise.*

## Requirements

**R1**: The rule card holds long enough to read and no longer.
- AC: the minigame's name and its one-sentence `rule`, verbatim (minigame-contract rule 1)
- AC: a fixed dwell of 4–5 s, which is the vision's five-second budget (pillar 1)
- AC: it names the round — "round 3 of 5" — so a player knows where the match stands

**R2**: The room can skip it together.
- AC: any player may tap to skip; the card advances when **every connected player** has
- AC: the card shows the count — "3 / 8 ready to skip" — so tapping feels collective
- AC: **it cannot stall.** The dwell always expires on its own, so unanimity only ever
      ACCELERATES the card. A player who never taps costs the room nothing beyond the
      normal dwell (I8: a round's progress never requires every player to act)
- AC: a disconnected player is not counted in the denominator
- AC: a spectator waiting for the next round may skip too — they are in the room

**R3**: The countdown runs over the arena, paused.
- AC: when the card clears, the **arena is on screen** — geometry, players in their spawn
      positions, the HUD — with the simulation not yet running
- AC: 3-2-1 counts over that, so the last thing before movement is the world itself
- AC: the controls are visible and inert during the count; a stick moved early does
      nothing and is not banked
- AC: the count is derived from the server's deadline, never ticked locally (RD-065)

**R4**: The paused world is the real one.
- AC: what is shown is the round's actual first snapshot — spawn positions, arena, prims —
      not a mock or a previous round's leftovers
- AC: no minigame animates during the count; a floor does not shudder, a bomb does not tick
- AC: the transition into play is instantaneous and has no dissolve — the world does not
      have to be re-recognised the moment it starts moving

**R5**: A mid-match joiner sees the same thing.
- AC: a player who arrives during a round waits, is told they are in from the next one
      (`spectating`, unchanged), and then sees the card and the count with everyone else
- AC: they count in R2's denominator only once they are on the roster

## Not this spec

- **Changing `RESULT_MS` or the score card.** That is `round-status`.
- **The mutator announcement on the card.** That is `mutators` R3; this spec only leaves
  room for it.
- **Per-minigame tutorials.** One sentence, or the minigame is wrong.
