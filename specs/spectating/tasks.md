# Spectating — Tasks

- [x] T1 [R1, P1, P2] — Grey rather than hide, in `src/client/src/kit/character.ts`
  Test: `character.test.ts` — an eliminated character is still visible and still in the
  scene; every non-ink material has changed and every ink material has not; the change
  is idempotent, since `setEliminated` is called on every snapshot while a player is out

- [x] T2 [R2, P3] — A live waiting indicator in `src/client/src/ui/screens.ts`
  Test: `screens.test.ts` — the waiting card names the round being waited for and
  carries the animated element; `kit.test.ts` — the dots are a CSS animation and are
  removed under `prefers-reduced-motion` while the text stays; `protocol.test.ts` —
  no new message exists

- [ ] T3 [R3] — Watched, on a phone
  Test: manual. Two thirds of a Hot Potato round is spent eliminated. Is it worth
  watching, and can you tell who is still in?
