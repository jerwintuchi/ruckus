# Round Brief — Tasks

- [x] T1 [R1, R2, P1, P2] — `countdownAt` in `src/client/src/ui/hud.ts`
  Test: `hud.test.ts` — counts 3, 2, 1 across the last three seconds of a 4s intro;
  returns 0 (draw nothing) in the first second and after the deadline; is clamped
  against clock skew in both directions, including an `endsAt` far in the past or
  future; is a pure function of its two arguments

- [x] T2 [R1, R3] — Render the count on the intro card in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — the rule is still rendered verbatim beside the number; the
  number changes as the deadline approaches; no number is drawn in the first second;
  under `prefers-reduced-motion` the number is still rendered and its animation removed

- [x] T3 [R1] — Drive it from the render loop in `src/client/src/main.ts`
  Test: `screens.test.ts` — the intro card updates without a new message arriving,
  asserted through the Ui's own API rather than a timer
