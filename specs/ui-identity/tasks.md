# UI Identity — Tasks

- [ ] T1 [R1, P1] — The wordmark in `src/client/src/ui/screens.ts` and its rules in
  `src/client/src/ui/kit.ts`
  Test: `screens.test.ts` — the letters spell the name in order and carry colours drawn
  from `PLAYER_COLOURS`, not literals; `kit.test.ts` — the tilt is a CSS rule removed by
  `prefers-reduced-motion` while the letters stay, and no rule references an image

- [ ] T2 [R2, P2, P3] — `rollTo` in `src/client/src/ui/hud.ts`
  Test: `hud.test.ts` — writes only integers; **the final value is set before the
  animation starts**, so a card torn down mid-roll still reads correctly (asserted by
  running one frame and destroying it); a score that did not change is never animated;
  under reduced motion it lands immediately

- [ ] T3 [R2] — Drive it from the round and match cards in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — every row whose score changed rolls and every row that did
  not is untouched, over a roster where only some players scored

- [ ] T4 [R3, P4, P5] — The slot strip
  Test: `screens.test.ts` — strip and rows agree on the count for any roster including
  one with gaps; `kit.test.ts` — it is hidden under the very short tier, and the eight
  rows plus the room code still fit there (the `max-height:340px` measurement from
  RD-067 is what decides this, not preference)

- [ ] T5 [R4, P6] — An `out` row state, distinct from `gone`
  Test: `screens.test.ts` — a player eliminated in the round is marked on the card;
  `kit.test.ts` — `.row.out` and `.row.gone` differ in more than one property, so the
  two states cannot be confused

- [ ] T6 [R1, R2, R3] — Seen on a phone, at a full lobby and a full match
  Test: manual. Does the wordmark read at arm's length? Does the roll make the
  scoreboard legible or busy at eight players? Does the strip answer the question it
  exists for faster than counting rows?
