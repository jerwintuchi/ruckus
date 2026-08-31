# Action Button — Tasks

- [x] T1 [R1, R2] — Rename the dash to a tumble in `hot-potato` and `scramble`
  Test: existing determinism and dash-timing properties still pass unchanged; a source
  assertion that no minigame declares a `buttonLabel` describing a mechanic it does not
  drive

- [x] T2 [R2] — The tumble pose in `src/client/src/kit/actor.ts`
  Test: `actor.test.ts` — a full rotation over `DASH_MS` and none outside it; the pose
  is a pure function of its inputs and finite for extreme ones; no other pose channel
  changes while tumbling

- [x] T3 [R4, P1, P2] — `action` on the snapshot, and the UI that renders it
  Test: `protocol.test.ts` — the field round-trips per player; `controls.test.ts` — the
  button shows the verb it is given and no minigame id or verb appears in the UI source
  as a branch (RD-009)

- [x] T4 [R3, P3] — The throw in `hot-potato`
  Test: `hot-potato.test.ts` — a thrown bomb is caught by the first living player in its
  path; a throw at a wall lands and the nearest player takes it; a throw with everyone
  else dead ends the round rather than stalling it (I8); the pass lock still applies;
  determinism holds over many seeds

- [x] T5 [R5] — Icons in `src/client/src/ui/icons.ts`
  Test: `controls.test.ts` — every verb the minigames can send has an icon; each is
  path data with no external reference; `kit_check --check` stays green

- [x] T6 [R6, P2] — The cooldown ring and the number
  Test: `controls.test.ts` — the ring sweeps with `readyIn` and is full at zero; the
  number shows one decimal and disappears at zero; the client runs no timer of its own,
  asserted against the source

- [x] T8 [R7] — Tap tumbles, hold throws, in `hot-potato`
  Test: `hot-potato.test.ts` — a tap tumbles even for the holder; a hold throws; one
  press is never two actions; a non-holder tumbles however long they press, and does so
  on the press rather than waiting for a release

- [x] T9 [R6] — The button reads at arm's length
  Test: `controls.test.ts` — the ring carries an explicit width and height rather than
  relying on `inset` (RD-031's mistake, in a smaller element); the number is positioned
  clear of the icon; the icon fills a majority of the button

- [x] T10 [R8] — Explicit pixel sizes, and a guard for the class
  Test: `controls.test.ts` — every replaced element in a control declares a pixel width
  and height and never `auto` or a percentage; the button declares a size rather than a
  minimum; `framing.test.ts` — the canvas, where this class started, declares a CSS size

- [ ] T7 — Played, on a phone
  Test: manual. Does the holder understand their button changed? That is the whole risk
  of a contextual control, and no test answers it.
