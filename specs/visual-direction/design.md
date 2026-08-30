# Visual Direction — Design

Satisfies R1–R13. *Rewritten 2026-08-31 (RD-021) — see requirements.md.*

## The outline is geometry, not a shader

The most important decision here, and the one that makes the rest cheap.

A character is a **thin slab**: a box 0.08 m deep, with the front and back faces in the
player's colour and **the four edge faces near-black**. Rendered, that produces a hard
black outline around the entire silhouette — for free, from geometry, with no extra
pass, no inverted hull, no depth texture, and no per-frame cost at all.

```
   front                 above
 ┌─────────┐         ███████████   <- edge faces, near-black
 │  ◕   ◕  │         █         █
 │   ───   │         ███████████
 │ ███████ │              ↑
 └─────────┘          0.08 m deep
```

Turning shows the edge, so the flip that reads as *paper* is also the depth cue the
gameplay needs. Internal linework — a face, a fold, a printed detail — is **drawn into
the generated texture**, where it is authored rather than derived. That is what a paper
cutout actually is: an outlined shape with printing on it.

**P1** (R4): outlining adds no fullscreen pass and no depth-buffer requirement.
Asserted against the render source, so a later "let's just add a post-process outline"
is a decision rather than a drift.

Props that genuinely need an outline and are not slabs (a cylinder, a sphere pickup)
take an **opt-in inverted-hull** pass — one extra draw for that object, never a global
effect.

## Constants

`src/client/src/kit/paper.ts`

| name | value | why |
|---|---|---|
| `SLAB_DEPTH` | 0.08 m | thick enough to read as an outline at phone size, thin enough to read as paper |
| `INK` | `#1b1a17` | near-black, warm — a printed black, not a pure one |
| `TEX_SIZE` | 64 | plenty for fibre and creases; paper wants no more |
| `FIBRE_CONTRAST` | 0.06 | visible at arm's length, invisible as noise |
| `PIXEL_RATIO_CAP` | 2 | a 3x display costs 2.25x the fragments for nothing anyone can see |

**No `RETRO_HEIGHT`, no `COLOUR_BITS`, no Bayer matrix.** Those are superseded (RD-021).
Flat saturated colour is the whole read, and dithering exists to break flat colour up.

## The palette moves to paper

Paper Mario grounds are warm and light; the current arena tokens are a near-black
dungeon. The eight **player colours do not change** — they were chosen by search against
dichromacy simulation (RD-007) and that constraint is unrelated to style.

| token | was | becomes | why |
|---|---|---|---|
| `sky` | `#0e1014` | `#cfe4f2` | a pale paper sky rather than a void |
| `floor` | `#3b4152` | `#f2e9d6` | warm paper stock |
| `floorEdge` | `#2a2f3c` | `#d9caa9` | the same stock, one shade down |
| `ink` | — | `#1b1a17` | every outline and every drawn line |

**A note on the two dark player colours.** Brown and maroon look odd as bright paper.
They stay: dichromacy safety is not negotiable, and with an outline and a face now
carrying identity too, colour no longer has to do the job alone (R8).

## Procedural textures for paper

`src/client/src/kit/textures.ts` — the generator kit, retargeted from PS1 patterns.

```ts
stock(tint: string, seed: number): DataTexture        // fibre — the base of everything
crease(tint: string, dir: "h"|"v"|"cross"): DataTexture
deckle(tint: string, edge: "top"|"all", seed: number): DataTexture   // torn edge
flat(tint: string): DataTexture
checker(a, b, cells) | stripe(a, b, n) | dot(a, b, spacing) | grid(a, b, cells)
```

All 64x64, `LinearFilter` (paper is smooth — this is the opposite of the PS1 spec's
`NearestFilter`), `RepeatWrapping`, cached by argument signature.

**P2**: generation is deterministic — same arguments, byte-identical texels.

**Why paper suits procedural generation better than PS1 did.** PS1 wanted texture
*detail* — grime, panels, decals — which is where hand-authoring wins. Paper wants flat
colour, a whisper of fibre, and hard lines. Those are cheaper to write than to draw, so
the constraint costs less here than it would have.

## The face generator

`src/client/src/kit/face.ts` — unchanged in intent from the superseded version, now
drawn with its own linework since paper faces are inked.

`faceFor(slot)` varies eye spacing, eye size, brow angle and mouth shape from the slot
seed. **P3**: the 8 slots produce 8 pairwise-distinct texel arrays, asserted by
comparison rather than by eye.

## The character

`src/client/src/kit/character.ts`

```
       ┌────┐
       │◕  ◕│        head    0.44 x 0.44 slab, face drawn on the front
       └─┬──┘
   ┌┐  ┌─┴──┐  ┌┐
   ││  │████│  ││    torso   0.60 x 0.66 slab, arms 0.14 x 0.52
   └┘  └─┬──┘  └┘
       ┌─┴─┐
      ┌┴┐ ┌┴┐        legs    0.19 x 0.50 slabs, hinged at the hip
      └─┘ └─┘
      ╰────╯         shadow  flat blob, shrinks with height
```

Every part is a slab: coloured faces, `INK` edges. Total height ~1.80 m, footprint and
`PLAYER_RADIUS` unchanged, so **no collision, spawn or minigame geometry moves**.

### Paper motion

Extends `poseFor`, which is already pure and already tested without a renderer.

- limbs **hinge** about a pivot — a cutout rotates, it never bends or deforms
- the swing curve is **snappy**, easing sharply at the extremes rather than sinusoidal:
  paper has no inertia and smooth motion reads as rubber
- a small **rotation about the vertical** on turns, so the slab shows its edge and
  "flips" the way the material implies
- airborne poses legs tucked and arms up, distinct from every grounded pose

**P4**: every angle is a pure function of `(speed, height, grounded, t)`. No rig, no
keyframes, no clips.

## The arena

Boxes and planes already — which is what a pop-up book is. Retargeting is mostly
material work:

- floors take `stock()` with `crease()` along their structural lines, so a floor reads
  as a folded sheet
- walls stand as slabs with `INK` edges, exactly like characters
- at least one element per arena takes a `deckle()` torn edge rather than a cut one, so
  the world is not uniformly machine-cut
- fog is **removed** — it dissolves edges, and hard edges are the whole point

## The interface

`src/client/src/ui/` — unchanged from the superseded spec, which was already the right
family. It now agrees with the world instead of contrasting with it.

Type: **Fredoka** (display) + **Nunito** (body), from Google Fonts — a named runtime CDN
dependency, not an asset file, with a declared system-rounded fallback.

Panels: radius 20, a 4 px `INK` outline, a hard 6 px offset shadow with **no blur**, and
a ±1.2° rotation on cards that appear one at a time. That is the same construction as a
character slab, at UI scale, which is why the two now read as one thing.

Motion: entrances scale from 0.86 with an overshoot; scores count up; the round card
deals in, holds, flicks away. `prefers-reduced-motion` removes all of it and keeps every
piece of information.

## What does not change

Fixed camera per arena, one stick and one button, the 20 Hz authoritative server, the
trust boundary, and every minigame's geometry and rules. This spec touches
`src/client/src/kit/` and `src/client/src/ui/` and nothing else.
