# In-Game Menu — Tasks

- [x] T1 [R2, P1, P2] — Master gain and a stored step in `src/client/src/kit/sound.ts`:
  `VOLUME_STEPS`, `VOLUME_KEY`, a proxy `Ctx` so no voice changes
  Test: `sound.test.ts` — the gain reaches the destination through the master node;
  P1: muting leaves the chosen level intact and unmuting returns to it; P2: a corrupt
  or out-of-range stored value falls back to FULL, never to silence

- [x] T2 [R1, R5, P5, P6] — The panel and its opener in `src/client/src/ui/`
  Test: `menu.dom.test.ts` — mounted: the opener is in the HUD and not in any corner a
  control uses; the panel is a slab and its controls carry no shadow; the chosen
  segment is marked and exactly one is

- [x] T3 [R3, P3] — Quit: close the socket, reset to the main menu
  Test: `menu.dom.test.ts` and `check.test.ts` — P3: quitting introduces no new
  `ClientMsg` variant, asserted against the protocol; the client returns to the menu
  state with no room code left behind

- [x] T4 [R4, P4] — The menu is inert with respect to the round
  Test: `menu.dom.test.ts` — opening and closing sends nothing on the wire and leaves
  the predictor untouched; the arena is still rendered behind it

- [x] T5 [R1, R5] — Seen, on both profiles
  Test: `tools/visuals.sh` — a `menu-ingame` state in the gallery, shot on the phone and
  portrait profiles; the manifest gains exactly those rows
  **What the picture caught.** The opener was first in `#hud`, which centres its
  children, so it drew beside the round label in the middle of the screen — R1 names
  the top-left corner and the code put it nowhere near it. Pinned absolute against the
  same safe-area padding `#hud` already spends, so the gauges stay centred. Moving it
  there then put it under the gallery's own walker, which had held the top-left since
  it was written; the walker moved to the top-right, because a harness that photographs
  its own chrome sitting on a control is worse than no harness.

- [ ] T6 [R1, R2, R3] — Used on a phone
  Test: manual. Can you find it without being told? Is a four-step volume enough, or
  does it want to be finer? And the one that matters: does leaving and rejoining from
  the main menu actually work, on a real network, mid-match?
