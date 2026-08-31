# Automated Playtest — Tasks

- [x] T1 [R1, P2] — `?auto=` in `src/client/src/main.ts` and `setSynthetic` in `input.ts`
  Test: `input.test.ts` — synthetic input feeds the ordinary `read()`; a session without
  the parameter is unaffected and `synthetic` is null; real touch still works alongside

- [x] T2 [R2, P1] — `tools/shoot.sh`
  Test: run it against a live room and read the image; `kit_check --check` stays green
  with no ALLOW_PATHS entry, asserted in `check.test.ts`

- [x] T3 [R3, R4] — Write down what it cannot see
  Test: `docs/` — the limits are recorded where the next person will look, so a green
  screenshot is never mistaken for a passed playtest
