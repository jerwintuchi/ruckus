# Arena Framing — Tasks

Render layer and one shared type. No minigame's rules, collision or scoring change; if
a task finds itself editing a `tick()`, it has gone wrong.

- [x] T1 [R2] — Add `extent?: number` to `ArenaDescriptor.camera` in
  `src/shared/src/minigame.ts`, and declare it in all four minigames
  Test: `registry.test.ts` — every registered minigame declares a positive, finite
  extent, and it covers every corner of every `solid` and `static` the arena builds.
  `falling-floor.test.ts` covers the other half: its grid is in neither collection —
  it arrives via `setTiles` — so the only place that knows the true size is its own
  test, which asserts the extent reaches the far *corner* and that every tile centre
  lies inside it.
  *(The spec named `minigame.test.ts`; the assertion needs the registered minigames,
  which live server-side, and `registry.test.ts` is already where "every minigame
  must…" lives. The camera key-set guard from RD-005 exists in four separate test
  files and each had to be told about the new field — which is the guard working.)*

- [x] T2 [R1, P1, P2] — `fitCamera` in `src/client/src/kit/framing.ts`
  Test: `framing.test.ts` — property over 200 aspects spanning [0.4, 2.4], for all four
  real arenas: the extent disc is **projected through an actual `PerspectiveCamera`**
  and every sample lands inside the viewport. That is deliberately not a restatement of
  the formula — it is checked against what the renderer will really do, which is what
  caught the first attempt (see below). Also: the binding axis swaps as aspect crosses
  1; the fit stays snug rather than retreating into orbit; the authored viewing *angle*
  is preserved and only distance changes; an arena with no extent is left untouched;
  degenerate input (aspect 0, NaN, ∞, fov 0/360/NaN) stays finite.
  *A **sphere** of `extent` is fitted, not the flat disc. The camera looks down steeply,
  so a disc's near edge is much closer to the eye than its centre and projects larger —
  the perpendicular-plane formula the design first described underestimates badly at
  these angles. A sphere bound is angle-independent, provably contains the disc, and
  costs a few metres of air. The projection test is what makes that difference visible.*

- [x] T3 [R1, R3, P3] — Apply the fit in `src/client/src/render.ts` on `setArena` and on
  `resize`
  Test: `framing.test.ts` — the camera keeps the author's viewing *angle* and changes
  only its distance along it; an arena with no extent is left at the author's camera
  untouched; **the render source calls the fit from `resize`, never from `render`**
  (P3, asserted against the source, the same way T8's no-fullscreen-pass claim is), and
  `setArena` no longer contains `position.set(...arena.camera.eye)` — the exact line
  that put a 24 m arena off a phone screen.

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
