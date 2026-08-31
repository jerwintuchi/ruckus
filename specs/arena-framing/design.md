# Arena Framing — Design

Satisfies R1–R5.

## The extent is a dimension, not a camera

`ArenaDescriptor.camera` gains one optional field:

```ts
camera: {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  /** Radius in metres of the disc that must stay on screen, centred on `look`. */
  extent?: number;
}
```

A radius rather than a box, because every arena in the game is square or round and a
radius makes the fit one formula instead of two. `falling-floor` declares
`(GRID * TILE) / 2 * Math.SQRT2` — the corner, not the edge, since the corner is what
falls off screen first.

The server states a size it already knows. It gains no notion of cameras, frustums or
aspect ratios, so non-negotiable 1 holds: 3D stays a rendering choice.

## The fit

`src/client/src/kit/framing.ts`, pure and DOM-free so it can be tested without a canvas.

```
fitCamera(extent, aspect, fov, eye, look) -> { fov, distance }
```

Given the camera direction the author chose, back the camera off along that direction
until the extent disc fits both axes:

```
half-height needed = extent
half-width needed  = extent
d_v = extent / tan(fovV / 2)
d_h = extent / tan(fovH / 2),  where fovH = 2·atan(tan(fovV/2) · aspect)
distance = max(d_v, d_h) · MARGIN
```

`max` is the whole point: the binding axis decides. On a tall portrait screen the
horizontal term dominates and the camera pulls back; on a wide landscape one the
vertical term does. The author's `eye` still sets the *angle* the arena is viewed from —
only the distance along that direction is recomputed.

**P1** (R1): for every aspect in [0.4, 2.4] the extent projects inside the viewport on
both axes. Property-tested over the range rather than at three hand-picked sizes,
because the failure is a continuum and hand-picked sizes are how it shipped.

**P2** (R1): `fitCamera` is pure — same arguments, same result, no globals, no DOM.

**P3** (R3): re-framing happens on `resize` only, never per frame.

| name | value | why |
|---|---|---|
| `FIT_MARGIN` | 1.08 | 8% air so the outermost tile is not flush against the edge |
| `MIN_ASPECT` | 0.4 | a tall phone in portrait |
| `MAX_ASPECT` | 2.4 | a phone in landscape with Safari's chrome showing |

## Safe areas

The viewport CSS gains `env(safe-area-inset-*)` on the HUD and every overlay. The
`viewport-fit=cover` meta is already in `index.html`, which is what makes the env vars
non-zero; without the padding it only means content slides *under* the chrome, which is
what the playtest photographed.

## The orientation prompt

A CSS-only overlay on `@media (orientation: portrait)`. No JS, no resize listener, no
state in `flow.ts` — the browser already knows the orientation and a media query cannot
get out of sync with it. It sits above the canvas and **below** nothing: the arena keeps
rendering, framed, underneath.

**P4** (R5): the prompt is presentation only. `flow.ts` gains no state, so no sequence
of rotations can strand a player on a screen — the totality property is untouched.
