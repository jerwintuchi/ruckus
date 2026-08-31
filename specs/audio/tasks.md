# Audio — Tasks

**Not started.** Written so the shape is agreed before anyone builds it.

- [ ] T1 [R1, R4, P1] — `src/client/src/kit/sound.ts`: `blip`, `thud`, `sting` over one
  lazily-created context
  Test: `sound.test.ts` — each generator returns a node graph of the expected shape and
  duration without a real `AudioContext` (inject it, as the renderer does not have to
  and this must); no generator exceeds 400 ms; `kit_check --check` stays green

- [ ] T2 [R3, P2] — Gesture gating and a persisted mute
  Test: `sound.test.ts` — nothing constructs a context at module scope (asserted against
  the source); the first gesture creates exactly one; mute survives a reload, simulated
  through an injected storage

- [ ] T3 [R2, R5, P3] — Wire the four moments in `src/client/src/main.ts`
  Test: `sound.test.ts` — each of `intro`, elimination, `roundEnd`, `matchEnd` triggers
  its sound through an injected player; **no new wire message exists**, asserted by
  `protocol.test.ts` over the `ServerMsg` union

- [ ] T4 [R4] — Measured on a phone, next to the bench
  Test: manual. p95 with sound and without, on the device, since RD-028's lesson is
  that "it costs nothing" is a claim requiring a number

- [ ] T5 [R2] — Heard in a real room
  Test: manual. Does it help, or is it noise on top of noise? Eight eliminations in
  quick succession is the case to listen to.
