# Action Button — Tasks

- [ ] T1 [R1, R2] — Rename the dash to a tumble in `hot-potato` and `scramble`
  Test: existing determinism and dash-timing properties still pass unchanged; a source
  assertion that no minigame declares a `buttonLabel` describing a mechanic it does not
  drive

- [ ] T2 [R2] — The tumble pose in `src/client/src/kit/actor.ts`
  Test: `actor.test.ts` — a full rotation over `DASH_MS` and none outside it; the pose
  is a pure function of its inputs and finite for extreme ones; no other pose channel
  changes while tumbling

- [ ] T3 [R4, P1, P2] — `action` on the snapshot, and the UI that renders it
  Test: `protocol.test.ts` — the field round-trips per player; `controls.test.ts` — the
  button shows the verb it is given and no minigame id or verb appears in the UI source
  as a branch (RD-009)

- [ ] T4 [R3, P3] — The throw in `hot-potato`
  Test: `hot-potato.test.ts` — a thrown bomb is caught by the first living player in its
  path; a throw at a wall lands and the nearest player takes it; a throw with everyone
  else dead ends the round rather than stalling it (I8); the pass lock still applies;
  determinism holds over many seeds

- [ ] T5 [R5] — Icons in `src/client/src/ui/icons.ts`
  Test: `controls.test.ts` — every verb the minigames can send has an icon; each is
  path data with no external reference; `kit_check --check` stays green

- [ ] T6 [R6, P2] — The cooldown ring and the number
  Test: `controls.test.ts` — the ring sweeps with `readyIn` and is full at zero; the
  number shows one decimal and disappears at zero; the client runs no timer of its own,
  asserted against the source

- [ ] T7 — Played, on a phone
  Test: manual. Does the holder understand their button changed? That is the whole risk
  of a contextual control, and no test answers it.
