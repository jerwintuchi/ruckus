# Round Status — Tasks

- [ ] T1 [R2, P1, P3] — `RoundStatus` in `src/shared/src/minigame.ts`, declared by each minigame
  Test: `registry.test.ts` — every registered minigame returns a `RoundStatus` whose
  `kind` is in the closed set and whose `v` is finite at tick 1, mid-round and at the end;
  a source-level guard that the shell branches on `kind` and never on a minigame id (P1)

- [ ] T2 [R1, P2] — `statusColour` in `src/client/src/kit/palette.ts`
  Test: `palette.test.ts` — property: returns a palette colour for 1000 fractions across
  [0,1] and for values outside it; the four bands are ordered ok → warn → caution →
  hazard; no colour is synthesised, every one is a named palette entry

- [ ] T3 [R1, R2, R3] — The indicator, in `src/client/src/ui/hud.ts`
  Test: `hud.dom.test.ts` — mounted: `clock` draws a clock glyph with the number inside;
  `alive` draws a player count; `count` draws the objective's number; at most one primary
  indicator is present at a time; the number's position does not move when it changes

- [ ] T4 [R3] — Change animates once, and stops
  Test: `hud.dom.test.ts` — mounted: a value change adds the animation class once and it
  does not re-add on an unchanged repaint (RD-084's lesson: a HUD rebuilt every frame
  never animates); under `prefers-reduced-motion` the new value is shown with no movement

- [ ] T5 [R1, P5] — The clock never ticks locally
  Test: `hud.dom.test.ts` — mounted: with no snapshots arriving, the displayed value HOLDS
  rather than counting down; the next snapshot moves it

- [ ] T6 [R5] — Measure what the status costs on the wire
  Test: `wire-hygiene.test.ts` — a snapshot carrying a `RoundStatus`, for every minigame at
  eight players, stays inside the 1240 B single-packet budget RD-082 established

- [ ] T7 [R4, P4] — The scoreboard, in `src/client/src/ui/screens.ts`
  Test: `scoreboard.dom.test.ts` — mounted: every player appears at every count from 2 to
  8, including zero scorers; this round's points and the running total are both shown;
  the local player's row is distinct; a row that climbed shows its movement

- [ ] T8 [R6] — Eight rows fit a landscape phone
  Test: `scoreboard.dom.test.ts` — mounted at eight players in a landscape viewport: the
  card bounds itself and scrolls INSIDE rather than growing off screen (the rule
  `kit.test.ts` already keeps), and nothing lands under a safe-area inset

- [ ] T9 [R1–R6] — Played on a phone, at a full lobby
  Test: manual. Two questions only a person answers: can you tell how long is left without
  reading the number? And when the round ends, do you know what just happened to you
  before the card disappears?
