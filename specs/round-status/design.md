# Round Status — Design

## The minigame declares, the shell draws

The shell must not learn that `sweepers` eliminates and `scramble` collects (RD-009 — the
generic prims channel exists because the shell had leaked once already). So the
`MinigameSnapshot` carries a small, closed status shape:

```ts
export type StatusKind = "clock" | "alive" | "count";

export interface RoundStatus {
  kind: StatusKind;
  /** The number to show. Seconds for `clock`, players for `alive`, items for `count`. */
  v: number;
  /** For `clock` and `count`: the value `v` started at, so a fraction can be drawn. */
  of?: number;
}
```

Three kinds, and the list is closed — a fourth is a decision, not a convenience. The
shell reads `kind` to choose a glyph and a ramp; it never reads the minigame's id.

`falling-floor` and `sweepers` return `alive`. `scramble` returns `count`. `hot-potato`
returns `alive` — the fuse is the bomb's own drama and does not belong in the corner.

## The colour ramp

A pure function of the fraction remaining, over palette stops:

```ts
statusColour(fraction: number): string   // 1 -> ok, 0 -> hazard
//  1.00 .. 0.50   ok        (green)
//  0.50 .. 0.25   warn      (yellow)
//  0.25 .. 0.10   caution   (orange)
//  0.10 .. 0.00   hazard    (red)
```

Fraction, not seconds (R1), so the same ramp fits a 45 s and a 90 s round. Stepped rather
than continuously interpolated: four named palette colours read as four states in
peripheral vision, where a smooth sweep reads as one colour that is slowly wrong. It also
keeps the palette closed — no colour is synthesised at a call site (kit-rules).

## Cost

`RoundStatus` is at most three small numbers on a message already sent every tick. Under
the `packPrims` regime a snapshot's fixed fields are the cheap part; measured against
RD-082's 1240 B budget this is **~15 B per snapshot**, or about 0.45 KB/s per client at
30 Hz. That is inside the margin RD-085's 57% saving created, and it is stated here
because a spec owes the number rather than the adjective.

The alternative — deriving status on the client — was rejected: it would put a copy of
each minigame's win condition in the client, which is exactly what I1 forbids and what
I6's "position versus outcome" line draws. **Status is an outcome.**

## The scoreboard

Built from `roundEnd`, which already carries `scores` and `totals` and is sent once. What
is new is *movement*: the client keeps the previous standing and renders the delta, so a
row that climbed says so. That is client-side presentation of data it already has — no
wire change (R5).

```
  ROUND 3 · SCRAMBLE

  ●  bot-1      +3    11   ▲2
  ●  jerwin     +1     5
  ●  sam        +0     4   ▼1      <- last: picks the next modifier
```

## Correctness properties

- **P1 — The shell never branches on a minigame id.** Source-level guard, like the one
  `controls.test.ts` keeps for RD-009.
- **P2 — The ramp is total.** `statusColour` returns a palette colour for every input in
  [0,1] and for values outside it (clamped), never `undefined`.
- **P3 — Every registered minigame declares a status.** A minigame with none is a round
  whose HUD is blank; the registry test catches it.
- **P4 — The scoreboard names everyone**, including zero scorers, at every player count
  from 2 to `MAX_PLAYERS` (lobby-flow R13, which regressed once already — RD-045).
- **P5 — No local ticking.** The clock's value comes from the snapshot; a client whose
  stream stalls holds the last value rather than counting down through the stall.
