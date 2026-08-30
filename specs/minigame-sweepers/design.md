# Sweepers — Design

Satisfies R1–R8. Lives in `src/server/src/minigames/sweepers/`.

## Phase A: two shared additions, both general

Neither is a Sweepers special case; both are things the next minigame will want.

1. **`distPointSegment`** in `src/shared/src/sim/vec.ts`. A sweeper is a line segment,
   not an AABB, so the existing circle-vs-box resolution cannot express it. Point-to-
   segment distance is the standard primitive for lasers, beams, ropes and walls that
   are not axis-aligned.
2. **`rotY` on the `Prim` union** (optional, on `box` and `cyl`). A rotating bar cannot
   be drawn by an axis-aligned box, and the alternative — approximating a segment with
   a chain of small boxes — is both uglier and far more prims. The field is optional so
   every existing prim is unchanged.

## Constants

| name | value | why |
|---|---|---|
| `ARENA` | 20 m square | room to run between two bars at the rim |
| `WALL` | 0.5 m | base speed only; nothing here boosts (`minThicknessFor(1)`) |
| `BAR_LENGTH` | half-diagonal | reaches every corner, so no spot is unswept (R2) |
| `BAR_HALF_WIDTH` | 0.2 m | plus `PLAYER_RADIUS`, a 1.2 m hit band — narrow enough to be jumpable (RD-014) |
| `BAR_HEIGHT` | 1.1 m | see the arc below; kept high so timing beats mashing |
| `BARS_START` | 1 | one thing to read on the first glance |
| `BARS_MAX` | 4 | past this the arena is noise, not a puzzle |
| `RAMP_MS` | 10000 | a new bar every ten seconds |
| `SPEED_MIN/MAX` | 0.5 / 0.9 rad/s | a rim sweep every 7–13 s (RD-014) |
| `GRACE_MS` / `ARM_MS` | 1500 | a bar warns before it kills (RD-014) |
| `maxDurationMs` | 75000 | hard stop (shell R5) |

**The arc, and why `BAR_HEIGHT` is 1.1.** With the shell's `JUMP_SPEED` 9.0 and
`GRAVITY` 26.0, a jump lasts 0.692 s and peaks at 1.558 m. Height clears a 1.1 m bar
between t=0.159 s and t=0.534 s — a **0.375 s window inside a 0.692 s airtime**, about
7.5 ticks of 13.8. That ratio is the whole game: jumping is not the skill, jumping *at
the right moment* is. A bar low enough to be cleared for most of the airtime would make
mashing the button a winning strategy, which fails vision pillar 5's implied converse —
chaos should beat mashing too.

## State

```ts
interface Bar { angle: number; speed: number }   // radians, radians/second
interface S {
  bars: Bar[];
  nextBarAt: number;        // elapsed ms at which bar count grows
  alive: Set<number>;
  roster: number[];
  placement: number[];      // elimination order, first out first
  elimAt: Map<number, number>;
  elapsed: number;
}
```

## Tick (20 Hz)

1. **Ramp** (R3). Past `nextBarAt`, push a new bar with a seeded angle, a seeded speed
   in `[SPEED_MIN, SPEED_MAX]` and a seeded direction, up to `BARS_MAX`.
2. **Rotate.** `angle += speed * dt`, wrapped. **P1**: angle advance depends only on
   `dt` and `speed`, so the sweep is frame-rate independent and reproducible.
3. **Move.** `stepMovement` with `jumpSpeed = JUMP_SPEED`, against the wall solids,
   ground constant 0. This is the first call site in the game to pass a real jump speed.
4. **Sweep.** For each living player, for each bar: hit if
   `distPointSegment(pos, centre, barTip) <= BAR_HALF_WIDTH + PLAYER_RADIUS`
   **and** `body.y < BAR_HEIGHT`. A hit eliminates.

**P2** (R1): the height test is `y < BAR_HEIGHT`, evaluated against the same `y` the
integrator produced — there is no separate "is jumping" flag that could disagree with
the body's actual height.

**P3** (R2): every bar spans centre→rim and sweeps continuously, so a stationary player
at any position is struck within one revolution — at most `2π/SPEED_MIN` ≈ 12.6 s, so
an idle lobby is eliminated well inside `maxDurationMs`.

**P5 — the governing invariant (RD-014).** A bar sweeps past a player standing at
radius `r` in `passageSeconds(ω, r) = 2·(BAR_HALF_WIDTH + PLAYER_RADIUS) / (ω·r)`, and
a player can only be above it for `clearanceSeconds()`. If the passage is longer than
the clearance, **the bar cannot be jumped at that radius at all**.

The counterintuitive consequence: **a slower bar is harder, not easier.** Slowing the
first tuning down to fix a different problem made 8 of 10 sampled radius/speed pairs
unavoidable. The tuning must keep `passageSeconds < clearanceSeconds` **at the rim**,
which is asserted at module load and in a test.

That yields a deliberate gradient rather than one answer everywhere:

| where | bar tip speed | the answer |
|---|---|---|
| rim | 7–12.7 m/s, above the player's 5.5 | cannot be outrun — **jump it** |
| middle | comparable to running speed | either, depending on the bar |
| pivot | crawling | cannot be jumped — **step aside** |

**Measured round length** (RD-011's target is 30–60 s): idle players last ~9 s at eight
— a floor, not play — while a bot that holds the rim and times its jumps averages
**50 s at eight players and 39 s at four**. Rounds scale with skill, which is the point.

## Snapshot

```ts
{ bars: [{ angle, speed }], prims: [ /* one rotated box per bar */ ] }
```

Each bar is one `box` prim of length `BAR_LENGTH`, positioned at the segment midpoint,
with `rotY = angle`. **P4**: the drawn prim and the segment used for the hit test are
derived from the same `angle` in the same tick, so what a player sees is what hits them.

## Arena descriptor

Fixed camera `eye = (0, 27, 22)`, `look = origin`, `fov = 45` — the 20 m arena on
screen with no occlusion. `solids` carries four walls; `statics` carries the floor slab,
the walls, and a small centre marker so the pivot is readable.

## Client

**None.** Bars ride the generic `prims` channel, which is exactly the claim RD-009 was
supposed to buy. If Sweepers needs a client file, the channel is not general enough and
that is a finding, not an exception to be quietly made.
