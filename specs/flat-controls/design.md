# Flat Controls — Design

Satisfies R1–R3.

## One token, two meanings

`--shadow` stays and keeps its meaning: *paper on a table*. The change is that controls
stop spending it. There is no `--no-shadow` and no per-control override — a control
simply does not set the property.

## The press language

Was: `transform: translateY(4px)` plus a shortened `box-shadow`, i.e. the slab physically
travelling toward the table. With no shadow that reads as the control drifting.

Now, one rule for every control:

```
:active  ->  transform: scale(PRESS_SCALE)      /* .94 */
             background: colour-mix(fill, ink)  /* the ink soaks in */
```

**P1** (R2): the two channels are independent on purpose. Scale is the part that is
*felt*, and it is the part `prefers-reduced-motion` removes; the fill is the part that
is *seen*, and it survives reduced motion, so the feedback is never absent.

**P2** (R1): asserted structurally, not per-selector. A test walks every rule in
`UI_CSS` and `CONTROLS_CSS`, partitions the selectors into controls and slabs, and fails
if a control declares a shadow — so a control added next year is covered by a test
written today.

**P3** (R3): the knob's centring is a consequence, not a fix. Nothing about its position
changes; only the crescent goes.

## Where the rule is written down

`kit-rules.md` gains one line, because that is the file a contributor reads before adding
to the Kit, and a principle recorded only in a spec is a principle nobody meets.
