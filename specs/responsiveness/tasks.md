# Responsiveness — Tasks

- [x] T1 [R1, P1, P3] — `TICK_HZ` 20 -> 30 in `src/shared/src/constants.ts`, and update
  **netcode-invariant I5** in `.claude/rules/netcode-invariants.md` in the same commit
  Test: every minigame's determinism property still passes at the new rate;
  `constants.test.ts` — no minigame source expresses a duration in ticks rather than
  seconds (P3, asserted against the sources, since such a constant would retune every
  round silently)

- [x] T2 [R2, P2] — `INTERP_DELAY_MS` 100 -> 70 in `src/shared/src/constants.ts`
  Test: `net.test.ts` — the buffer still covers at least two snapshots at the new tick
  rate, asserted as a relationship between the constants rather than a bare number;
  starvation still **holds** the newest frame and never extrapolates (P2)

- [x] T3 [R3] — Send input at the tick rate in `src/client/src/main.ts`
  Test: `constants.test.ts` — the send interval is derived from `TICK_MS`, not a
  literal, so the two can never drift apart again

- [~] T4 [R4] — Measure, do not assume
  **Bandwidth: measured.** Per client at 8 players, JSON on the wire:
  `hot-potato` 708 B/snap = 13.8 -> 20.7 KiB/s; `sweepers` 878 B = 17.1 -> 25.7;
  `falling-floor` 907 B = 17.7 -> 26.6; `scramble` 1386 B = 27.1 -> 40.6 KiB/s.
  The worst case is **41 KiB/s down per client**, 325 KiB/s for a full lobby of 8.
  Fine on WiFi and on any mobile data worth the name — but it is a number now, not
  the word "small".
  **p95 on a phone: still owed**, with `visual-direction` T18. That half keeps this
  box open.

- [ ] T5 [R1, R2] — Played on a phone, over the real network
  Test: manual. Does the stick feel closer to the thumb? The question this spec exists
  for is not the millisecond count, it is whether a player notices.
