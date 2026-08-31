# Spectating — Requirements

> **Watching is a state the game is in, not an absence of one.** Two thirds of a Hot
> Potato round is spent eliminated, and a player who joins mid-match waits a whole round
> before playing. Both were built as nothing happening.

*Written 2026-08-31, from playtest reports: "some of the bots are invisible in hot
potato", and "there's gotta be an indicator so players wouldn't feel bad waiting".*

**R1**: Going out is a visible event. *(Amended — see the note below.)*
- AC: elimination plays a **blink and vanish**, so it reads as *that just happened*
- AC: the body leaves once the animation ends, so the arena shows who is still in
- AC: whatever the animation sets cannot outlive its round

**Why this requirement was rewritten**, rather than quietly edited: it first said an
eliminated player "stays on screen, in a muted form". That came from reading vision
pillar 3 as being about the *body*. The pillar actually says *being eliminated is still
fun because you can see what happens next* — it is about what the eliminated **player
watches**, which is R3 below, and says nothing about whether their character remains.

Grey-and-remain shipped, was played, and read as a player *stuck* rather than a player
*out* (RD-049). The spec is amended in place because a requirement that disagrees with
the code is the failure mode that produced three separate bugs in one day — a netcode
invariant still claiming 20 Hz, a comment claiming the opposite of its own function,
and a test defending a leaderboard nobody was on.

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
