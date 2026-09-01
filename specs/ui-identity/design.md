# UI Identity — Design

Satisfies R1–R4.

## The wordmark

Six letters, each its own inline slab, each tilted a degree or two in alternating
directions — the `deal` idiom the cards already use, applied to type. Colours are taken
from `PLAYER_COLOURS` by index, so the wordmark and the roster are the same palette by
construction rather than by choice.

**P1** (R1): built from spans and the existing tokens, not an SVG and not a font file.
The fallback is the plain word, because the letters are text — a webfont that never
arrives costs the tilt, not the name.

## Rolling scores

`rollTo(el, from, to, ms)` in `src/client/src/ui/hud.ts` — one function, driven by
`requestAnimationFrame`, that writes integers only.

**P2** (R2): the element's **final** value is written first and the animation walks
backwards from the old one, so any interruption at any point leaves the correct number.
That is the opposite of the obvious implementation and it is why the "interrupted card"
AC is satisfiable at all.

**P3** (R2): a player whose score did not change is never handed to `rollTo`, so
stillness costs nothing and means something.

## The slot strip

Eight chips from `PLAYER_COLOURS`, filled where a slot is taken. Rendered from the same
`players` array `renderScores` uses.

**P4** (R3): one source, two views. A test asserts the strip and the rows agree on the
count for any roster, including gaps left by a player who left.

**P5** (R3): the strip is `display:none` under the very short tier if measurement says it
does not fit — the eight rows and the room code win, because they are what the round
needs. Decided by measurement, not by preference.

## Out, on the board

A third row state beside `.gone` (disconnected). Different ink: `gone` is faded because
the player is absent; `out` is present and finished.

**P6** (R4): the two states are asserted to differ visually, since "eliminated" and
"disconnected" reading the same is worse than showing neither.

## Your colour, on the controls only

Two pure functions in `src/client/src/kit/palette.ts`, beside the colours they operate on:

```
tint(colour, t)        mix toward PAPER.card; text buttons use TINT_FOR_LABEL = 0.45
readableInk(colour)    PAPER.ink or PAPER.card, whichever has more contrast
```

**P7** (R5): both are pure and take the colour, so they can be asserted over the whole
palette rather than over one example. The test computes real WCAG relative luminance —
not a hand-picked pair — and fails if any of the eight drops below its threshold. That
is the difference between a contrast rule and a contrast intention.

**P8** (R5): the value reaches CSS as **custom properties on the root**
(`--mine`, `--mine-tint`, `--mine-ink`), set once when the slot is known. Not threaded
through every rule: one write, and every control that spends `var(--mine)` follows. It is
also what makes the fallback trivial — before a slot, the properties simply hold the
highlight and the ink they hold today.

**P9** (R5): `flat-controls` supplies the *shape* of a control and this supplies its
*colour*. Neither knows about the other: a control sets `background: var(--mine)` and
inherits the flatness from the button rule.

**P10** (R5): the blast radius is the controls, and a test says so — no `.card`,
`.overlay`, `#hud`, `.gauge`, `.toast` or body rule may reference `--mine`. Scope stated
as a rule rather than as care, because "only the buttons" is the kind of intent that
erodes one convenient exception at a time.

