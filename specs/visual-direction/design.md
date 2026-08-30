# Visual Direction — Design

Satisfies R1–R13.

## The two registers

| | Resolution | Filtering | Why |
|---|---|---|---|
| **World** (Three.js) | `RETRO_HEIGHT` px tall, upscaled | Nearest | era texel chunk, colour banding, hard pixels |
| **Interface** (DOM) | native, up to 3x | subpixel type | razor-sharp panels and type on a phone |

The UI is never drawn into the retro buffer. That split is the whole direction: the
world looks like a disc from 1998, the interface looks like it shipped this year.

## Constants

`src/client/src/kit/retro.ts`

| name | value | why |
|---|---|---|
| `RETRO_HEIGHT` | 270 | 480x270 at 16:9; exactly 1/4 of 1080p, so integer upscale on the common phone |
| `COLOUR_BITS` | 5 | PS1's 15-bit colour, 32 levels per channel |
| `BAYER` | 4x4 | ordered dither, stable in screen space so a still frame does not crawl |
| `FOG_NEAR / FOG_FAR` | 18 / 46 m | our arenas are 18–22 m, so the far wall dissolves and the near play space does not |
| `TEX_SIZE` | 64 | PS1 textures were 64x64; big enough to read, small enough to generate instantly |

**On `RETRO_HEIGHT`.** 270 is chunky enough to read as the era and fine enough that a
bomb above a head is still legible. It is a constant with a test asserting it stays in
a sane band, because "make it more retro" is exactly the kind of change that ships
unreadable. Rendering at 270 and upscaling is *cheaper* than native — the retro pass
must pay for itself, and R13 says measure that rather than assume it.

## Procedural textures

`src/client/src/kit/textures.ts`

Every generator writes a `Uint8Array` and returns a `DataTexture`. No file, no loader,
so `kit_check.py` stays green by construction rather than by exemption.

```ts
checker(a: string, b: string, cells = 8): DataTexture
brick(mortar: string, face: string, rows = 4): DataTexture
tile(line: string, fill: string, cells = 4): DataTexture
grid(line: string, fill: string, cells = 8): DataTexture
stripes(a: string, b: string, count = 6, diagonal = false): DataTexture
noise(base: string, contrast: number, seed: number): DataTexture
gradient(top: string, bottom: string): DataTexture
dots(dot: string, ground: string, spacing = 16): DataTexture
```

All 64x64, `NearestFilter` on both min and mag, `RepeatWrapping`, cached by argument
signature so a minigame asking for the same texture twice gets the same object.

**P1**: generation is deterministic — same arguments, byte-identical texels. Tested,
because a texture that differs between two clients is a desync you can see.

### Why this is not a compromise

PS1 textures were small tiling patterns: brick, tile, panel, grating, noise. Those are
*cheaper* to write as code than to author and manage as files. The limit is real and
worth stating plainly: a generator cannot paint a logo, a sign, or a portrait. The
design does without those. The one place that felt like it needed painting — a face —
turns out not to (below).

## The face generator

`src/client/src/kit/face.ts`

A PS1 face was a 32x32 texture with dot eyes and a mouth. That is a handful of drawing
primitives, not a painting. `faceFor(slot)` varies four parameters from the slot seed:

| parameter | range | effect |
|---|---|---|
| eye spacing | 0.28 – 0.46 of width | close-set to wide-set |
| eye size | 3 – 6 px | beady to saucer |
| brow angle | -12° – +12° | cross to surprised |
| mouth | `line` `oh` `smile` `grimace` | the whole personality |

**P2** (R8): the 8 slots produce 8 distinct faces — asserted by comparing generated
texel arrays pairwise, not by eye.

This is the second identity channel RD-007 named and did not build. Eight colours that
survive dichromacy is over-constrained; eight colours *plus* eight faces is not.

## The character

`src/client/src/kit/character.ts` — rebuilt from the capsule bean to a box humanoid.

```
        [====]        head      0.46 cube, face texture on +Z
         |  |         neck      implicit
     [=][####][=]     torso     0.62 w x 0.70 h x 0.36 d
         |##|         arms      0.17 x 0.58 x 0.17, pivot at shoulder
        /    \
      [==]  [==]      legs      0.21 x 0.58 x 0.21, pivot at hip
       ~~~~~~         shadow    flat circle on the ground plane
```

Total height ~1.85 m. **Footprint and `PLAYER_RADIUS` are unchanged**, so nothing about
collision, spawning or any minigame's geometry moves — this is a render-layer change and
must stay one.

### Procedural animation

Extends the existing `poseFor`, which is already a pure function of velocity, height and
time and already tested without a renderer. Adds limb phase:

- **legs** counter-rotate about the hip on `sin(phase)`, amplitude from speed
- **arms** counter-swing against the legs, so the walk reads as a walk
- **airborne** poses legs tucked and arms up, distinct from the grounded cycle
- **torso** keeps the existing bob and lean

**P3**: every limb angle is a pure function of `(speed, height, grounded, t)`. No rig,
no keyframes, no clips — the same reason the bean had none (kit-rules.md).

## The retro render pass

`src/client/src/kit/retro.ts`

1. Render the scene to a `WebGLRenderTarget` sized `(round(RETRO_HEIGHT * aspect), RETRO_HEIGHT)`
2. Draw that target to a fullscreen triangle through the retro shader
3. The shader quantizes to `COLOUR_BITS` per channel, dithered by the 4x4 Bayer matrix
   indexed on `gl_FragCoord` so the pattern is stable in screen space (R4)

**P4**: the internal resolution is never larger than the drawing buffer. Upscaling only —
downscaling would be both blurrier and slower, which is the worst of both.

**Deliberately excluded (R6), recorded so a later change is a decision rather than a
drift:** vertex jitter and affine texture warping. Jitter on eight fast-moving players
reads as a bug rather than as an era, and affine warping is worst on large flat floors,
which is what every arena here is.

## The interface

`src/client/src/ui/` — the current single `ui.ts` becomes a small set of pieces.

### Type

| role | face | use |
|---|---|---|
| display | **Fredoka** 600/700 | minigame names, scores, the room code |
| body | **Nunito** 400/700 | rules, labels, everything read |

Both from Google Fonts. **This is a runtime CDN dependency**, which is a real trade-off
worth naming: it is not an asset file in the tree, so the Kit is untouched, but a cold
load on a bad connection falls back to a system rounded stack. That fallback is declared
rather than left to chance.

### The panel

One shape does most of the work:

- radius 18 px, a **4 px near-black outline**, and a **hard 6 px offset shadow** — not a
  soft blur, which is what makes it read as printed card rather than as a web modal
- ground is a light warm neutral; the accent is the relevant player's colour
- a slight rotation (±1.5°) on cards that appear one at a time, so a stack looks dealt

### Motion

- entrances **scale from 0.86 with an overshoot** and settle — nothing simply fades
- scores **count up** rather than appearing, so a win is watchable (vision pillar 3)
- the round card **deals in**, holds, and flicks away
- **`prefers-reduced-motion` removes the bounce and keeps every piece of information** —
  the animation is emphasis, never the message

### Screens

| screen | carries |
|---|---|
| **Join** | the game's name, a name field, a 4-letter code field, one fat button |
| **Lobby** | player cards (colour, face, name), the room code big enough to read aloud, host's start button |
| **Round intro** | minigame name, its one sentence, round N of M — nothing else (R12) |
| **HUD** | only what the minigame's snapshot carries: a fuse, a countdown, a count |
| **Round result** | points won this round, counted up, ordered |
| **Match result** | the winner, large, with their face and colour |

### The HUD is driven by the snapshot

A minigame that wants a fuse bar puts `fuse` and `fuseLength` in its snapshot; the HUD
renders known keys and ignores the rest. **No minigame-specific branch enters the UI**,
for the same reason none is allowed in `main.ts` (RD-009).

## What does not change

Fixed camera per arena, one stick and one button, 20 Hz authoritative server, the trust
boundary, and every existing minigame's geometry. This spec touches
`src/client/src/kit/` and `src/client/src/ui/` and nothing else.
