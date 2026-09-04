# Round Countdown — Tasks

- [ ] T1 [R1, R6] — The disc, in `src/client/src/ui/kit.ts`
  Test: `countdown.dom.test.ts` — mounted: `#tick` carries the slab's three declarations
  (outline, ink border, hard shadow) as COMPUTED values; no hex literal appears in its
  CSS; it does not cover the viewport — the arena is visible around it

- [ ] T2 [R2, R7] — `deal` on arrival and `punch` on GO
  Test: `countdown.dom.test.ts` — mounted: setting a new digit re-triggers the entrance
  (the class is removed and re-added, so the animation actually replays); GO adds
  `punch`; under `prefers-reduced-motion` both are absent while the digit is unchanged

- [ ] T3 [R3] — The draining ring, reusing the cooldown construction
  Test: `countdown.dom.test.ts` — mounted: `stroke-dasharray` equals the circumference;
  the offset moves from 0 toward it across a second; the colour at 3, 2 and 1 walks
  ok → warn → hazard via `statusColour` and is never synthesised at the call site

- [ ] T4 [R5, P2] — The digit is the server's, not this device's
  Test: `countdown.test.ts` — property: for 1000 deadline/now pairs, `countdownAt` gives
  the same digit for two clocks differing by up to 999 ms; a deadline already past gives
  0, never a negative or a wrapped number

- [ ] T5 [R5, P5] — It always leaves, by every path
  Test: `countdown.dom.test.ts` — mounted: `play` clears it immediately even mid-digit
  (the unanimous-skip case); so does a round ending, a match ending and a disconnect.
  Asserted for each path rather than for the common one

- [ ] T6 [R6, P1, P3] — Nothing happens on a frame where the digit has not changed
  Test: `countdown.dom.test.ts` — mounted: with a MutationObserver watching `#tick`,
  driving 120 frames at an unchanged digit produces zero mutations (RD-084's lesson,
  asserted rather than hoped for)

- [ ] T7 [R4] — GO releases, and the arena is clear at the first playable instant
  Test: `countdown.dom.test.ts` — mounted: at zero nothing overlaps the arena; the
  existing countdown sound fires per number and once at GO, and no new voice is added

- [ ] T8 [R1-R7] — Seen on a phone, at a full lobby
  Test: manual, and the question this spec exists for: does the count make you *ready*,
  or is it decoration in front of the thing you are trying to look at? Watch someone
  else's first round — the tell is whether their thumb is on the stick at GO.
