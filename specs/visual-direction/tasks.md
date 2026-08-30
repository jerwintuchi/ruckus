# Visual Direction — Tasks

Render layer only. No minigame's geometry, collision or scoring changes; if a task
finds itself editing `src/server/`, it has gone wrong.

## Phase A — procedural textures

- [ ] T1 [R1, R2, P1] — The texture kit in `src/client/src/kit/textures.ts`
  Test: `textures.test.ts` — every generator returns a 64x64 `DataTexture` with
  `NearestFilter` and `RepeatWrapping`; generation is deterministic (byte-identical
  texels for identical arguments); the cache returns the same object for the same
  signature; every colour argument resolves through `PALETTE` or a player colour

- [ ] T2 [R1] — Keep the Kit honest with the new capability
  Test: `kit-rules.test.ts` — `kit_check.py --check` is green with textures in play;
  a seeded `.png` and a seeded `TextureLoader` are each still rejected; `DataTexture`
  is not mistaken for a loader

- [ ] T3 [R8, P2] — The face generator in `src/client/src/kit/face.ts`
  Test: `face.test.ts` — `faceFor(slot)` is deterministic; the 8 slots produce 8
  pairwise-distinct texel arrays; every parameter stays inside its declared range;
  eyes and mouth land inside the texture bounds for every slot

## Phase B — the retro pass

- [ ] T4 [R3, P4] — Render target sizing in `src/client/src/kit/retro.ts`
  Test: `retro.test.ts` — the target is `RETRO_HEIGHT` tall and derives width from
  aspect; it never exceeds the drawing buffer (upscale only); it resizes with the
  viewport without leaking targets; `RETRO_HEIGHT` is inside a sane readable band

- [ ] T5 [R4] — Quantization and ordered dither
  Test: `retro.test.ts` — a reference implementation of the shader's maths in TS
  quantizes to 32 levels per channel; the Bayer matrix is the standard 4x4 and sums
  correctly; dithering a flat ramp produces more distinct output values than rounding
  it flat (the property that makes banding acceptable)

- [ ] T6 [R5] — Flat shading and per-arena fog in `src/client/src/render.ts`
  Test: `render.test.ts` — every material the Kit hands out is `flatShading: true`;
  fog is set from the arena's `sky` on `setArena` and cleared between arenas

- [ ] T7 [R6] — Record the exclusions
  Test: `retro.test.ts` — the retro shader source contains no vertex-snapping and no
  affine-UV path, asserted against the source so a future addition is a decision and
  not a drift

## Phase C — the character

- [ ] T8 [R7] — The box humanoid in `src/client/src/kit/character.ts`
  Test: `character.test.ts` — the parts are all `BoxGeometry` from the Kit's cache;
  total height and footprint are unchanged from the bean; the face texture lands on
  the head's +Z face; geometries and materials are shared, not per-instance

- [ ] T9 [R9, P3] — Procedural limb animation, extending `poseFor`
  Test: `actor.test.ts` — legs and arms are in counter-phase; amplitude scales with
  speed and is zero at rest; the airborne pose differs from every grounded pose; every
  angle is finite for extreme inputs; the whole pose is a pure function of
  `(speed, height, grounded, t)`

- [ ] T10 [R7, R13] — Readability and cost with 8 on screen
  Test: manual capture at phone size, 8 characters, each arena — plus
  `character.test.ts` asserting the per-character mesh count stays within budget

## Phase D — the interface

- [ ] T11 [R10, R11] — The panel, button and card primitives in `src/client/src/ui/kit.ts`
  Test: `ui-kit.test.ts` — the outline and hard offset shadow are present (no blur
  radius); every interactive target is at least 44 px on its shortest side; accents
  resolve to the game's own player colours

- [ ] T12 [R10] — Motion, and its reduced-motion path
  Test: `ui-motion.test.ts` — entrances overshoot and settle; under
  `prefers-reduced-motion` every animation is removed and **every piece of information
  is still rendered** — the property that matters

- [ ] T13 [R12] — Screens: join, lobby, intro, result, match result
  Test: `ui.test.ts` — the intro renders the minigame's `rule` verbatim; the lobby
  shows the room code, and each player's colour, face and name; results order by
  points descending with ties stable

- [ ] T14 [R12] — A snapshot-driven HUD in `src/client/src/ui/hud.ts`
  Test: `hud.test.ts` — known snapshot keys (`fuse`, `remaining`, `counts`) render
  their widget; unknown keys are ignored without throwing; **no minigame id appears
  anywhere in the UI source**, asserted the same way `main.ts` is (RD-009)

- [ ] T15 [R11] — Landscape phone layout
  Test: `ui.test.ts` — the whole interface fits a 360 px-tall viewport; nothing
  interactive sits in either bottom corner where a thumb rests

## Phase E — close

- [ ] T16 [R13] — Measure the cost, do not assume it
  Test: frame timing with 8 characters in each arena, retro pass on and off, captured
  on a phone. If the retro pass does not pay for itself, that is a finding for the
  DECISION_LOG, not something to quietly keep.

- [ ] T17 — Played for real, on a phone, by someone who is not the author
  Test: manual playtest via `pnpm playtest`. The question is whether the look reads at
  arm's length in a lit room, which no test answers.
