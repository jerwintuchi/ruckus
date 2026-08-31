# Action Button — Design

Satisfies R1–R6.

## The verb travels per player

`MinigameSnapshot` gains an optional per-player action:

```ts
/** What THIS player's button does right now, and how ready it is. */
action?: { verb: string; readyIn?: number };
```

`verb` is a token — `tumble`, `pass`, `jump` — not a sentence and not a minigame id. The
UI maps a token to an icon and a label; it never learns which round is running (RD-009).
`readyIn` is seconds remaining, sent quantised to one decimal because that is all the
display shows.

Per player rather than per round is the whole point of R3: at the same instant the
bomb-holder's button says *throw* and everyone else's says *tumble*. `roundStart`'s
`buttonLabel` becomes the fallback for rounds whose verb never changes.

**P1** (R4): the UI renders a verb it is given. Asserted the way RD-009 already is —
no minigame id in the UI source, with the verbs themselves in the forbidden list.

**P2** (R6): the client displays `readyIn`; it runs no timer of its own. A client that
counted down independently would drift from the server that owns the cooldown.

## The throw

`hot-potato` gains a flying bomb:

```
throw: velocity along the holder's facing, THROW_SPEED, for THROW_MS
caught: the first living player within CONTACT of the bomb, nearest first
landed: after THROW_MS, the nearest living player takes it
```

The landing rule exists so a throw into an empty corner cannot stall the round (I8), and
because a bomb nobody can reach is not a fuse anyone can beat.

**P3** (R3): a thrown bomb always ends with a holder, over many seeds and every throw
angle — including a throw at a wall, and a throw with every other player dead.

## The tumble

`poseFor` gains a `tumbling` input: a full rotation about the character's X axis over
`DASH_MS`, driven by elapsed fraction. Procedural, forty lines, and it applies to every
minigame that uses the move — the same deal as bob, lean and squash.

## Icons

`src/client/src/ui/icons.ts`: a map of verb token to SVG path data, written by hand as
strings. No file, no dependency, no loader — the same reasoning as `textures.ts`. Three
paths to start: a tumbling arrow, a throwing arc, an upward chevron.
