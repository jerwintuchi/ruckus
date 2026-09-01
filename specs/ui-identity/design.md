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
