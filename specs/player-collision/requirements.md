# Player Collision — Requirements

> **Players are solid.** Today eight characters occupy the same square metre without
> noticing, and a chase is a formality.

*Written 2026-08-31.*

**R1**: Players cannot overlap, in any minigame.
- AC: two players never end a tick closer than `2 · PLAYER_RADIUS`
- AC: it is enforced **by the shell, once**, after `tick()` — not by each minigame. A
      minigame cannot forget it and a new one gets it for free, which is the same
      argument that keeps the round timeout in the shell (I8)
- AC: the minigame contract does not grow: no new method, no opt-in, no flag

**R2**: Pushing is how it feels.
- AC: walking into someone displaces you both, half the overlap each — you shove rather
      than stop dead
- AC: shoving works everywhere, including onto a cracking tile in `falling-floor`.
      Chaos beats balance (vision pillar 5), and being shoved off a floor is the kind
      of thing a room retells afterwards
- AC: only **living** players are solid; an eliminated body is not a wall

**R3**: Being solid must not break anything already tuned.
- AC: **nobody is ever pushed through a wall.** Solids win: after players are separated,
      each is re-resolved against the arena's geometry
- AC: `hot-potato`'s pass still fires when two players rest against each other. Its
      `CONTACT` is exactly `2 · PLAYER_RADIUS` today, which is precisely the distance
      collision now holds them at — a floating-point coin toss on the boundary of the
      round's central mechanic
- AC: determinism holds (I3): resolution is order-independent in result, and identical
      for the same inputs, over many seeds

**R4**: It costs nothing that matters.
- AC: 8 players is 28 pairs; the work is bounded and allocation-free per tick
- AC: no per-tick allocation in the resolution path
