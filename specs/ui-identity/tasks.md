# UI Identity — Tasks

- [x] T1 [R1, P1] — The wordmark in `src/client/src/ui/screens.ts` and its rules in
  `src/client/src/ui/kit.ts`
  Test: `screens.test.ts` — the letters spell the name in order and carry colours drawn
  from `PLAYER_COLOURS`, not literals; `kit.test.ts` — the tilt is a CSS rule removed by
  `prefers-reduced-motion` while the letters stay, and no rule references an image

- [x] T2 [R2, P2, P3] — `rollTo` in `src/client/src/ui/hud.ts`
  Test: `hud.test.ts` — writes only integers; **the final value is set before the
  animation starts**, so a card torn down mid-roll still reads correctly (asserted by
  running one frame and destroying it); a score that did not change is never animated;
  under reduced motion it lands immediately

- [x] T3 [R2] — Drive it from the round and match cards in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — every row whose score changed rolls and every row that did
  not is untouched, over a roster where only some players scored

- [x] T4 [R3, P4, P5] — The slot strip
  Test: `screens.test.ts` — strip and rows agree on the count for any roster including
  one with gaps; `kit.test.ts` — it is hidden under the very short tier, and the eight
  rows plus the room code still fit there (the `max-height:340px` measurement from
  RD-067 is what decides this, not preference)

- [x] T5 [R4, P6] — An `out` row state, distinct from `gone`
  Test: `screens.test.ts` — a player eliminated in the round is marked on the card;
  `kit.test.ts` — `.row.out` and `.row.gone` differ in more than one property, so the
  two states cannot be confused

- [x] T6 [R5, P7] — `tint` and `readableInk` in `src/client/src/kit/palette.ts`
  Test: `palette.test.ts` — over **all eight** colours, computing real WCAG relative
  luminance rather than comparing to a fixture: ink on a 45% tint clears 4.5:1 for every
  one; `readableInk` clears 3:1 for every one; the raw colours are
  asserted **unchanged**, since they are load-bearing for colour-blindness; and the
  known failures are pinned as a regression — maroon at full strength is 1.72:1 and
  `forest` fails both ink and paper, which is why the tint exists at all

- [x] T7 [R5, P8, P9] — `--mine`, `--mine-tint` and `--mine-ink` on the root, set from
  `mySlot` in `src/client/src/main.ts`, spent by the controls
  Test: `kit.test.ts` — the three properties are declared once on `:root` with the
  highlight as the pre-slot fallback; no control names a player colour directly; and
  **no card, overlay, HUD, gauge or toast rule references them at all** (P10 — the scope
  is buttons, and that has to be a test rather than an intention);
  `screens.test.ts` — they are written when a slot arrives and not before

- [ ] T8 [R1, R2, R3, R5] — Seen on a phone, at a full lobby and a full match
  Test: manual, and **on more than one device at once** — the point of R5 is that two
  players see two different interfaces, which is the one thing a single phone cannot
  show. Does the wordmark read at arm's length? Does the roll make the scoreboard
  legible or busy at eight players? Does the strip answer its question faster than
  counting rows? And is the maroon player's interface as pleasant as the mint one, which
  is the case the contrast maths protects but does not judge?
