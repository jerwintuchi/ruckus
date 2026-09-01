# Audio — Tasks

T1–T3 built. T4 and T5 need a phone and a room.

- [x] T1 [R1, R4, P1] — `src/client/src/kit/sound.ts`: `blip`, `thud`, `sting` over one
  lazily-created context
  Test: `sound.test.ts` — each generator returns a node graph of the expected shape and
  duration without a real `AudioContext` (inject it, as the renderer does not have to
  and this must); no generator exceeds 400 ms; `kit_check --check` stays green

- [x] T2 [R3, P2] — Gesture gating and a persisted mute
  Test: `sound.test.ts` — nothing constructs a context at module scope (asserted against
  the source); the first gesture creates exactly one; mute survives a reload, simulated
  through an injected storage

- [x] T3 [R2, R5, P3] — Wire the four moments in `src/client/src/main.ts`
  Test: `sound.test.ts` — each of the four moments reaches a generator through an
  injected context; the elimination is read off `alive` between snapshots, so it is an
  EVENT and not a thud thirty times a second; that memory is cleared at a round
  boundary; **no new wire message exists** — asserted over `protocol.ts` and over every
  server source, which must not contain the word at all;
  `mute.dom.test.ts` — the control keeps its icon through every toggle (RD-042 again:
  two swapping paths inside a button is the same hazard)

- [ ] T4 [R4] — Measured on a phone, next to the bench
  Test: manual. p95 with sound and without, on the device, since RD-028's lesson is
  that "it costs nothing" is a claim requiring a number

- [ ] T5 [R2] — Heard in a real room
  Test: manual. Does it help, or is it noise on top of noise? Eight eliminations in
  quick succession is the case to listen to.
