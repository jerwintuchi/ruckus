# Touch Controls — Tasks

Client and one optional contract field. No minigame's rules, collision or scoring
change; the input budget is drawn here, never widened.

- [x] T1 [R3, P4] — Add `buttonLabel?: string` to `Minigame` in
  `src/shared/src/minigame.ts` and declare it in the three `stick+button` minigames
  Test: `registry.test.ts` — every `stick+button` minigame declares a non-empty label;
  every `stick` minigame declares none; labels are short enough to fit the button
  (≤ 6 characters). The next minigame cannot forget, because the registry test fails.

- [x] T2 [R3] — Carry the label on `roundStart`
  Test: `protocol.test.ts` — the label round-trips on the wire beside `rule`;
  `hud.test.ts` — the UI renders the word it is given and **no minigame id appears
  anywhere in the UI source** (RD-009, the assertion T16 already makes)

- [x] T3 [R1, R2, P1] — The stick in `src/client/src/ui/controls.ts`
  Test: `controls.test.ts` — a resting base is rendered whenever a round is playable;
  the drawn centre and knob equal `stickView` exactly for a spread of touch positions,
  including beyond `STICK_RADIUS` where the knob clamps; with no touch the base is at
  rest and at `STICK_REST_OPACITY`; it renders in palette colours, never hex literals

- [x] T4 [R4, R5, P2, P3] — The button, with an honest hit area
  Test: `controls.test.ts` — `stick+button` renders exactly one button carrying the
  declared word; `stick` renders none (P3); the drawn element and the touch target are
  the same region (P2); the shortest side is at least 44 px and the button at least
  `BUTTON_MIN_PX`

- [x] T5 [R5] — `InputController` reads the button from the control, not from a screen
  fraction, in `src/client/src/input.ts`
  Test: `input.test.ts` — a touch on the button element sets `btn` and does not plant
  the stick; a touch on the bare arena still plants the stick and is still swallowed
  (RD-029 holds); the right of the screen now drives the stick too, which the 40% slab
  had made impossible; **no `innerWidth *` fraction remains in the touch source**,
  asserted against it with comments stripped.
  *Writing that first test found a real bug underneath: `read()` returned the button
  only on the stick's own path, so pressing it while standing still reported nothing.
  You had to be moving for the button to work — which Hot Potato hid, since you are
  normally running when you pass (RD-034).*

- [x] T6 [R5] — Controls inside the safe area
  Test: `controls.test.ts` — control positions carry `env(safe-area-inset-*)`; nothing
  sits under the home indicator. Coordinate with `arena-framing` T4, which does the
  same for the HUD; if both land at once this is one CSS pass, not two.

- [ ] T7 [R1, R2, R3] — Handed to someone who has never played
  Test: manual, on a phone. The question is exactly vision pillar 2: can a stranger be
  handed the phone mid-match and play the next round with no instruction? They must find
  the stick without being told it is there, and know what the button does before they
  press it. No unit test answers either half.
