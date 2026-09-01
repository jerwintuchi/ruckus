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

- [x] T4 [R5] — The state gallery: `src/client/states.html`, `src/client/src/states.ts`
  and `tools/gallery.sh`
  Test: `states.test.ts` — there is a state for every action verb the server can send,
  and for each transient screen that has already produced a bug (the toast, the
  cooldown sweep, the countdown); the page is a separate entry that `main.ts` never
  imports; it names no minigame, by wire id or display name
  *Found RD-059 on its first run — the cooldown number was drawn on top of the ring,
  dark ink on dark ink, at the one moment the number is worth reading. No live
  screenshot had ever contained a cooldown at all.*

- [x] T5 [R6] — Mount the DOM in tests: `jsdom` as a dev dependency, opted into per
  file, and `src/client/src/ui/controls.dom.test.ts`
  Test: the file itself — the button keeps its children through `show`, every verb
  draws from a cold mount, the cooldown arms and clears from the snapshot alone, and a
  round with no label draws no button. **Verified by reintroducing the bugs:** RD-054
  fails one test, RD-042 fails six.

