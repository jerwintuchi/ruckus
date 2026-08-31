# Player Collision — Tasks

- [x] T1 [R1, R2, P1, P2, P3] — `resolvePlayerOverlaps` in `src/shared/src/sim/collide.ts`
  Test: `collide.test.ts` — no living pair ends closer than `2R`, over randomised
  pile-ups of 2–8 players and many seeds; the split is equal, so neither player of a
  pair moves further than the other; coincident players separate deterministically;
  eliminated players are ignored; the result is a pure function of its input

- [x] T2 [R3, P1] — Solids win: re-resolve against arena geometry after separating
  Test: `collide.test.ts` — a player shoved at a wall ends outside it, over every wall
  of a real arena and many approach angles; a player crushed between a wall and another
  player still ends outside the wall

- [x] T3 [R1] — Call it from the shell in `src/server/src/match.ts`, once
  Test: `match.test.ts` — two players spawned overlapping are separated by the shell
  without any minigame doing anything; **no minigame source calls it**, asserted, since
  a minigame that resolves collisions itself has taken on the shell's job

- [x] T4 [R3] — `hot-potato`'s contact tolerance
  Test: `hot-potato.test.ts` — two players resting against each other, separated by
  collision to exactly `2R`, still pass the bomb; the determinism property still holds
  over many seeds

- [ ] T5 [R2] — Shoving, played
  Test: manual. Can you push someone onto a cracking tile in `falling-floor`? Is that
  the best part of the round or the worst?
