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

- [x] T4 [R4] — A duration on the wire (`inMs` in `src/shared/src/protocol.ts`), sent
  from `INTRO_MS` in `src/server/src/net.ts`, added to `performance.now()` in
  `src/client/src/main.ts`; and `countdownAt` waits rather than clamps
  Test: `hud.test.ts` — the same sequence at any clock offset including 1.7e12, stated
  alongside the assertion that an *instant* would NOT survive the same skew, so the fix
  cannot be undone quietly; every number holds for exactly one second, sampled at 10ms;
  the server sends the constant and no `Date.now()`. **Verified by reintroducing the
  bug:** two tests fail.
  *Two tests here previously pinned the defect. One was named "draws nothing in the
  first second of a 4s intro" and asserted that a 3 IS drawn — the name was right and
  the assertion was wrong. The other called clamping a defence against clock skew; it
  was what turned a phone one second fast into a phone that opened on "1".*

- [x] T5 [R4] — The round clock comes from the shell, in `src/server/src/match.ts`
  Test: `registry.test.ts` — no minigame declares `remaining` on its own snapshot, none
  declares a duration its own end condition undercuts, and the injection is asserted
  against `match.ts`; `scramble.test.ts` — its snapshot no longer carries a countdown
  and its `maxDurationMs` equals its `ROUND_MS`

