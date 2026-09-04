# Round Open — Requirements

> **Read the rule, see the arena, then go.** The rule card, a unanimous skip, and a
> countdown over a world that is already on screen but not yet moving (RD-108).

*Supersedes part of `round-brief`: the card and the 3-2-1 exist, but the count currently
runs over a card rather than over the arena, so the first thing a player sees when the
round starts is a surprise.*

## Requirements

**R1**: The round opens in two beats, not one.
- AC: **the brief comes first, alone.** The minigame's name and its one-sentence `rule`,
      verbatim (minigame-contract rule 1), on a card, with **no countdown on it**
- AC: it names the round — "round 3 of 5" — so a player knows where the match stands
- AC: a fixed dwell of ~4 s, which is the vision's five-second budget (pillar 1)
- AC: **then the card goes away**, and only then does the count begin. A player is told
      what is coming, and afterwards told when it starts — never both at once

> **Why sequential.** The first build ran the count inside the rule card, so the numbers
> pulled the eye while the sentence was still being read, and the card was still covering
> the arena when it hit zero. Reading and preparing are two different jobs and each wants
> the screen to itself. This is the Mario Party shape, and it is the shape because it
> works: brief, clear, count, go.

**R2**: The room can skip the brief together.
- AC: any player may tap to skip; the brief ends when **every connected player** has
- AC: it shows the count — "3 / 8 ready to skip" — so tapping feels collective
- AC: **skipping skips the BRIEF, never the count.** Getting to the round faster must
      never mean arriving at it unprepared — the 3-2-1 is the part that makes a player
      ready, and it is the same length for everyone, always
- AC: **it cannot stall.** The brief's dwell always expires on its own, so unanimity only
      ever ACCELERATES it (I8: a round's progress never requires every player to act)
- AC: a disconnected player is not counted in the denominator
- AC: a spectator waiting for the next round may skip too — they are in the room

**R3**: The countdown runs over the arena, with nothing in front of it.
- AC: when the brief clears, the **arena is on screen** — geometry, players in their spawn
      positions, the HUD — with the simulation not yet running
- AC: 3-2-1 counts over that, so the last thing before movement is the world itself
- AC: **no card, banner or scrim covers the arena during the count.** Its design is
      `round-countdown`; what this spec requires is that the arena is not hidden by it
- AC: the count is a fixed three seconds and is **not skippable**
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
