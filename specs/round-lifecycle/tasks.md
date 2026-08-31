# Round Lifecycle — Tasks

- [x] T1 [R1, P1] — Reset every runtime in `beginPlay`, in `src/server/src/match.ts`
  Test: `match.test.ts` — wreck every body between rounds (airborne, falling at speed,
  sprinting, facing backwards, eliminated) and assert the next round starts clean;
  assert the reset happens **before** `init`, so a minigame's spawn is not overwritten

- [x] T2 [R2, P2] — Send the current arena to a mid-round joiner, in
  `src/server/src/net.ts`
  Test: `net.test.ts` — a socket joining during `ROUND_PLAY` receives a `roundStart`;
  it is **not** added to the round's roster (RD-046 holds); a socket joining in the
  lobby receives none

- [x] T3 [R3, P3, P4] — Blink and vanish in `src/client/src/kit/character.ts`
  Test: `character.test.ts` — the character is visible immediately after elimination,
  flickers during the window, and is gone after it; the blink is a pure function of
  elapsed time; a fresh character is never out

- [x] T4 [R4] — Nothing survives `ROUND_START`
  Test: `render-prims.test.ts` — the roundStart path replaces arena, tiles, prims,
  characters and controls, asserted against `main.ts`, because this is the exact class
  of bug the spec exists for

- [ ] T5 — Played across a death
  Test: manual. Die, then play the next round. Do you move normally, and does the
  previous round leave nothing behind?
