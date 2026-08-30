# Visual Direction — Tasks

Render layer only. No minigame's geometry, collision or scoring changes; if a task
finds itself editing `src/server/`, it has gone wrong.

*Rewritten 2026-08-31 (RD-021). The retro-pass tasks are marked superseded in place
rather than deleted — the PS1 direction was a real decision and its reversal should be
legible, not tidied away.*

## Phase A — procedural paper

- [ ] T1 [R1, R2, P2] — The paper texture kit in `src/client/src/kit/textures.ts`:
  `stock`, `crease`, `deckle`, `flat`, `checker`, `stripe`, `dot`, `grid`
  Test: `textures.test.ts` — every generator returns a 64x64 `DataTexture` with
  `LinearFilter` and `RepeatWrapping`; generation is deterministic (byte-identical
  texels for identical arguments); the cache returns the same object for the same
  signature; `FIBRE_CONTRAST` keeps `stock()` inside a narrow tonal band, so it reads
  as paper rather than as noise

- [ ] T2 [R1] — Keep the Kit honest with the new capability
  Test: `kit-rules.test.ts` — `kit_check.py --check` is green with textures in play;
  a seeded `.png` and a seeded `TextureLoader` are each still rejected; `DataTexture`
  is not mistaken for a loader

- [ ] T3 [R8, P3] — The face generator in `src/client/src/kit/face.ts`
  Test: `face.test.ts` — `faceFor(slot)` is deterministic; the 8 slots produce 8
  pairwise-distinct texel arrays; every parameter stays inside its declared range;
  all linework lands inside the texture bounds for every slot

- [ ] T4 [R3] — Move the **arena** palette to paper stock in `src/client/src/kit/palette.ts`
  **Partly done:** the `PAPER` tokens exist and the interface uses them (T13). What
  remains is retargeting the *arena* tokens, which is deliberately held until Phases B
  and C convert the world — swapping the world's ground out now would leave the game
  half-converted with a bright sky over a dark Lambert-lit arena.
  Test: `palette.test.ts` — the 8 player colours are **unchanged** (RD-007's dichromacy
  search still holds); arena tokens are the new warm stock; every token is well-formed;
  `INK` contrasts at least 7:1 against every paper ground it outlines

## Phase B — outlines and materials

- [~] T5 — **SUPERSEDED by T8** (RD-021). Was: render-target sizing for the retro pass.
  There is no retro buffer; rendering is crisp and native.

- [~] T6 — **SUPERSEDED** (RD-021). Was: 15-bit quantization and ordered Bayer dither.
  Dithering exists to break up flat colour, and flat colour is the entire paper read.

- [~] T7 — **SUPERSEDED by T9** (RD-021). Was: flat shading plus per-arena distance fog.
  Fog dissolves edges; hard edges are the point. Characters are now unlit outright.

- [ ] T8 [R3, R4, P1] — Native crisp rendering and the outline strategy in
  `src/client/src/kit/paper.ts`
  Test: `paper.test.ts` — the pixel ratio is capped at 2; **no fullscreen pass and no
  depth-texture requirement exists in the render source** (P1, asserted against the
  source); a slab's edge faces resolve to `INK` while its front and back take the
  player colour; the opt-in inverted hull applies only to objects that request it

- [ ] T9 [R5, R6] — Materials: unlit characters, lightly-lit arena, paper surfaces
  Test: `paper.test.ts` — character materials are unlit; arena materials keep one soft
  light; no fog is ever set; no shadow map is ever enabled; `stock()` and `crease()`
  are applied to arena surfaces rather than flat colour

## Phase C — the character

- [ ] T10 [R7] — The slab humanoid in `src/client/src/kit/character.ts`
  Test: `character.test.ts` — every part is a slab of `SLAB_DEPTH` with `INK` edges;
  total height and footprint are unchanged from the capsule it replaces; the face
  texture lands on the head's front face; geometries and materials are shared, not
  per-instance; **the character is never camera-facing** — a billboard would remove
  the depth cue Sweepers and Hot Potato depend on

- [ ] T11 [R9, P4] — Hinged paper motion, extending `poseFor`
  Test: `actor.test.ts` — limbs hinge in counter-phase; the swing curve eases sharply
  at the extremes rather than sinusoidally (paper has no inertia); a turn rotates the
  slab enough to show its edge; the airborne pose differs from every grounded pose;
  every angle is finite for extreme inputs and is a pure function of its arguments

- [ ] T12 [R7, R13] — Readability with 8 on screen
  Test: manual capture at phone size, 8 characters, each arena — plus
  `character.test.ts` asserting the per-character mesh count stays within budget

## Phase D — the interface

- [x] T13 [R10, R11] — Panel, button and card primitives in `src/client/src/ui/kit.ts`
  Test: `kit.test.ts` — outline and hard offset shadow present (no blur radius);
  every interactive target is at least 44 px on its shortest side; accents resolve to
  the game's own player colours; the panel construction matches a character slab's,
  which is what makes the two read as one thing

- [x] T14 [R10] — Motion, and its reduced-motion path
  Test: `kit.test.ts` (the motion lives in the same stylesheet as the primitives, and
  splitting one small file's tests across two would be worse) — entrances overshoot
  and settle; under
  `prefers-reduced-motion` every animation is removed and **every piece of information
  is still rendered**

- [x] T15 [R12] — Screens: menu, join, lobby, intro, result, match result
  Test: `screens.test.ts` — the intro renders the minigame's `rule` verbatim; the lobby
  shows the room code and each player's colour, face and name; results order by points
  descending with ties stable

- [x] T16 [R12] — A snapshot-driven HUD in `src/client/src/ui/hud.ts`
  Test: `hud.test.ts` — known snapshot keys (`fuse`, `remaining`, `counts`) render
  their widget; unknown keys are ignored without throwing; **no minigame id appears
  anywhere in the UI source** (RD-009)

- [x] T17 [R11] — Landscape phone layout
  Test: `kit.test.ts` — a short-viewport media query tightens the layout without
  dropping the 44 px tap floor; the HUD is pinned to the top, out of both thumb corners

## Phase E — close

- [ ] T18 [R13] — Measure the cost, do not assume it
  Test: frame timing with 8 characters in each arena, before and after. Unlit fill and
  geometry outlines **should** be cheaper than the current Lambert build; if they are
  not, that is a finding for the DECISION_LOG, not something to quietly keep.

- [ ] T19 — Played for real, on a phone, by someone who is not the author
  Test: manual playtest via `pnpm playtest`. Two questions no test answers: does the
  paper read at arm's length in a lit room, and can you still judge depth well enough
  to time a jump over a sweeper?
