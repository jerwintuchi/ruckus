# Round Countdown — Requirements

> **A paper stopwatch, dropped on the table.** The three seconds between reading the rule
> and playing the round, made into an object worth looking at.

*`round-open` R3 put the count over a live, paused arena and left it as plain text in the
card. This is the design of the thing itself.*

## The idea, and why this one

A **stopwatch cut from paper**: a disc with an ink outline and the Kit's hard offset
shadow, a huge number inside it, and a ring around it that drains as the second runs out.
Each number lands with the same overshoot-and-settle the cards already use; on **GO** the
disc punches outward and is gone.

Chosen over the two alternatives on purpose:

- **A 3D number standing in the arena** would be the most striking, and it is the wrong
  trade: it needs per-digit geometry in a Kit that has none, for a moment that lasts three
  seconds, and it would occlude the very arena `round-open` exists to reveal.
- **Plain text that scales up** is what is there now. It reads as a debug overlay because
  it has no object-ness — nothing in Ruckus is an unbordered floating glyph.

A stopwatch is a *real thing*, it is made of paper like everything else here, and it says
"timing" without a word of copy. It also reuses two mechanisms the interface already
owns — the cooldown ring and the `deal` entrance — rather than inventing a third.

## Requirements

**R1**: The count is an object, in the game's own material.
- AC: a disc slab — ink outline at `--outline`, the hard offset shadow (kit-rules, RD-069)
- AC: every colour from the palette; no hex literal at a call site
- AC: it reads at arm's length on a phone: the numeral is the largest glyph on screen
- AC: **the arena stays visible around and behind it.** The disc is bounded, not a
      full-screen scrim — the whole point of `round-open` is that the world is on show

**R2**: Each number arrives, it does not merely appear.
- AC: a number enters past its resting size and settles back — the `deal` idiom already
      defined in the Kit, not a second easing invented here
- AC: the transition between numbers is one motion, not a crossfade of two glyphs
- AC: the motion is **CSS-driven, not per-frame**: nothing about the count may enter the
      render loop (kit-rules: nothing allocates or animates per frame that need not)

**R3**: The ring drains, so the second is visible without reading.
- AC: a full sweep per second, emptying as the second runs out
- AC: it reuses the cooldown ring's construction — `strokeDashoffset` against a known
      circumference — because that mechanism exists, is tested, and works on iOS
- AC: the ring's colour walks the status ramp as the count falls: ok at 3, hazard at 1.
      **The same ramp `round-status` defines**, so one idea is expressed once
- AC: under a stalled connection the ring holds rather than draining on a local clock —
      the count is the server's, never this device's (RD-065)

**R4**: GO is a release, not a fourth number.
- AC: at zero the disc punches outward and clears in well under half a second
- AC: nothing covers the arena at the instant the round becomes playable
- AC: the existing countdown sound fires per number and once at GO (audio, RD-068);
      no new voice is added

**R5**: It never lies about time.
- AC: the number shown is derived from the server's deadline (`countdownAt`), never
      ticked locally — two devices must show the same digit at the same moment (RD-065)
- AC: a unanimous skip that ends the intro early clears the count immediately; it does
      not run a phantom "1" over a round already in progress
- AC: a mid-match joiner who arrives during the count sees it, correctly, from wherever
      it has got to

**R6**: It costs nothing to have.
- AC: no new geometry, no new material, no new draw call (RD-028's rule: count the draw
      calls)
- AC: no per-frame DOM write — the number changes at most once a second, and the ring is
      a CSS transition rather than a value written every frame (RD-084's lesson: a HUD
      rebuilt every frame never animates)
- AC: no asset file of any kind (RD-001)

**R7**: It respects a player who has asked for less.
- AC: `prefers-reduced-motion` keeps every number and the ring's value, and drops the
      entrance, the punch-out and the sweep animation
- AC: what is *shown* is identical in both modes; only the movement differs

## Not this spec

- **A clock face with hands.** Reads as decoration at this size, and a sweeping hand at
  one revolution per second is a blur on a phone.
- **Per-minigame countdown art.** The shell draws one count; a round that wants its own
  is a round that has taken the shell's job (RD-009).
- **Counting anything but the intro.** The in-round clock is `round-status` R1, and it is
  a different object answering a different question.
