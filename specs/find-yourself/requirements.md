# Find Yourself — Requirements

> **Eight paper figures, all the same size, and nothing says which one is you.**

*Written 2026-09-01. Not polish: vision pillar 1 is "understand it in five seconds", and
a player who cannot locate their own character has not understood anything yet.*

## The gap

The lobby marks your row (`.row.me`, lobby-flow R13). The results card marks your row.
The **round** — the only screen that matters while you are playing — marks nothing. The
client knows `mySlot` and has since `welcome`; it simply never draws it.

At two players this is a non-problem. At eight, in Hot Potato, with everyone in the same
paper idiom and the camera fixed far enough back to hold the whole arena, it is genuinely
possible to spend a round driving someone else's character until you die.

**R1**: You can find yourself in one glance, at any moment of any round.
- AC: the local player's character carries a marker no other character has
- AC: it is legible at the arena's fitted distance on a phone — this is the size the
      camera actually uses, not a comfortable one
- AC: it is in **your own player colour**, so the marker and your row in the lobby agree
- AC: it survives every round: the marker is rebuilt with the character at `ROUND_START`
      and cannot outlive its round (the RD-050 shape)

**R2**: It never becomes clutter or a second thing to read.
- AC: exactly one marker on screen, ever — it is *yours*, not a label for everyone
- AC: it does not occlude the character, the arena, or another player behind it
- AC: it goes when you go: an eliminated player is out and does not need finding
- AC: it costs no new wire traffic — `mySlot` and the snapshot's `slot` are enough
- AC: no new mesh per frame; it is built once with the character (kit-rules.md)

**R3**: A spectator is not given one.
- AC: a mid-round joiner is not on the roster and has no character, so there is nothing
      to mark and nothing that tries (the spectating R4 shape)

## Open question for whoever builds it

A caret above the head is the obvious answer and reads at distance. A ring on the ground
is less obtrusive but competes with the blob shadow, which is the depth cue Sweepers
depends on. The first is the proposal; the second is the fallback if the caret proves
noisy at eight players.
