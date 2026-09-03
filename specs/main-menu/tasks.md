# Main Menu — Tasks

- [ ] T1 [R1, P3] — Remember the name on the device, in `src/client/src/ui/screens.ts`
  Test: `menu.dom.test.ts` — mounted: a stored name pre-fills the field; a fresh device
  shows it empty; with `localStorage` throwing on read AND write the menu still renders,
  accepts a name and hosts

- [ ] T2 [R2, P2] — Options and Exit on the menu, in `src/client/src/ui/screens.ts`
  Test: `menu.dom.test.ts` — mounted: Options opens the SAME panel instance the in-game
  menu opens; Exit reaches the end state and offers a way back; neither is larger than
  HOST or JOIN

- [ ] T3 [R3, R4] — The wordmark and layout, in `src/client/src/ui/kit.ts`
  Test: `menu.dom.test.ts` — mounted: the wordmark is the largest text node on the screen;
  every tappable clears `UI.minTarget` as COMPUTED; no hex literal appears in the menu's
  CSS (the palette guard `kit.test.ts` already applies)

- [ ] T4 [R5] — `settle`, `swap` and `press` as one vocabulary, in `src/client/src/ui/kit.ts`
  Test: `kit.test.ts` — the three are defined once and referenced by name; every entrance
  in the menu uses one of them; under `prefers-reduced-motion` each keeps its settled
  position and drops only movement

- [ ] T5 [R3, R4] — Seen on the phone, portrait and landscape
  Test: manual, plus `tools/shoot.sh` for the still. Does it read as Ruckus in the first
  second? Is the tagline funny once and not twice? Does the thumb reach HOST without
  the hand moving?
