# Responsiveness — Design

Satisfies R1–R4.

## Two constants, and what they cost

```
TICK_HZ           20 -> 30      snapshots every 33ms instead of 50ms
INTERP_DELAY_MS  100 -> 70      the client renders 70ms behind
input send        50 -> 33ms    matched to the tick
```

Saving ≈ 55 ms of the ~150 ms, before RTT.

**Why the buffer can shrink only because the tick rose.** The buffer's job is to hold
enough frames that a late packet does not starve the render clock. At 20 Hz a 70 ms
buffer covers 1.4 snapshots — one late packet and the picture holds. At 30 Hz the same
70 ms covers 2.1, which is the same safety the old 100 ms bought at 20 Hz. The two
changes are one change; shipping the second alone trades a visible stall for the
latency.

**P1** (R1): determinism is untouched. The sim is already expressed in `TICK_DT`
seconds, so a faster tick changes how often it runs, not what it computes. The existing
per-minigame determinism properties are the test.

**P2** (R2): starvation still holds the last frame, never extrapolates (RD-004).

**P3** (R1): a search of the minigame sources finds no constant expressed in ticks
rather than seconds — asserted, because such a constant would silently retune every
round at 30 Hz. `minThicknessFor` already derives from `TICK_HZ` and so scales itself.

## The bandwidth number

A snapshot is 8 players x (quantised position, angle, flags) plus the minigame's own
`extra`. At 30 Hz that is 1.5x what it was. The exact figure is measured in T4 rather
than estimated here, because "small" is the kind of claim this project does not make
without a number.
