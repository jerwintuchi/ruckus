# Arena Framing — Requirements

> **The whole arena, on any screen it is handed.** A fixed camera is a promise that
> everyone can see everything (vision pillar 3). Today that promise holds at one
> aspect ratio and quietly breaks at every other one.

*Written 2026-08-31, from the first phone playtest of `visual-direction` T19 (RD-029
brought the build far enough to be played at all). Both findings are in the screenshots
that opened this spec: in portrait one character filled the frame, and in landscape
Safari's chrome sat over the HUD.*

## The problem, stated exactly

Every minigame's `arena()` declares `fov: 45`. In Three.js that is the **vertical**
field of view, so the horizontal extent is `2·atan(tan(fov/2) · aspect)` — it is a
consequence of the viewport, not a decision anyone made. On a portrait phone at aspect
0.46 that is about 21° across, which is why a 24 m arena arrived as one enormous
character. `resize()` updates `camera.aspect` correctly and never re-frames, so the
arena fits on the desktop it was authored on and nowhere else.

## The camera

**R1**: The whole arena is visible on any viewport, in either orientation.
- AC: every arena's declared extent fits inside the frustum with a margin, for aspects
      from 0.4 (tall portrait) to 2.4 (a phone in landscape with browser chrome)
- AC: the fit is computed from **both** axes — whichever of width or height is the
      binding constraint decides the framing
- AC: nothing is cropped at any aspect in that range; a corner tile is as visible as
      the centre
- AC: the camera is still fixed per arena and still never player-controlled (RD-005) —
      this changes *how a fixed camera is placed*, not whether it moves

**R2**: The arena declares its own size; the client decides how to frame it.
- AC: `ArenaDescriptor` carries an explicit extent, because it cannot be inferred —
      `falling-floor` ships `statics: []` and its grid arrives later via `setTiles`
- AC: the extent is a **dimension in metres**, not a camera instruction: the server
      states how big the arena is and learns nothing about 3D (non-negotiable 1)
- AC: an arena that omits it still renders, at the author's declared camera

**R3**: Re-framing survives every way a phone changes shape.
- AC: rotation, browser chrome appearing and disappearing, and split-screen all re-fit
- AC: re-framing allocates nothing per frame and never runs inside the render loop

## The screen it is actually on

**R4**: Browser chrome never covers anything the player needs.
- AC: the HUD and every overlay respect `env(safe-area-inset-*)` on all four sides
- AC: the HUD clears the notch/Dynamic Island in landscape, where it is at the side
- AC: judged against Safari on iOS with its URL bar and tab strip showing — the state
      the playtest was actually in, not the idealised full-screen one

**R5**: Portrait says what to do, and still works if it is ignored.
- AC: a "turn your phone" prompt appears in portrait and disappears on rotation
- AC: the arena is **still framed correctly underneath it** — ignoring the prompt costs
      comfort, never the round. A player whose orientation lock is on is not locked out
      of a match (I8's spirit: never require an action to keep playing)
- AC: under `prefers-reduced-motion` the prompt still appears, without animation

## Not this spec

The virtual stick and the action button are `specs/touch-controls/`. They were found in
the same playtest and are deliberately separate: this one is a rendering change and
ships alone, that one is an input change and ships alone.
