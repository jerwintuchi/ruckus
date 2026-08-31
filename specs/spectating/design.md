# Spectating — Design

Satisfies R1–R3.

## Eliminated is an event

`Character.setEliminated` records the frame time and blinks from it; the body leaves
when the blink ends. The implementation and its properties live in
`specs/round-lifecycle/` (R3, P3, P4), which superseded the muted-costume version
described here originally (RD-049).

## The wait has a shape

The waiting card gains three dots that cycle, and the round it is waiting for. Both are
CSS: the dots are one keyframe animation, and the round number the client already has
from `intro`. No new message, no timer, nothing to keep in sync.

**P3** (R2): no wire traffic is added — asserted against `ServerMsg`.

| name | value | why |
|---|---|---|
| `OUT_COLOUR` | `PAPER.textDim` | grey enough to read as out, dark enough to keep its shape |
| `DOT_CYCLE_MS` | 1200 | slow enough to read as patience rather than as urgency |
