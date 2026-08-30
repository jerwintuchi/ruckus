# Visual Direction — Requirements

> **The look:** flat paper cutouts with hard outlines, in a crisp, saturated,
> storybook world, under a chunky party interface of the same family.

*Rewritten 2026-08-31 (RD-021). The first version specified a PS1-era world — low
internal resolution, 15-bit colour, ordered dither. That direction is superseded, not
paused: it and this one are near-opposites, and running both was never possible. The
tasks it produced are marked superseded in place rather than deleted.*

The whole thing is now one reference instead of two bolted together: the world and the
interface come from the same Nintendo family, so they finally agree.

## The Kit still holds

**R1**: The look adds no asset files and no loaders.
- AC: `tools/kit_check.py --check` stays green — no `.png`, no `TextureLoader`
- AC: every texture is generated in code into a `DataTexture` at startup
- AC: this is held on RD-001's grounds — it makes the art loop that stalled the previous
      project structurally unavailable — and **not** on a performance claim, which
      measurement does not support (RD-021)

**R2**: Textures are procedural, and paper is a forgiving subject for that.
- AC: the kit provides paper stock (fibre), fold creases, torn/deckled edges, flat
      fills, and simple patterns (checker, stripe, dot, grid)
- AC: every texture is 64 px square, `NearestFilter` off — paper is smooth, not pixelated
- AC: every colour resolves through `PALETTE` or a player colour; no hex at call sites
- AC: generation is seeded and deterministic

## The world

**R3**: Rendering is crisp and native. There is no retro buffer.
- AC: the scene renders at device resolution, capped at 2x pixel ratio
- AC: no colour quantization, no dither, no low-resolution render target
- AC: flat, saturated colour is the point — anything that breaks up a flat fill works
      against the paper read

**R4**: Everything is outlined, and the outline costs nothing per frame.
- AC: a character's outline is **geometry, not a shader** — the slab's edge faces are
      near-black, so the silhouette is outlined by construction
- AC: internal linework (a face, a fold, a printed detail) comes from the generated
      texture, where it is drawn rather than derived
- AC: props that need an outline and are not slabs use an inverted-hull pass, opt-in
      per object, never a global post-process
- AC: property — outlining adds no fullscreen pass and no depth-texture requirement

**R5**: Characters are unlit; the arena is lightly shaded.
- AC: character materials are unlit flat fill — paper does not receive light
- AC: arena materials keep a single soft light so the floor reads as a surface
- AC: no shadow maps; a character's ground shadow stays a flat blob, as now

**R6**: The world reads as paper, not as plastic.
- AC: large surfaces carry a low-contrast fibre texture — visible at arm's length,
      invisible as noise
- AC: fold creases run along the arena's structural lines, so the floor reads as a
      sheet that was folded flat
- AC: at least one element per arena uses a torn or deckled edge rather than a cut one

## Characters

**R7**: A player is a **thin slab** — paper with thickness.
- AC: flat front and back faces with a visibly thicker-than-zero edge (~0.08 m)
- AC: the edge faces are near-black, which is what produces the outline (R4)
- AC: turning shows the edge, so orientation is readable — the flip is the charm *and*
      the depth cue
- AC: **not a billboard.** Depth judgement is load-bearing in Sweepers and Hot Potato,
      and a camera-facing quad removes it entirely
- AC: footprint and `PLAYER_RADIUS` are unchanged, so no collision or spawn logic moves

**R8**: Each player's face is generated, distinct, and seeded by their slot.
- AC: a parametric generator varies eye spacing, eye size, brow angle and mouth shape
- AC: the 8 slots produce 8 visibly different faces, asserted by a test
- AC: the face is drawn on the slab's front face, with its own drawn linework
- AC: with colour, outline and face, a player now has **three** identity channels — the
      thing RD-007 said eight dichromacy-safe colours alone could not carry

**R9**: Limbs animate procedurally from velocity, with no rig.
- AC: arms and legs are separate slabs, hinged, swinging in counter-phase from speed
- AC: paper motion is **hinged and snappy**, not smooth — a cutout pivots, it does not
      deform
- AC: airborne poses differently from grounded
- AC: every pose is a pure function of `(velocity, height, grounded, time)`

## The interface

**R10**: The UI is the bright chunky party idiom, and now matches the world.
- AC: fat rounded panels, heavy near-black outline, hard offset shadow, no soft blur
- AC: entrances scale with an overshoot and settle; nothing simply fades
- AC: accents are the game's own eight player colours
- AC: `prefers-reduced-motion` removes the motion and keeps every piece of information

**R11**: The UI stays sharp and usable in one thumb.
- AC: DOM at native resolution
- AC: every interactive target is at least 44 px on its shortest side
- AC: the whole interface works in landscape on a 360 px-tall viewport
- AC: nothing important sits under a thumb resting at either bottom corner

**R12**: The round card and HUD carry what a player needs and nothing else.
- AC: the intro card shows the minigame name and its one sentence, nothing more
- AC: the HUD renders only known snapshot keys and ignores the rest — no minigame-
      specific branch enters the UI (RD-009)
- AC: the result screen ranks by the round's points, with each player's colour and face

## Budget

**R13**: The look does not cost the frame budget.
- AC: 60 fps with 8 characters on a mid-range Android, judged on a phone
- AC: unlit flat fill and geometry outlines should make this **cheaper** than the
      current Lambert-lit build — measured, not assumed
- AC: textures and geometry are generated once at startup and cached, never per frame
