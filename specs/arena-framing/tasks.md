# Arena Framing — Tasks

Render layer and one shared type. No minigame's rules, collision or scoring change; if
a task finds itself editing a `tick()`, it has gone wrong.

- [ ] T1 [R2] — Add `extent?: number` to `ArenaDescriptor.camera` in
  `src/shared/src/minigame.ts`, and declare it in all four minigames
  Test: `minigame.test.ts` — every registered minigame declares an extent; each one is
  positive, finite, and at least half the diagonal of its own arena, so nothing the
  minigame builds can sit outside the disc it claims

- [ ] T2 [R1, P1, P2] — `fitCamera` in `src/client/src/kit/framing.ts`
  Test: `framing.test.ts` — property over 200 aspects spanning [0.4, 2.4]: the extent
  projects inside the viewport on **both** axes with the margin intact; the binding axis
  swaps from horizontal to vertical as aspect crosses 1; the result is a pure function
  of its arguments; extreme and degenerate inputs (aspect→0, extent 0, fov 179) stay
  finite

- [ ] T3 [R1, R3, P3] — Apply the fit in `src/client/src/render.ts` on `setArena` and on
  `resize`
  Test: `framing.test.ts` — the camera keeps the author's viewing *angle* and changes
  only its distance along it; an arena with no extent is left at the author's camera
  untouched; **the render source calls the fit from `resize`, never from `render`**
  (P3, asserted against the source, the same way T8's no-fullscreen-pass claim is)

- [ ] T4 [R4] — Safe-area insets for the HUD and every overlay in
  `src/client/src/ui/kit.ts`
  Test: `kit.test.ts` — the HUD and overlay rules carry `env(safe-area-inset-*)` on all
  four sides; the 44 px tap floor still holds once the insets are applied; the short-
  viewport landscape query from T17 still tightens the layout

- [ ] T5 [R5, P4] — The portrait prompt
  Test: `kit.test.ts` — the prompt is a CSS-only `@media (orientation: portrait)` rule;
  it does not hide or cover the canvas; under `prefers-reduced-motion` it is still
  rendered and its animation is removed; **`flow.ts` gains no state** (P4, asserted
  against the source — an orientation cannot strand a player)

- [ ] T6 [R1, R4] — Seen on the phone that found it
  Test: manual, on the iPhone from RD-029, in Safari with its chrome showing. Portrait
  and landscape, all four arenas, `falling-floor` last because its grid is the widest
  thing in the game. The whole arena on screen, the HUD clear of the URL bar and the
  notch, and the prompt appearing and vanishing on rotation.
