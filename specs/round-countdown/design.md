# Round Countdown — Design

## The object

```
            ╭───────────────╮
          ╭─┤               ├─╮        ring: one sweep per second,
          │ │       3       │ │        draining clockwise, colour
          ╰─┤               ├─╯        walking ok -> warn -> hazard
            ╰───────────────╯
               ▚▚ hard offset shadow

   the arena is visible around it, and through the gap
```

One element tree, built once when the card is built, updated at most once a second:

```html
<div id="tick" class="tick">
  <svg viewBox="0 0 100 100"><circle id="tickRing" .../></svg>
  <div id="tickNum">3</div>
</div>
```

The disc is a slab: `background: var(--card)`, `border: var(--outline) solid var(--ink)`,
`box-shadow: var(--shadow)` — the same three declarations every card in the game carries,
so it belongs without a new rule being invented for it.

## Motion, all in CSS

Three named animations, and two of them already exist:

| Moment | Mechanism |
|---|---|
| a number lands | **`deal`**, the Kit's existing overshoot-and-settle — re-triggered by removing and re-adding the class |
| the second drains | a CSS `transition` on `stroke-dashoffset`, one second linear |
| GO | **`punch`**, the one new keyframe: scale past 1, opacity to 0, ~240 ms |

Nothing here is written from the render loop. `main.ts` already computes the digit once
per change (`lastCount`, RD-084's dedupe), and that call site is the only writer.

**Re-triggering `deal`** is the one fiddly part and is worth stating: a CSS animation does
not replay when the same class is already present. The reliable form is to remove the
class, force a reflow read, and add it back. That is a documented DOM idiom rather than a
hack, and it is why the number's arrival is a *class toggle* and not an inline style.

## The ring

Straight reuse of the action button's cooldown (`controls.ts`): a circle with
`stroke-dasharray` set to its circumference and `stroke-dashoffset` animated from 0 to
that circumference. That code already survives iOS, already avoids `stroke-dashoffset`'s
sub-pixel seams at small radii, and is already tested.

Colour comes from `countColour(n)` — **red, amber, green**, ending on green because green
means go (RD-113).

That is the inverse of `statusColour`, which `round-status` uses for the round clock, and
the two are deliberately separate functions. They look like one idea — "colour by how much
time is left" — and are opposite ones: a clock running out ends red, a race starting ends
green. Sharing a ramp between them would force one of the two to read backwards, and the
inversion looks like a bug unless the reasoning sits next to it. It does, at both.

## Where the value comes from

Unchanged, and deliberately so: `countdownAt(introEndsAt, now)` in the render loop, which
derives the digit from the server's deadline plus this device's monotonic clock (RD-065).
The count is not state — it is a projection of a deadline, which is why two phones agree.

The only new rule is R5's early clear: when `play` arrives, the count is cleared
immediately rather than allowed to finish, because a unanimous skip can end the intro
before the digit would have reached zero.

## Correctness properties

- **P1 — One writer.** Only the countdown's own update path touches `#tick`. Asserted by
  the render loop's existing dedupe: a repeat of the same digit writes nothing.
- **P2 — Server-derived.** For any pair of devices with clocks differing by up to a
  second, the digit shown for a given deadline is the same. `countdownAt` is already
  property-tested for this; this spec adds no second source.
- **P3 — Nothing per frame.** No DOM write, no allocation and no draw call occurs on a
  frame where the digit has not changed.
- **P4 — Reduced motion shows the same information.** The digit and the ring's *value* are
  identical with and without motion; only the animation differs.
- **P5 — It always leaves.** For every path out of the intro — the dwell expiring, a
  unanimous skip, a disconnect, a match ending — the count is gone before the arena
  becomes playable.

## Cost

Zero on the wire (no message changes), zero in the render loop (CSS owns the motion), and
zero in the Kit (no geometry, no material, no draw call). One SVG circle and two elements
exist for four seconds a round.

The honest caveat: an SVG stroke animation on a low-end Android is not free at the
compositor, and this machine cannot measure that. It is one small element, not a
full-screen effect, so the expected cost is negligible — and `bench.html` on a phone is
where that claim gets checked, not here.
