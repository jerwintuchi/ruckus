# The Kit — CLOSED LIST

The art pipeline is the thing that stalled the previous project (RD-001). It is
designed out structurally here, not left to discipline.

## Geometry is code

**There are no asset files.** `tools/kit_check.py --check` fails the build if any of
these appear in the tree: `.glb .gltf .fbx .obj .blend .dae .png .jpg .jpeg .webp
.tga .psd .aseprite .mp3 .wav .ogg`.

Everything on screen is a Three.js primitive, constructed in code:

| Thing | Built from |
|---|---|
| Player | `CapsuleGeometry` body + `SphereGeometry` head + two `BoxGeometry` hands |
| Arena floor / tiles | `BoxGeometry` |
| Walls, hazards, platforms | `BoxGeometry`, `CylinderGeometry` |
| Pickups | `IcosahedronGeometry`, `SphereGeometry` |
| Shadow | a flat dark `CircleGeometry` on the ground plane |

Materials are `MeshLambertMaterial` with `flatShading: true`. No texture maps, no
normal maps, no PBR.

## The palette is fixed

`src/client/src/kit/palette.ts` holds every colour in the game: eight player colours
(chosen for distinctness at phone size *and* for the two common colour-blindness
types), plus arena, hazard, floor, and UI ramps. **Call sites reference palette
names, never hex literals.**

## Animation is procedural

No rigs, no skeletons, no keyframes. A character's motion is derived each frame from
its velocity and state:

- **bob** — vertical sine on the body, scaled by speed
- **lean** — tilt into the movement direction, clamped
- **squash/stretch** — on jump takeoff and landing
- **hands** — counter-swing from the bob phase

That is the whole character animation system, and it is roughly forty lines. It
applies to every player in every minigame for free.

## A shadow means an object

The UI's hard offset shadow — zero blur, `--shadow` — belongs to **slabs**: cards, the
toast, the round card. It is what says *this is paper lying on a table*.

**Controls have none.** A button, an icon button, the stick and its knob are ink printed
on the surface, not objects above it. The outline stays everywhere — that is what makes
the UI and the characters look like one game — but the shadow does not.

This is not a style preference. On a circle a zero-blur offset reads as a *second
circle*: the stick's knob carried one, and a knob centred in its base looked lopsided in
every screenshot until it was removed (RD-069). A control that needs to say it was
pressed shrinks and takes ink, which is `UI.pressScale` and `UI.pressInk`.

## Lighting and performance

One `DirectionalLight`, one `AmbientLight`. **No shadow maps** (blob shadows are
geometry). No post-processing, no anti-aliasing beyond the default, no environment
maps. Shared geometries and materials are created once in the Kit and reused —
a minigame never allocates per-frame.

The budget: **60 fps on a mid-range Android in landscape**, with eight players and a
full arena on screen. Judged on a phone, not on the desktop it was written on.

## Adding to the Kit

Adding a primitive helper to `src/client/src/kit/` is ordinary work. Adding an asset
*format*, a texture, a model loader, or a new dependency is **not** — it requires an
explicit decision and a DECISION_LOG entry. A minigame that "needs" an asset needs a
different rule instead.
