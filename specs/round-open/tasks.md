# Round Open — Tasks

- [x] T1 [R2, P1, P2, P3] — Unanimous skip on the server, in `src/server/src/match.ts`
  Test: `intro.test.ts` — property: for any pattern of skips (none, some, all, repeated,
  from non-members, from disconnected players) the intro ends at or before `INTRO_MS` and
  never later; unanimity ends it early; a disconnect mid-intro does not make unanimity
  unreachable

- [x] T2 [R2] — The `skip` message, in `src/shared/src/protocol.ts`
  Test: `protocol.test.ts` — parsed; idempotent per player; refused outside `ROUND_INTRO`;
  refused from a socket not in the room, replying to that socket only (I2)

- [x] T3 [R3, R4, P5] — Broadcast the round's state through the intro, in `src/server/src/net.ts`
  Test: `net.test.ts` — snapshots flow during `ROUND_INTRO`; the simulation does not step
  (positions are identical across every intro snapshot); the first differing snapshot is
  the first tick of `ROUND_PLAY`

- [x] T4 [R4] — No minigame animates during the count
  Test: `intro.test.ts` — property over every registered minigame: `elapsed` does not
  advance during the intro, so any time-driven flourish is still

- [ ] T5 [R3, P4] — Inert controls during the count, in `src/client/src/main.ts`
  Test: `predict.test.ts` — input during the count banks nothing, produces no `seq` the
  server acknowledges, and leaves nothing to reconcile at the first tick

- [ ] T6 [R1, R2] — The card, the count and the skip tally, in `src/client/src/ui/screens.ts`
  Test: `intro.dom.test.ts` — mounted: the rule renders verbatim and escaped; the round
  number is shown; tapping sends exactly one `skip` and shows the tally; the card closes
  on the dwell with no taps at all

- [ ] T7 [R3] — The count sits over the arena, not over a card
  Test: `intro.dom.test.ts` — mounted: while counting, no card covers the arena and the
  HUD is present; the count is derived from the server's deadline, not a local timer
  (RD-065)

- [x] T8 [R5] — A mid-match joiner joins the denominator when they join the roster
  Test: `intro.test.ts` — a player who arrives mid-round is not counted for that round's
  intro and is counted for the next

- [ ] T9 [R1–R4] — Played on a phone, at a full lobby
  Test: manual, and the question this spec exists for: when the round starts, does it feel
  like you were ready? Nine of eleven bugs in the session that produced `shoot.sh` were
  invisible to a green suite — this is a *feel* task and only a device answers it.
