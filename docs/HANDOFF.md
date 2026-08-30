# Handoff

> **Overwritten every session — never appended.** If `git log -1` is not
> `36c0399`, work has happened since this was written: distrust it and read
> `docs/technical/spec-status.md` (derived) instead.

*Written 2026-08-31 01:42 · branch `master` ·
HEAD `36c0399` — feat(playtest): the link is the invite — every URL carries the room code · 18 uncommitted file(s)*

## What I was doing

Wrote and mostly built specs/lobby-flow (10/12): a create message that mints a server-side code, join that no longer creates rooms, a code cooldown, and a pure client state machine in flow.ts. 352 tests.

## What is half-finished

lobby-flow T11 (apply the paper theme to menu/join/lobby) and T12 (play it for real) are open. specs/visual-direction is still 0/16 — T11 depends on its T13 panel primitives, so doing visual-direction Phase D first would make T11 nearly free.

## The very next action

Either lobby-flow T11+T12, or visual-direction Phase D (T13-T17) which subsumes most of T11. Then play it: pnpm playtest:solo.

## Gotchas

join NO LONGER creates rooms — that was the ghost-room bug. Nobody picks a code now, so --room is gone from playtest.sh; bots create a room and report ROOM=XXXX which the script greps. CODE_ALPHABET is letters AND digits 2-9: normalizeCode stripping to [^A-Z] ate the digit out of a quarter of all codes. flow.ts is pure and DOM-free — keep it that way, ui.render(state) only draws.

## Uncommitted when this was written

- `LAUDE.md`
- `docs/DECISION_LOG.md`
- `docs/technical/spec-status.md`
- `docs/technical/status.html`
- `src/client/src/main.ts`
- `src/client/src/net.ts`
- `src/client/src/ui.test.ts`
- `src/client/src/ui.ts`
- `src/server/src/net.ts`
- `src/shared/src/constants.ts`
- `src/shared/src/protocol.test.ts`
- `src/shared/src/protocol.ts`

---

*Durable history goes in `docs/DECISION_LOG.md` (append-only). What shipped is
derived by `tools/spec_status.py`. This file is neither — it is only ever "where the
hands were".*
