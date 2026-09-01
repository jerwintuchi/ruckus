# Find Yourself — Tasks

- [x] T1 [R1, R2, P1, P2, P4] — `setMine` on `Character` in
  `src/client/src/kit/character.ts`: a caret slab above the crown, sized from
  `BODY.height`, riding the existing bob
  Test: `character.test.ts` — a character built without it has the base mesh count and
  one with it has exactly one more (so `MESHES_PER_CHARACTER` stays honest); the caret
  is a child of the pivot, so it goes when the character does; its size is a function of
  `BODY.height` and not a literal

- [x] T2 [R1, R3, P1] — Pass `mine` through `Renderer.syncPlayers` in
  `src/client/src/render.ts` and hand it `mySlot` from `src/client/src/main.ts`
  Test: `render-prims.test.ts` — the call sits inside the character-BUILD branch and
  appears exactly once, so it cannot run per frame; the spectator slot `-1` is guarded;
  the caret takes the player's colour and not the accent fallback.
  *Asserted against the source, and said so rather than dressed up: `Renderer` makes a
  `WebGLRenderer` in its constructor and cannot be built without a GL context. The
  behaviour that matters — built once, idempotent, dies with the character — is covered
  in `character.test.ts` against a real `Character`, which needs no context at all.*

- [x] T3 [R2, P3] — The caret leaves with the player
  Test: `character.test.ts` — after `setEliminated` the caret is not visible at any
  point of the blink, asserted through the same `blinkVisible` the body uses rather than
  by a second timer

- [ ] T4 [R1, R2] — Found, on a phone, at eight players
  Test: manual, in Hot Potato, which is the round where losing yourself actually
  happens. Two questions only a person can answer: can you find yourself instantly, and
  at eight players is it eight carets' worth of noise?
