# Spectating — Tasks

- [~] T1 [R1] — **SUPERSEDED by `round-lifecycle` T3** (RD-049). Was: grey the character
  and leave it standing. Shipped, played, and read as a player stuck rather than out.
  Replaced by blink-and-vanish, whose tests live with the spec that owns it.

- [x] T2 [R2, P3] — A live waiting indicator in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — the waiting card names the round being waited for and
  carries the animated element; `kit.test.ts` — the dots are a CSS animation and are
  removed under `prefers-reduced-motion` while the text stays; `protocol.test.ts` —
  no new message exists

- [x] T4 [R4] — `amOnRoster` in `src/client/src/flow.ts`, applied at `roundStart` in
  `src/client/src/main.ts`
  Test: `flow.test.ts` — a slot on the roster plays, one absent from it watches, and
  the unassigned slot (-1, before `welcome`) never counts as playing; `main` is
  asserted to gate `controls.show` on it rather than calling it unconditionally

- [x] T3a [R2] — A mid-round joiner is told they are watching, and from when
  Found by playing it: the joiner DOES get `roundStart` (the server sends the round in
  progress so there is something to watch), which sets `roundSeen` and takes away the
  very waiting card that explained the wait. The arena then plays on with no controls
  and no explanation. A chip in the HUD rather than the overlay, because R3 wants the
  arena visible while you wait.
  Test: `ui/spectate.dom.test.ts` — mounted, not asserted as a string: it names the
  round you are in from, never promises one past the last, survives the per-frame HUD
  re-render, clears so it cannot outlive its round, and is never a blocking overlay

- [ ] T3 [R3] — Watched, on a phone
  Test: manual. Two thirds of a Hot Potato round is spent eliminated. Is it worth
  watching, and can you tell who is still in?
