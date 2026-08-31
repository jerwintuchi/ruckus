# Spectating — Requirements

> **Watching is a state the game is in, not an absence of one.** Two thirds of a Hot
> Potato round is spent eliminated, and a player who joins mid-match waits a whole round
> before playing. Both were built as nothing happening.

*Written 2026-08-31, from playtest reports: "some of the bots are invisible in hot
potato", and "there's gotta be an indicator so players wouldn't feel bad waiting".*

**R1**: An eliminated player stays on screen.
- AC: their character remains drawn, in a muted form that reads instantly as *out* —
      not hidden, and not so faded it is mistaken for a rendering fault
- AC: the ink outline survives, because that is what makes a paper character legible
      at all (`visual-direction` R4)
- AC: they stop moving and stop casting a full shadow, so nobody mistakes them for a
      player still in the round
- AC: **`character.ts` said this already.** Its `setEliminated` carries the comment
      "eliminated players stay on screen — losing must be watchable" directly above the
      two lines that hide them (RD-048). The requirement is the comment; the code was
      the bug.

**R2**: A player waiting for the next round can see that something is happening.
- AC: the waiting card shows a live indicator — motion, not a static sentence
- AC: it says what is being waited for and roughly how far along it is, so the wait has
      a shape rather than being open-ended
- AC: it costs no new wire traffic: the client already knows the round and the match
      length
- AC: under `prefers-reduced-motion` the information stays and the motion goes

**R3**: Watching is never a dead screen.
- AC: the arena, the other players and the HUD stay live while spectating — losing is
      supposed to be worth watching (vision pillar 3), which requires something to watch
