# Visual Direction — Requirements

> **The look:** a PS1-era low-poly world rendered chunky and dithered, wrapped in a
> bright, chunky Nintendo-party interface that stays razor sharp.

Two registers on purpose. The 3D renders to a low-resolution buffer and is upscaled,
so the world has era-accurate texel chunk and colour banding. The UI is DOM at native
resolution, so type and panels stay crisp on a 3x phone display. **Retro world, modern
interface** — that contrast is the direction, not a compromise within it.

## The Kit still holds

**R1**: The look adds no asset files and no loaders.
- AC: `tools/kit_check.py --check` stays green — no `.png`, no `TextureLoader`
- AC: every texture is generated in code into a `DataTexture` at startup
- AC: a texture the generators cannot express is a texture the design does without,
      or a reason to change the design — never a reason to add a file

**R2**: Textures are procedural, tiling, and small, as PS1 textures were.
- AC: a texture kit provides at minimum: checker, brick, tile, grid, stripes, noise,
      gradient, dots
- AC: every texture is 32 or 64 px square, `NearestFilter`, `RepeatWrapping`
- AC: every colour comes from `PALETTE` or a player colour; no hex literals at call sites
- AC: generation is seeded and deterministic — the same seed gives the same texels

## The world

**R3**: The 3D renders at a low internal resolution and is upscaled with no smoothing.
- AC: the render target is `RETRO_HEIGHT` px tall, width derived from the viewport aspect
- AC: upscaling is `NearestFilter` — the pixels stay square and hard
- AC: property — the internal resolution never exceeds the device resolution (upscale
      only, never downscale, which would be blurrier *and* slower)

**R4**: Colour is quantized and dithered, as a 15-bit console's would be.
- AC: output is quantized to 5 bits per channel (PS1's 15-bit colour)
- AC: quantization is dithered with an ordered 4x4 Bayer matrix, not rounded flat
- AC: the dither pattern is stable in screen space, so a still frame does not crawl

**R5**: Geometry reads as flat-shaded and hard-edged, with distance fog.
- AC: all materials are `flatShading: true`; no smooth normals anywhere
- AC: fog is enabled per arena, coloured to that arena's `sky`, so the far edge dissolves
- AC: no shadow maps, no post-processing beyond the retro pass, no antialiasing

**R6**: The divisive PS1 artefacts are deliberately **excluded**.
- AC: no vertex jitter / snapping — on a fast 8-player arena it reads as a rendering bug
- AC: no affine texture warping — our arenas are large flat floors, the worst case for it
- AC: these are recorded as excluded, not forgotten, so a later change is a decision

## Characters

**R7**: A player is a blocky PS1 humanoid, built from boxes, with a face.
- AC: head, torso, two arms and two legs, all `BoxGeometry`, no rig and no keyframes
- AC: the body takes the player's colour; the face is a generated texture on the head
- AC: the silhouette is readable with 8 on screen at phone size — verified by capture
- AC: total height and footprint stay consistent with `PLAYER_RADIUS`, so nothing about
      collision changes

**R8**: Each player's face is generated, distinct, and seeded by their slot.
- AC: a parametric generator varies eye spacing, eye size, brow angle and mouth shape
- AC: the 8 slots produce 8 visibly different faces, asserted by a test
- AC: the face is a second identity channel alongside colour — the fix RD-007 named for
      8-player legibility and did not build

**R9**: Limbs animate procedurally from velocity, with no rig.
- AC: a walk cycle drives legs and arms in counter-phase from horizontal speed
- AC: airborne states pose the limbs differently from grounded ones
- AC: every pose is a pure function of (velocity, height, grounded, time) — testable
      without a renderer, as `poseFor` already is

## The interface

**R10**: The UI is the bright, chunky party idiom — fat rounded panels, thick outlines,
chunky offset shadows, saturated primaries, bouncy entrances.
- AC: panels have a heavy dark outline and a hard offset shadow, not a soft blur
- AC: entrances scale and settle with an overshoot; nothing simply fades in
- AC: the accent colours are the game's own eight player colours, not a new palette
- AC: `prefers-reduced-motion` removes the bounce without removing the information

**R11**: The UI stays sharp and stays usable in one thumb.
- AC: the UI is DOM at native resolution — it is never rendered into the retro buffer
- AC: every interactive target is at least 44 px on the shortest side
- AC: the whole interface works in landscape on a 360 px-tall viewport
- AC: nothing important sits under a thumb resting at either bottom corner

**R12**: The round card and the HUD carry what a player needs and nothing else.
- AC: the intro card shows the minigame name and its one-sentence rule, nothing more
- AC: the in-round HUD shows only what that minigame needs (a fuse, a countdown, a
      count) and is driven by the snapshot, adding no client-side game logic
- AC: the result screen ranks players by the round's points, with their colour and face

## Budget

**R13**: The look does not cost the frame budget.
- AC: 60 fps with 8 characters on a mid-range Android, judged on a phone
- AC: rendering at `RETRO_HEIGHT` is *cheaper* than native, so the retro pass must pay
      for itself — measured, not assumed
- AC: textures and geometry are generated once at startup and cached, never per frame
