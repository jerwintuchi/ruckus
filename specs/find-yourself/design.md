# Find Yourself — Design

Satisfies R1–R3.

## A caret, not a label

A small triangular slab above the crown, in the player's colour with the Kit's ink edge
— the same construction as every other part of a character, so it needs no new material
and no new idiom. It bobs on the character's existing pose phase rather than on a clock
of its own, so it moves *with* the figure instead of alongside it.

```
Character.setMine(colour)   builds the caret once, at construction
Character.update(...)       the caret rides the existing bob; no new maths
```

**P1** (R2): `Renderer.syncPlayers` already receives every player each frame and already
knows which slot is which. It gains `mine: number` and calls `setMine` exactly once, when
the character is built — never per frame, so there is no path by which two markers exist.

**P2** (R1): the marker is a child of the character's pivot, so `ROUND_START` rebuilding
characters destroys it for free. Nothing needs cleaning up, which is the property RD-050
was about.

**P3** (R2): the caret is hidden by the same blink that removes an eliminated player,
because it is inside the group that blink already hides.

**P4** (R1): size is derived from `BODY.height`, not a literal, so it scales with the
character if the proportions ever change.

## Not on the wire

`mySlot` arrives at `welcome` and every snapshot carries `slot`. The server learns
nothing and sends nothing new.
