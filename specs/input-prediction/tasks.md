# Input Prediction — Tasks

- [x] T1 [R2, R5] — Put the three fields on the wire in `src/shared/src/protocol.ts`:
  `seq` on `input`, `ack` and `sm` on `snap`, `jumpSpeed` on `roundStart`
  Test: `protocol.test.ts` — a malformed `seq` is **coerced, never rejected** (I2: a bad
  input must not stall a round); `ack` and `sm` survive a round-trip; an old client's
  `input` with no `seq` still validates

- [x] T2 [R2] — Record the last applied input seq per player on the server and send it
  **per connection** in `src/server/src/net.ts`
  Test: `net.test.ts` — two connections in one room receive different `ack` values in
  the same tick, which is the property a broadcast field could not have

- [x] T3 [R1, R2, P1, P2, P3, P4] — `Predictor` in `src/client/src/predict.ts`:
  pending ring, `step`, `reconcile`, bounded replay
  Test: `predict.test.ts` — P2: with nothing pending, prediction equals the server
  position exactly; P1: replay is deterministic over many input sequences; P3:
  reconciling the same snapshot twice is a no-op; P4: `pending` never exceeds
  `MAX_PENDING` however long it runs unacknowledged

- [x] T4 [R3, P6] — Correction blending with `SNAP_DISTANCE` and `CORRECTION_MS`
  Test: `predict.test.ts` — a small error decays toward zero and is never applied whole
  in one frame; an error past `SNAP_DISTANCE` is taken at once; P6: the same correction
  over the same wall-clock time lands identically at 30 and at 120 fps

- [x] T5 [R1, R4, P5, P7] — Wire the predictor into `src/client/src/main.ts` and render
  the local slot from it, everyone else from the buffer
  Test: `predict.test.ts` — P5: no code path in the predictor writes `alive`, asserted
  against the source; P7: with prediction off the rendered position is identical to the
  snapshot path

- [x] T6 [R4] — The client still names no minigame
  Test: `states.test.ts` already asserts the shell names no minigame (RD-009); extend it
  to `predict.ts` so the predictor cannot start branching on one unnoticed

- [x] T7 [R6] — State the cost as numbers, not adjectives
  Test: `predict.test.ts` — replay is bounded by `MAX_PENDING` (P4); the bandwidth
  figure is recorded here against `responsiveness` T4's 41 KiB/s baseline
  **Bandwidth: measured, +1.4%.** Down, per client: `ack` and `sm` add ~19 B per
  snapshot at 30 Hz = **0.56 KiB/s**, against the 41 KiB/s worst case (`scramble` at
  8 players) `responsiveness` T4 measured. Up: `seq` adds ~10 B per input at 30 Hz =
  **0.29 KiB/s**. No field was added per player, only per recipient, which is why the
  cost does not scale with lobby size.
  **CPU: bounded, not amortised.** Replay is O(unacknowledged inputs), capped at
  `MAX_PENDING` = 64 — two seconds at 30 Hz. Asserted in `predict.test.ts` by driving
  640 unacknowledged inputs through and checking the queue never exceeds the cap, so
  the worst case is a fixed 64 `stepMovement` calls per snapshot, never a function of
  session length (P4).

- [x] T9 [R1, R3, R4] — Driven, before it is felt: the rounds and transitions the
  properties never entered (RD-075)
  Three defects behind a green 882: a falling player replayed back to `y = 0` and drawn
  standing on nothing; `facing` and `speed` left on the interpolation buffer so the body
  turned late and slid; and elimination snapping the rendered position 70 ms backwards
  rather than settling. Each sat at a boundary no property crossed — a round type, a
  channel, a state transition.
  Test: `predict.test.ts` — a fall is followed down in a round with no jump and the arc
  is still predicted in one with; facing follows the stick and holds when centred;
  freezing converges on the server rather than jumping to it

- [x] T10 [R1] — Smooth, not merely early (RD-077)
  Reported from the phone: the local player stuttered while the bots did not. Prediction
  stepped at `TICK_MS` and the renderer drew the raw simulated position, so the
  character moved at 30 Hz on a 60-120 Hz screen — the drawn position changed on 24 of
  61 frames at 60 fps, 28 of 120 at 120 fps. The bots were smooth because they were
  never predicted: they still come from the interpolation buffer.
  The simulation stays on `TICK_DT` (replay only matches the server at the server's
  timestep) and the render interpolates between the last two simulated states. After:
  57 of 61, and 115 of 120.
  Test: `predict.test.ts` — the drawn position moves on >90% of frames at both 60 and
  120 fps; alpha is clamped so nothing extrapolates past the newest step; a
  reconciliation still leaves a tween rather than flattening it

- [ ] T8 [R1, R3] — Felt on a phone, over the real network
  Test: manual, and the only test that matters for this spec. Does the stick feel
  attached to the thumb? And — the question prediction actually risks — does a shove in
  `scramble` or a bomb pass in `hot-potato` feel *wrong* now that the correction is
  visible? A mispredicted contact that reads as rubber-banding is a regression even if
  the millisecond count improved.
