# Spectating — Design

Satisfies R1–R3.

## Eliminated is a costume change, not a disappearance

`Character.setEliminated` swaps every non-ink material for one muted colour and leaves
everything else exactly where it is. The ink edges stay, so the silhouette still reads;
the fill goes flat and grey, so the player reads as *out* at a glance across a room.

Materials are compared against `inkMaterial()` rather than by index, because a slab's
material array is indexed by *group* once identical neighbours coalesce (RD-028) — an
index-based swap would recolour the outline on some slabs and not others.

**P1** (R1): an eliminated character is still in the scene and still visible; only its
colours change. Asserted, because the previous implementation hid it while a comment
directly above claimed the opposite.

**P2** (R1): the ink outline is untouched.

## The wait has a shape

The waiting card gains three dots that cycle, and the round it is waiting for. Both are
CSS: the dots are one keyframe animation, and the round number the client already has
from `intro`. No new message, no timer, nothing to keep in sync.

**P3** (R2): no wire traffic is added — asserted against `ServerMsg`.

| name | value | why |
|---|---|---|
| `OUT_COLOUR` | `PAPER.textDim` | grey enough to read as out, dark enough to keep its shape |
| `DOT_CYCLE_MS` | 1200 | slow enough to read as patience rather than as urgency |
