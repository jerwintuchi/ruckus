# Audio — Design

Satisfies R1–R5. *Not built. This is the shape, agreed in advance.*

## One file, one context

`src/client/src/kit/sound.ts` — the audio equivalent of `textures.ts`: a small set of
named generators over one lazily-created `AudioContext`.

```
blip(freq, ms)      a short sine with a fast decay — the countdown
thud(ms)            filtered noise plus a falling sine — an elimination
sting(up: boolean)  a three-note arpeggio — round end, match end
```

Each is a few nodes, connected, started, and left to be collected. Nothing is pooled,
because nothing is played often enough to justify a pool — and a pool that grows without
bound is the failure mode this note exists to prevent.

**P1** (R1): no audio file, no loader, no fetch. Asserted the way the Kit's ban already
is, with `kit_check` and a test that seeds a forbidden extension.

**P2** (R3): the context is created on the first user gesture and not before. A test
asserts the source constructs no `AudioContext` at module scope.

**P3** (R5): every trigger is a message the client already handles — `intro`, `roundEnd`,
`matchEnd`, and an elimination visible in a snapshot. No new wire message, and
`src/server/` gains nothing at all.

## Mute

A single boolean in `localStorage`, read once at startup, with the control in the lobby
next to the invite button. Not in `flow.ts`: it is a device preference, not part of the
screen state machine, and putting it there would put it in the totality property for no
benefit.
