# Spectating — Tasks

- [~] T1 [R1] — **SUPERSEDED by `round-lifecycle` T3** (RD-049). Was: grey the character
  and leave it standing. Shipped, played, and read as a player stuck rather than out.
  Replaced by blink-and-vanish, whose tests live with the spec that owns it.

- [x] T2 [R2, P3] — A live waiting indicator in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — the waiting card names the round being waited for and
  carries the animated element; `kit.test.ts` — the dots are a CSS animation and are
  removed under `prefers-reduced-motion` while the text stays; `protocol.test.ts` —
  no new message exists

- [ ] T3 [R3] — Watched, on a phone
  Test: manual. Two thirds of a Hot Potato round is spent eliminated. Is it worth
  watching, and can you tell who is still in?
